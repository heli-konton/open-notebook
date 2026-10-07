"""Folder API vertical slices against an actual embedded SurrealDB (no AI)."""

import asyncio
import importlib.util
from contextlib import asynccontextmanager
from pathlib import Path

import pytest
import pytest_asyncio
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient, Response
from surrealdb import AsyncSurreal

from open_notebook.exceptions import InvalidInputError, NotFoundError


def test_folder_api_exists():
    assert importlib.util.find_spec("api.routers.folders") is not None, (
        "Persistent folder API is missing"
    )


@asynccontextmanager
async def folder_client(monkeypatch):
    """Build an isolated API client backed by a real test database.

    Args:
        monkeypatch: Replaces only connection creation and eager AI imports.

    Yields:
        The HTTP client and its real SurrealDB connection.
    """
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
    if os.getenv("NOVA_TEST_SURREAL_USER"):
        await db.signin(
            {
                "username": os.environ["NOVA_TEST_SURREAL_USER"],
                "password": os.environ["NOVA_TEST_SURREAL_PASSWORD"],
            }
        )
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


@pytest_asyncio.fixture
async def client(monkeypatch):
    """Yield the existing embedded API test harness.

    Args:
        monkeypatch: Fixture providing isolated module and connection overrides.

    Yields:
        An HTTP client and its real database connection.
    """
    async with folder_client(monkeypatch) as pair:
        yield pair


@pytest_asyncio.fixture(params=["embedded", "server"])
async def concurrency_client(request, monkeypatch):
    """Run races in embedded memory and an optional isolated SurrealDB server.

    Set NOVA_TEST_SURREAL_BINARY to a local SurrealDB 2 executable to run the
    deterministic server regressions. No server is downloaded or contacted:
    this fixture starts a loopback-only memory instance with random test creds.
    Embedded tests use a bounded delay because the embedded SDK denies HTTP;
    server tests use an explicit HTTP barrier, never timing to order commits.

    Args:
        request: Parametrized backend selector supplied by pytest.
        monkeypatch: Installs test-only connection settings for the fixture.

    Yields:
        An HTTP client and its isolated real database connection.
    """
    import os
    import shutil
    import socket
    import subprocess
    from uuid import uuid4

    process = None
    if request.param == "embedded":
        monkeypatch.setenv("NOVA_TEST_SURREAL_URL", "mem://")
        monkeypatch.delenv("NOVA_TEST_SURREAL_USER", raising=False)
        monkeypatch.delenv("NOVA_TEST_SURREAL_PASSWORD", raising=False)
    else:
        binary = os.getenv("NOVA_TEST_SURREAL_BINARY") or shutil.which("surreal")
        if not binary:
            pytest.skip(
                "Set NOVA_TEST_SURREAL_BINARY to run deterministic server races"
            )
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            port = listener.getsockname()[1]
        password = uuid4().hex
        process = subprocess.Popen(
            [
                binary,
                "start",
                "--no-banner",
                "--bind",
                f"127.0.0.1:{port}",
                "--username",
                "nova_test",
                "--password",
                password,
                "--allow-net",
                "127.0.0.1",
                "--log",
                "none",
                "memory",
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        monkeypatch.setenv("NOVA_TEST_SURREAL_URL", f"ws://127.0.0.1:{port}/rpc")
        monkeypatch.setenv("NOVA_TEST_SURREAL_USER", "nova_test")
        monkeypatch.setenv("NOVA_TEST_SURREAL_PASSWORD", password)
    try:
        if process is not None:
            async with AsyncClient(trust_env=False) as health:
                async with asyncio.timeout(5):
                    while True:
                        assert process.poll() is None, "Isolated SurrealDB exited"
                        try:
                            if (
                                await health.get(f"http://127.0.0.1:{port}/health")
                            ).status_code == 200:
                                break
                        except Exception:
                            pass
                        await asyncio.sleep(0.02)
        async with folder_client(monkeypatch) as pair:
            yield pair
    finally:
        if process is not None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


@pytest.mark.asyncio
async def test_migration_24_round_trip_restores_schema_and_preserves_content(
    concurrency_client, monkeypatch
):
    """Exercise the registered migrations on a fresh, fully migrated database."""
    from uuid import uuid4

    from open_notebook.database import async_migrate, repository
    from open_notebook.database.async_migrate import (
        AsyncMigrationManager,
        AsyncMigrationRunner,
    )

    # async_migrate imports this function by value; refresh for each fixture.
    monkeypatch.setattr(async_migrate, "db_connection", repository.db_connection)
    http, db = concurrency_client
    # Reuse only the isolated connection/server, not the abbreviated API schema.
    await db.use("test", "migration_24_" + uuid4().hex)
    manager = AsyncMigrationManager()
    baseline = AsyncMigrationRunner(
        manager.up_migrations[:23], manager.down_migrations[:23]
    )
    await baseline.run_all()
    assert await manager.get_current_version() == 23
    await db.query(
        "CREATE notebook:kept SET name = 'Research', archived = true, "
        "description = 'Keep this'; "
        "CREATE episode:kept SET name = 'Audio', episode_profile = {}, "
        "speaker_profile = {}, content = 'Transcript', audio_file = 'kept.mp3';"
    )

    async def schema():
        database = await db.query("INFO FOR DB;")
        tables = {
            name: await db.query(f"INFO FOR TABLE {name};")
            for name in database["tables"]
        }
        return database, tables

    before_schema = await schema()
    await manager.runner.run_one_up()
    assert await manager.get_current_version() == 24
    folders = {}
    for kind, table in [("notebook", "notebook"), ("podcast", "episode")]:
        response = await http.post("/api/folders", json={"name": kind, "kind": kind})
        assert response.status_code == 201
        folders[kind] = response.json()["id"]
        response = await http.put(
            f"/api/folders/assignment/{kind}/{table}:kept",
            json={"folder_id": folders[kind]},
        )
        assert response.status_code == 200
    assert (await http.delete("/api/folders/" + folders["podcast"])).status_code == 204
    await db.query(
        "CREATE episode:assigned SET name = 'Assigned audio', episode_profile = {}, "
        "speaker_profile = {}, content = 'Keep transcript', audio_file = 'assigned.mp3';"
    )
    remaining = await http.post(
        "/api/folders", json={"name": "Remaining audio", "kind": "podcast"}
    )
    assert remaining.status_code == 201
    assert (
        await http.put(
            "/api/folders/assignment/podcast/episode:assigned",
            json={"folder_id": remaining.json()["id"]},
        )
    ).status_code == 200
    assert len(await db.query("SELECT * FROM folder_assignment_guard;")) == 3
    # Unfiling advances the schema's automatic updated timestamp, not content.
    before_content = {
        table: await db.query(f"SELECT * OMIT folder_id, updated FROM {table} ORDER BY id;")
        for table in ("notebook", "episode")
    }
    unfiled_episode = await db.query("SELECT * FROM episode:kept;")

    await manager.runner.run_one_down()
    assert await manager.get_current_version() == 23
    after_database, after_tables = await schema()
    assert "folder_assignment_guard" not in after_database["tables"]
    assert "folder" not in after_database["tables"]
    assert (after_database, after_tables) == before_schema
    for table, rows in before_content.items():
        assert await db.query(
            f"SELECT * OMIT folder_id, updated FROM {table} ORDER BY id;"
        ) == rows
        assert all(
            row.get("folder_id") is None
            for row in await db.query(f"SELECT * FROM {table};")
        )
    assert await db.query("SELECT * FROM episode:kept;") == unfiled_episode

    await manager.runner.run_one_up()
    assert await manager.get_current_version() == 24
    assert await db.query("SELECT * FROM folder_assignment_guard;") == []
    assert await db.query("SELECT * FROM folder;") == []
    events = (await db.query("INFO FOR TABLE folder;"))["events"]
    assert set(events) == {"folder_create_guard", "folder_delete"}
    for table, rows in before_content.items():
        assert await db.query(
            f"SELECT * OMIT folder_id, updated FROM {table} ORDER BY id;"
        ) == rows
        assert all(
            row.get("folder_id") is None
            for row in await db.query(f"SELECT * FROM {table};")
        )
    # The re-applied event must create a fresh guard even for an old folder ID.
    from api.folders_service import record_id

    old_id = record_id(folders["podcast"], "folder")
    await db.query(
        "CREATE $id SET name = 'Recreated', kind = 'podcast';", {"id": old_id}
    )
    guards = await db.query("SELECT * FROM folder_assignment_guard;")
    assert len(guards) == 1
    assert guards[0]["version"] == 0
    assert (await http.delete("/api/folders/" + folders["podcast"])).status_code == 204
    guards = await db.query("SELECT * FROM folder_assignment_guard;")
    assert len(guards) == 1
    assert guards[0]["version"] == 1


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


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "kind,table", [("notebook", "notebook"), ("podcast", "episode")]
)
@pytest.mark.parametrize("first_commit", ["delete", "assign"])
async def test_assignment_and_delete_share_a_conflict_target(
    concurrency_client, monkeypatch, kind, table, first_commit
):
    """Pause a real DB transaction after validation and force either commit order.

    Args:
        concurrency_client: Isolated real SurrealDB and HTTP API fixture.
        monkeypatch: Injects only a scheduling barrier into the real query.
        kind: Collection kind under test.
        table: Corresponding content table.
        first_commit: Operation allowed to commit while its rival is paused.
    """
    from api import folders_service

    http, db = concurrency_client
    embedded = db.raw_url == "mem://"
    await db.query(f"CREATE {table}:race SET name = 'Race';")
    folder = (
        await http.post("/api/folders", json={"name": "Race", "kind": kind})
    ).json()
    entered, release = asyncio.Event(), asyncio.Event()

    async def barrier(reader, writer):
        """Hold the database's HTTP request until the other operation commits.

        Args:
            reader: Incoming HTTP stream from the database transaction.
            writer: Response stream used to release the transaction.
        """
        try:
            await reader.readuntil(b"\r\n\r\n")
            entered.set()
            await release.wait()
            writer.write(
                b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n"
                b"Content-Length: 4\r\nConnection: close\r\n\r\nnull"
            )
            await writer.drain()
        finally:
            writer.close()
            await writer.wait_closed()

    server = await asyncio.start_server(barrier, "127.0.0.1", 0)
    port = server.sockets[0].getsockname()[1]
    original = folders_service.repo_query

    async def scheduled_query(query, variables=None):
        """Run the unchanged transaction with a deterministic scheduling hook.

        Args:
            query: Production SurrealQL to execute.
            variables: Production bindings, augmented with the barrier URL.

        Returns:
            The real repository query result.
        """
        should_pause = (first_commit == "delete" and "BEGIN TRANSACTION" in query) or (
            first_commit == "assign" and query == "DELETE $id;"
        )
        if should_pause:
            pause = (
                "SLEEP 200ms;"
                if embedded
                else "LET $test_pause = http::get($test_barrier);"
            )
            if embedded:
                entered.set()
            if first_commit == "delete":
                query = query.replace("UPDATE $item SET", pause + " UPDATE $item SET")
            else:
                query = (
                    "BEGIN TRANSACTION; SELECT * FROM $id; "
                    + pause
                    + " DELETE $id; COMMIT TRANSACTION;"
                )
            variables = dict(variables or {}, test_barrier=f"http://127.0.0.1:{port}")
        return await original(query, variables)

    monkeypatch.setattr(folders_service, "repo_query", scheduled_query)

    async def assign():
        """Assign through the real API and return its HTTP response."""
        return await http.put(
            f"/api/folders/assignment/{kind}/{table}:race",
            json={"folder_id": folder["id"]},
        )

    async def delete():
        """Delete through the real API and return its HTTP response."""
        return await http.delete("/api/folders/" + folder["id"])

    slow = asyncio.create_task(assign() if first_commit == "delete" else delete())
    try:
        await asyncio.wait_for(entered.wait(), 5)
        if embedded:
            await asyncio.sleep(0.05)
        fast = await asyncio.wait_for(
            delete() if first_commit == "delete" else assign(), 5
        )
        assert fast.status_code == (204 if first_commit == "delete" else 200)
        assert not slow.done(), "The competing transaction must still be open"
        if first_commit == "delete":
            assert await db.query("SELECT * FROM folder;") == []
        else:
            assert (await db.query(f"SELECT * FROM {table}:race;"))[0][
                "folder_id"
            ] == folder["id"]
    finally:
        release.set()
        outcome = (await asyncio.gather(slow, return_exceptions=True))[0]
        server.close()
        await server.wait_closed()

    row = (await db.query(f"SELECT * FROM {table}:race;"))[0]
    folders = await db.query("SELECT * FROM folder;")
    assert row["name"] == "Race"
    assert row.get("folder_id") is None or any(
        str(entry["id"]) == row["folder_id"] for entry in folders
    ), "A committed assignment must never reference a deleted folder"
    if first_commit == "delete":
        assert not folders
        assert isinstance(outcome, Response)
        assert outcome.status_code == 404
        assert row.get("folder_id") is None
    else:
        # The delete may abort on the shared folder write. A fresh delete must
        # then see and clear the assignment; conflicts never lose content.
        if isinstance(outcome, Exception):
            assert "conflict" in str(outcome).lower()
            monkeypatch.setattr(folders_service, "repo_query", original)
            assert (await delete()).status_code == 204
        else:
            assert isinstance(outcome, Response)
            assert outcome.status_code == 204
        assert await db.query("SELECT * FROM folder;") == []
        assert (await db.query(f"SELECT * FROM {table}:race;"))[0].get(
            "folder_id"
        ) is None
