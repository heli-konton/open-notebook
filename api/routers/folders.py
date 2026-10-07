"""Expose validated CRUD and assignment endpoints for flat collections.

Routers delegate persistence and concurrency protection to folders_service.
Typed domain errors are translated by the application's global error handlers.
"""

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field, field_validator

from api import folders_service as service
from api.folders_service import FolderKind

router = APIRouter()


class FolderName(BaseModel):
    """Validate a folder display name for creation or renaming.

    Attributes:
        name: Trimmed, nonempty name containing at most 100 characters.
    """

    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=100)

    @field_validator("name", mode="before")
    @classmethod
    def trim_name(cls, value: Any) -> Any:
        """Remove surrounding whitespace before Pydantic validates the name.

        Args:
            value: Raw input supplied for the name field.

        Returns:
            A trimmed string, or the unchanged value for type validation.
        """
        return value.strip() if isinstance(value, str) else value


class FolderCreate(FolderName):
    """Validate the fields required to create a collection.

    Attributes:
        name: Trimmed display name inherited from FolderName.
        kind: Notebook or podcast collection kind.
    """

    kind: FolderKind


class FolderResponse(FolderCreate):
    """Serialize a persisted collection without exposing its conflict guard.

    Attributes:
        name: Collection display name.
        kind: Notebook or podcast collection kind.
        id: Persisted folder record identifier.
    """

    id: str


class AssignmentRequest(BaseModel):
    """Validate an explicit move or unfile request.

    Attributes:
        folder_id: Target folder identifier, or None to leave content Unfiled.
    """

    model_config = ConfigDict(extra="forbid")
    folder_id: str | None


class AssignmentResponse(BaseModel):
    """Serialize the committed collection assignment of an existing item.

    Attributes:
        id: Notebook or episode record identifier.
        folder_id: Committed target folder identifier, or None when Unfiled.
    """

    id: str
    folder_id: str | None


@router.put("/folders/assignment/{kind}/{item_id}", response_model=AssignmentResponse)
async def assign_folder(
    kind: FolderKind, item_id: str, request: AssignmentRequest
) -> dict[str, str | None]:
    """Move or unfile an existing item using the deletion-safe transaction.

    Args:
        kind: Validated collection kind from the URL.
        item_id: Notebook or episode record identifier from the URL.
        request: Validated target folder or explicit null assignment.

    Returns:
        The item identifier and its committed assignment.

    Raises:
        InvalidInputError: If identifiers or the target folder kind are invalid.
        NotFoundError: If the item or target folder is absent or deleted.
        Exception: If the assignment transaction conflicts or execution fails.
    """
    return await service.assign_folder(kind, item_id, request.folder_id)


@router.get("/folders", response_model=list[FolderResponse])
async def list_folders(kind: FolderKind) -> list[dict[str, Any]]:
    """List collections of the requested kind in display-name order.

    Args:
        kind: Validated collection kind from the query string.

    Returns:
        Public folder fields, sorted by name.

    Raises:
        Exception: If database execution fails.
    """
    return await service.list_folders(kind)


@router.post("/folders", response_model=FolderResponse, status_code=201)
async def create_folder(request: FolderCreate) -> dict[str, Any]:
    """Create a collection with a validated name and kind.

    Args:
        request: Validated display name and collection kind.

    Returns:
        The newly created folder's public fields.

    Raises:
        Exception: If schema validation or database execution fails.
    """
    return await service.create_folder(request.name, request.kind)


@router.put("/folders/{folder_id}", response_model=FolderResponse)
async def rename_folder(folder_id: str, request: FolderName) -> dict[str, Any]:
    """Rename an existing collection without changing its assignments.

    Args:
        folder_id: Folder record identifier from the URL.
        request: Validated replacement display name.

    Returns:
        The renamed folder's public fields.

    Raises:
        InvalidInputError: If the folder identifier is invalid.
        NotFoundError: If the folder does not exist.
        Exception: If schema validation or database execution fails.
    """
    return await service.rename_folder(folder_id, request.name)


@router.delete("/folders/{folder_id}", status_code=204)
async def delete_folder(folder_id: str) -> None:
    """Delete a collection while atomically unfiling, not deleting, its content.

    The database guard rejects conflicting assignments or this deletion rather
    than committing a dangling reference. Other conflicts propagate to callers.

    Args:
        folder_id: Folder record identifier from the URL.

    Returns:
        None, producing an HTTP 204 response after the deletion commits.

    Raises:
        InvalidInputError: If the folder identifier is invalid.
        NotFoundError: If the folder does not exist at validation time.
        Exception: If the deletion transaction conflicts or execution fails.
    """
    await service.delete_folder(folder_id)
