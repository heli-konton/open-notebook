"""Persist flat notebook and podcast collections and their assignments.

Assignment transactions and folder-delete events write the same durable,
per-folder guard record. Keeping that record after deletion prevents stale
snapshots from committing dangling assignments on either commit ordering.
"""

from typing import Any, Literal

from surrealdb import RecordID

from open_notebook.database.repository import ensure_record_id, repo_query
from open_notebook.exceptions import InvalidInputError, NotFoundError

FolderKind = Literal["notebook", "podcast"]


def record_id(value: str, table: str) -> RecordID:
    """Validate an identifier before binding it to a database query.

    Args:
        value: User-supplied record identifier, including its table prefix.
        table: Required table name.

    Returns:
        The parsed SurrealDB record identifier.

    Raises:
        InvalidInputError: If the prefix, record key, or syntax is invalid.
    """
    if not value.startswith(f"{table}:") or not value.split(":", 1)[1]:
        raise InvalidInputError(f"Expected a {table} record ID")
    try:
        return ensure_record_id(value)
    except Exception as exc:
        raise InvalidInputError("Invalid record ID") from exc


async def get_folder(folder_id: str) -> dict[str, Any]:
    """Fetch a folder's public fields without locking its record.

    Args:
        folder_id: Identifier of the folder to fetch.

    Returns:
        A dictionary containing the folder's id, name, and kind.

    Raises:
        InvalidInputError: If the identifier is invalid.
        NotFoundError: If the folder does not exist.
        Exception: If database execution fails.
    """
    rows = await repo_query(
        "SELECT id, name, kind FROM $id;", {"id": record_id(folder_id, "folder")}
    )
    if not rows:
        raise NotFoundError("Folder not found")
    return rows[0]


async def assign_folder(
    kind: FolderKind, item_id: str, folder_id: str | None
) -> dict[str, str | None]:
    """Move an existing item to a compatible folder or leave it Unfiled.

    Validation, the guard-version write, and the item update are atomic. Folder
    deletion writes the same guard in its delete event; only one competing
    snapshot can commit. The guard is never deleted, since deleting the conflict
    key can allow a stale update to recreate it on SurrealDB 2's memory backend.
    No write is retried: a vanished item or folder is reported as not found.
    Other transaction conflicts propagate so callers can retry from fresh state.

    Args:
        kind: Collection kind, determining the notebook or episode table.
        item_id: Identifier of the existing item to move.
        folder_id: Compatible folder identifier, or None to unassign the item.

    Returns:
        The item identifier and its committed folder assignment.

    Raises:
        InvalidInputError: If an identifier is invalid or folder kinds differ.
        NotFoundError: If the item or target folder is missing or deleted.
        Exception: If a transaction conflicts or database execution fails.
    """
    table = "notebook" if kind == "notebook" else "episode"
    item = record_id(item_id, table)
    if not await repo_query("SELECT id FROM $id;", {"id": item}):
        raise NotFoundError("Item not found")
    if folder_id is not None:
        folder = await get_folder(folder_id)
        if folder["kind"] != kind:
            raise InvalidInputError("Folder kind does not match item")
    # A SELECT alone cannot detect the competing delete's invisible assignment.
    # The durable guard forces both operations into one write-conflict domain.
    try:
        await repo_query(
            """
            BEGIN TRANSACTION;
            IF $folder != NONE AND (SELECT VALUE kind FROM ONLY $folder) != $kind {
                THROW 'Folder no longer available';
            };
            IF array::len(SELECT id FROM $item) = 0 {
                THROW 'Item no longer available';
            };
            IF $folder != NONE {
                UPDATE type::thing("folder_assignment_guard", <string>$folder)
                    SET version = version + 1;
            };
            UPDATE $item SET folder_id = $folder_id;
            COMMIT TRANSACTION;
        """,
            {
                "item": item,
                "folder": record_id(folder_id, "folder") if folder_id else None,
                "folder_id": folder_id,
                "kind": kind,
            },
        )
    except Exception as exc:
        # Some SDK versions report only the first cancelled statement and hide
        # the transaction's THROW text. Recheck existence without retrying a
        # write; a vanished target must be a 404, never a resurrected record.
        if not await repo_query("SELECT id FROM $id;", {"id": item}):
            raise NotFoundError("Item no longer available") from exc
        if folder_id is not None:
            await get_folder(folder_id)
        if "Folder no longer available" in str(exc):
            raise NotFoundError("Folder no longer available") from exc
        if "Item no longer available" in str(exc):
            raise NotFoundError("Item no longer available") from exc
        raise
    return {"id": item_id, "folder_id": folder_id}


async def list_folders(kind: FolderKind) -> list[dict[str, Any]]:
    """List the public fields of folders belonging to one collection kind.

    Args:
        kind: Collection kind to include.

    Returns:
        Folder dictionaries sorted by name, or an empty list.

    Raises:
        Exception: If database execution fails.
    """
    return await repo_query(
        "SELECT id, name, kind FROM folder WHERE kind = $kind ORDER BY name;",
        {"kind": kind},
    )


async def create_folder(name: str, kind: FolderKind) -> dict[str, Any]:
    """Create a folder and atomically initialize its guard through a DB event.

    Args:
        name: Trimmed, nonempty folder name validated by the request model.
        kind: Collection kind accepted by this folder.

    Returns:
        The created folder's public id, name, and kind fields.

    Raises:
        Exception: If schema validation or database execution fails.
    """
    return (
        await repo_query(
            "CREATE folder SET name = $name, kind = $kind RETURN id, name, kind;",
            {"name": name, "kind": kind},
        )
    )[0]


async def rename_folder(folder_id: str, name: str) -> dict[str, Any]:
    """Update an existing folder's display name without moving its content.

    Args:
        folder_id: Identifier of the folder to rename.
        name: Trimmed, nonempty name validated by the request model.

    Returns:
        The folder's public fields after the update.

    Raises:
        InvalidInputError: If the identifier is invalid.
        NotFoundError: If the folder is absent or the update returns no record.
        Exception: If schema validation or database execution fails.
    """
    await get_folder(folder_id)
    rows = await repo_query(
        "UPDATE $id SET name = $name RETURN id, name, kind;",
        {"id": record_id(folder_id, "folder"), "name": name},
    )
    if not rows:
        raise NotFoundError("Folder not found")
    return rows[0]


async def delete_folder(folder_id: str) -> None:
    """Delete a folder and atomically unfile its content through a DB event.

    The event writes the durable assignment guard before clearing assignments.
    A competing assignment therefore aborts either this deletion or the move;
    it cannot leave content pointing at a deleted folder. Content and generated
    audio are preserved. The guard remains as a conflict tombstone.

    Args:
        folder_id: Identifier of the folder to delete.

    Returns:
        None after the deletion commits.

    Raises:
        InvalidInputError: If the identifier is invalid.
        NotFoundError: If the folder does not exist at validation time.
        Exception: If a transaction conflicts or database execution fails.
    """
    await get_folder(folder_id)
    await repo_query("DELETE $id;", {"id": record_id(folder_id, "folder")})
