from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field, field_validator

from api import folders_service as service
from api.folders_service import FolderKind

router = APIRouter()


class FolderName(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=100)

    @field_validator("name", mode="before")
    @classmethod
    def trim_name(cls, value):
        return value.strip() if isinstance(value, str) else value


class FolderCreate(FolderName):
    kind: FolderKind


class FolderResponse(FolderCreate):
    id: str


class AssignmentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    folder_id: str | None


class AssignmentResponse(BaseModel):
    id: str
    folder_id: str | None


@router.put("/folders/assignment/{kind}/{item_id}", response_model=AssignmentResponse)
async def assign_folder(kind: FolderKind, item_id: str, request: AssignmentRequest):
    return await service.assign_folder(kind, item_id, request.folder_id)


@router.get("/folders", response_model=list[FolderResponse])
async def list_folders(kind: FolderKind):
    return await service.list_folders(kind)


@router.post("/folders", response_model=FolderResponse, status_code=201)
async def create_folder(request: FolderCreate):
    return await service.create_folder(request.name, request.kind)


@router.put("/folders/{folder_id}", response_model=FolderResponse)
async def rename_folder(folder_id: str, request: FolderName):
    return await service.rename_folder(folder_id, request.name)


@router.delete("/folders/{folder_id}", status_code=204)
async def delete_folder(folder_id: str):
    await service.delete_folder(folder_id)
