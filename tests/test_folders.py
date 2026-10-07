"""Folder API vertical slices against an actual embedded SurrealDB (no AI)."""

import importlib.util
from contextlib import asynccontextmanager
from pathlib import Path

import pytest
import pytest_asyncio
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient
from surrealdb import AsyncSurreal

from open_notebook.exceptions import InvalidInputError, NotFoundError


def test_folder_api_exists():
    assert importlib.util.find_spec("api.routers.folders") is not None, (
        "Persistent folder API is missing"
    )


@pytest_asyncio.fixture
async def client(monkeypatch):
    # Bounded test environment: avoid utils' eager AI/embedding imports. The
    # real repository and real proxy module still execute, against real DB.
    import sys
    import types

    if "open_notebook.utils" not in sys.modules:
        package = types.ModuleType("open_notebook.utils")
        package.__path__ = [str(Path("open_notebook/utils").resolve())]
        monkeypatch.setitem(sys.modules, "open_notebook.utils", package)
    import os
    from uuid import uuid4

    from api.routers.folders import router
    from open_notebook.database import repository

    db = AsyncSurreal(os.getenv("NOVA_TEST_SURREAL_URL", "mem://"))
    await db.use("test", "folders_" + uuid4().hex)
    await db.query(
        "DEFINE TABLE notebook SCHEMAFULL; DEFINE FIELD name ON notebook TYPE string; DEFINE FIELD archived ON notebook TYPE bool DEFAULT false; DEFINE TABLE episode SCHEMALESS;"
    )
    await db.query(Path("open_notebook/database/migrations/24.surrealql").read_text())

    @asynccontextmanager
    async def connection():
        yield db

    monkeypatch.setattr(repository, "db_connection", connection)
    app = FastAPI()
    app.include_router(router, prefix="/api")
    for exc, status in [(NotFoundError, 404), (InvalidInputError, 400)]:

        async def handler(request: Request, error, code=status):
            return JSONResponse(status_code=code, content={"detail": str(error)})

        app.add_exception_handler(exc, handler)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as http:
        yield http, db
    await db.close()


@pytest.mark.asyncio
async def test_create_and_list_folder(client):
    http, _ = client
    response = await http.post(
        "/api/folders", json={"name": " Research ", "kind": "notebook"}
    )
    assert response.status_code == 201
    folder = response.json()
    assert folder["name"] == "Research"
    assert folder["kind"] == "notebook"
    assert (await http.get("/api/folders", params={"kind": "notebook"})).json() == [
        folder
    ]
    assert (await http.get("/api/folders", params={"kind": "podcast"})).json() == []


@pytest.mark.asyncio
async def test_move_reassign_and_unassign_preserves_archive(client):
    http, db = client
    await db.query("CREATE notebook:a SET name = 'A', archived = true;")
    folders = [
        (await http.post("/api/folders", json={"name": n, "kind": "notebook"})).json()
        for n in ["One", "Two"]
    ]
    for target in [folders[0]["id"], folders[1]["id"], None]:
        response = await http.put(
            "/api/folders/assignment/notebook/notebook:a", json={"folder_id": target}
        )
        assert response.status_code == 200
        row = (await db.query("SELECT * FROM notebook:a;"))[0]
        assert row.get("folder_id") == target
        assert row["archived"] is True


@pytest.mark.asyncio
async def test_delete_unfiles_content_and_rename(client):
    http, db = client
    folder = (
        await http.post("/api/folders", json={"name": "Old", "kind": "podcast"})
    ).json()
    response = await http.put("/api/folders/" + folder["id"], json={"name": "New"})
    assert response.status_code == 200
    assert response.json()["name"] == "New"
    await db.query("CREATE episode:a SET name = 'Audio', audio_file = 'real.mp3';")
    assert (
        await http.put(
            "/api/folders/assignment/podcast/episode:a",
            json={"folder_id": folder["id"]},
        )
    ).status_code == 200
    assert (await http.delete("/api/folders/" + folder["id"])).status_code == 204
    row = (await db.query("SELECT * FROM episode:a;"))[0]
    assert row.get("folder_id") is None
    assert row["audio_file"] == "real.mp3"
    assert (await http.get("/api/folders", params={"kind": "podcast"})).json() == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "folder_id,status", [("folder:missing", 404), ("notebook:a", 400), ("folder:", 400)]
)
async def test_rejects_missing_or_invalid_folder(client, folder_id, status):
    http, db = client
    await db.query("CREATE notebook:a SET name = 'A';")
    response = await http.put(
        "/api/folders/assignment/notebook/notebook:a", json={"folder_id": folder_id}
    )
    assert response.status_code == status
    assert (await db.query("SELECT * FROM notebook:a;"))[0].get("folder_id") is None


@pytest.mark.asyncio
async def test_wrong_kind_and_missing_item(client):
    http, db = client
    await db.query("CREATE notebook:a SET name = 'A';")
    folder = (
        await http.post("/api/folders", json={"name": "Audio", "kind": "podcast"})
    ).json()
    assert (
        await http.put(
            "/api/folders/assignment/notebook/notebook:a",
            json={"folder_id": folder["id"]},
        )
    ).status_code == 400
    assert (
        await http.put(
            "/api/folders/assignment/podcast/episode:missing",
            json={"folder_id": folder["id"]},
        )
    ).status_code == 404
    assert (
        await http.post("/api/folders", json={"name": "  ", "kind": "podcast"})
    ).status_code == 422
    assert (
        await http.post("/api/folders", json={"name": "X", "kind": "source"})
    ).status_code == 422


@pytest.mark.asyncio
async def test_assignment_does_not_recreate_concurrently_deleted_episode(
    client, monkeypatch
):
    http, db = client
    from api import folders_service

    await db.query("CREATE episode:a SET name = 'Audio';")
    folder = (
        await http.post("/api/folders", json={"name": "Audio", "kind": "podcast"})
    ).json()
    original = folders_service.get_folder

    async def delete_during_validation(folder_id):
        result = await original(folder_id)
        await db.query("DELETE episode:a;")
        return result

    monkeypatch.setattr(folders_service, "get_folder", delete_during_validation)
    response = await http.put(
        "/api/folders/assignment/podcast/episode:a", json={"folder_id": folder["id"]}
    )
    assert response.status_code == 404
    assert await db.query("SELECT * FROM episode:a;") == []


def test_notebook_response_exposes_assignment():
    from api.models import NotebookResponse

    assert "folder_id" in NotebookResponse.model_fields


@pytest.mark.asyncio
async def test_stale_general_save_cannot_restore_deleted_assignment(client):
    http, db = client
    from typing import ClassVar

    from open_notebook.domain.folder_item import FolderItem

    class Item(FolderItem):
        table_name: ClassVar[str] = "notebook"
        name: str
        archived: bool = False

    await db.query("CREATE notebook:a SET name = 'A';")
    folder = (
        await http.post("/api/folders", json={"name": "Research", "kind": "notebook"})
    ).json()
    await http.put(
        "/api/folders/assignment/notebook/notebook:a", json={"folder_id": folder["id"]}
    )
    stale = Item(id="notebook:a", name="A", folder_id=folder["id"])
    await http.delete("/api/folders/" + folder["id"])
    stale.name = "Renamed"
    await stale.save()
    row = (await db.query("SELECT * FROM notebook:a;"))[0]
    assert row.get("folder_id") is None
    assert row["name"] == "Renamed"
