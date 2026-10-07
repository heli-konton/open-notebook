"""Persistent, flat notebook and podcast collections."""

from typing import Literal

from open_notebook.database.repository import ensure_record_id, repo_query
from open_notebook.exceptions import InvalidInputError, NotFoundError

FolderKind = Literal["notebook", "podcast"]


def record_id(value: str, table: str):
    if not value.startswith(f"{table}:") or not value.split(":", 1)[1]:
        raise InvalidInputError(f"Expected a {table} record ID")
    try:
        return ensure_record_id(value)
    except Exception as exc:
        raise InvalidInputError("Invalid record ID") from exc


async def get_folder(folder_id: str):
    rows = await repo_query(
        "SELECT id, name, kind FROM $id;", {"id": record_id(folder_id, "folder")}
    )
    if not rows:
        raise NotFoundError("Folder not found")
    return rows[0]


async def assign_folder(kind: FolderKind, item_id: str, folder_id: str | None):
    table = "notebook" if kind == "notebook" else "episode"
    item = record_id(item_id, table)
    if not await repo_query("SELECT id FROM $id;", {"id": item}):
        raise NotFoundError("Item not found")
    if folder_id is not None:
        folder = await get_folder(folder_id)
        if folder["kind"] != kind:
            raise InvalidInputError("Folder kind does not match item")
    # Validation and write share a transaction to refuse a concurrently deleted
    # folder. The delete event clears assignments in that same DB transaction.
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


async def list_folders(kind: FolderKind):
    return await repo_query(
        "SELECT id, name, kind FROM folder WHERE kind = $kind ORDER BY name;",
        {"kind": kind},
    )


async def create_folder(name: str, kind: FolderKind):
    return (
        await repo_query(
            "CREATE folder SET name = $name, kind = $kind RETURN id, name, kind;",
            {"name": name, "kind": kind},
        )
    )[0]


async def rename_folder(folder_id: str, name: str):
    await get_folder(folder_id)
    rows = await repo_query(
        "UPDATE $id SET name = $name RETURN id, name, kind;",
        {"id": record_id(folder_id, "folder"), "name": name},
    )
    if not rows:
        raise NotFoundError("Folder not found")
    return rows[0]


async def delete_folder(folder_id: str):
    await get_folder(folder_id)
    await repo_query("DELETE $id;", {"id": record_id(folder_id, "folder")})
