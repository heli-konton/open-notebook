"""Tests for podcast progress parsing, reporter wiring and API fields."""

import asyncio
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from loguru import logger

from commands.podcast_commands import _ProgressReporter
from open_notebook.podcasts.models import PodcastEpisode
from open_notebook.podcasts.progress import PodcastProgressTracker


class TestProgressTracker:
    def test_outline_sets_five(self):
        t = PodcastProgressTracker()
        assert t.feed("Generated outline with 4 segments") == 5

    def test_transcript_segments_interpolate(self):
        t = PodcastProgressTracker()
        t.feed("Generated outline with 3 segments")
        assert t.feed("Generating transcript for segment 1/3: Intro") is None
        assert t.feed("Generating transcript for segment 2/3: Mid") == 15
        assert t.feed("Generating transcript for segment 3/3: End") == 25

    def test_routing_sets_thirty_five(self):
        t = PodcastProgressTracker()
        assert t.feed("Routing 10 dialogue segments for sequential batch") == 35

    def test_audio_clips_scale_and_cap(self):
        t = PodcastProgressTracker()
        t.feed("Routing 4 dialogue segments for sequential batch processing")
        seen = [t.feed("Generated audio clip: /tmp/x.mp3") for _ in range(4)]
        assert seen == [50, 65, 80, 95]
        assert t.feed("Generated audio clip: /tmp/y.mp3") is None  # capped

    def test_clip_before_routing_ignored(self):
        t = PodcastProgressTracker()
        assert t.feed("Generated audio clip: a.mp3") is None

    def test_only_reports_changes_and_never_goes_back(self):
        t = PodcastProgressTracker()
        assert t.feed("Generated outline with 2 segments") == 5
        assert t.feed("Generated outline with 2 segments") is None
        t.feed("Routing 2 dialogue segments")
        assert t.feed("Generating transcript for segment 1/2: x") is None
        assert t.percent == 35

    def test_unrelated_message(self):
        assert PodcastProgressTracker().feed("hello") is None


class TestReporterSink:
    @pytest.mark.asyncio
    async def test_writes_only_on_change_and_removes_sink(self):
        episode = PodcastEpisode(
            id="episode:p1",
            name="n",
            episode_profile={},
            speaker_profile={},
            briefing="b",
            content="c",
            progress=1,
        )
        with patch(
            "commands.podcast_commands.write_episode_progress", new=AsyncMock()
        ) as write:
            reporter = _ProgressReporter(episode, asyncio.get_running_loop())
            reporter.attach()
            try:
                # Emit through a logger whose module name matches the filter.
                nodes_logger = logger.patch(
                    lambda r: r.__setitem__("name", "podcast_creator.nodes")
                )
                nodes_logger.info("Generated outline with 3 segments")
                nodes_logger.info("Generated outline with 3 segments")
                other = logger.patch(lambda r: r.__setitem__("name", "other.module"))
                other.info("Routing 3 dialogue segments")
                await reporter.flush()
            finally:
                reporter.detach()
            assert [c.args[1] for c in write.await_args_list] == [5]
            assert episode.progress == 5
            assert reporter._handler_id is None
            # After detach nothing more is recorded.
            nodes_logger.info("Routing 3 dialogue segments")
            await reporter.flush()
            assert write.await_count == 1


def make_episode(**overrides):
    defaults = dict(
        id="episode:abc",
        name="Ep",
        episode_profile={"name": "d"},
        speaker_profile={"name": "d"},
        briefing="b",
        content="c",
        command=None,
        audio_file=None,
    )
    defaults.update(overrides)
    return PodcastEpisode(**defaults)


class TestEpisodeModel:
    def test_notebook_string_becomes_record_id(self):
        ep = make_episode(notebook="notebook:n1", progress=40)
        assert str(ep.notebook) == "notebook:n1"
        assert not isinstance(ep.notebook, str)
        data = ep._prepare_save_data()
        assert str(data["notebook"]) == "notebook:n1"
        assert data["progress"] == 40

    def test_empty_notebook_not_stored(self):
        ep = make_episode(notebook="")
        assert "notebook" not in ep._prepare_save_data()
        assert "notebook" not in make_episode()._prepare_save_data()

    def test_progress_range(self):
        with pytest.raises(ValueError):
            make_episode(progress=101)


@pytest.fixture
def client():
    from api.main import app

    return TestClient(app)


def _list(client, episodes, statuses, **params):
    with (
        patch(
            "api.routers.podcasts.PodcastService.list_episodes",
            new=AsyncMock(return_value=episodes),
        ) as listing,
        patch(
            "api.routers.podcasts.PodcastEpisode.get_job_details_for_commands",
            new=AsyncMock(return_value=statuses),
        ),
        patch(
            "api.routers.podcasts._resolve_snapshot_models",
            new=AsyncMock(return_value={}),
        ),
    ):
        resp = client.get("/api/podcasts/episodes", params=params)
    return resp, listing


class TestApi:
    def test_list_returns_new_fields_and_passes_filter(self, client):
        ep = make_episode(command="command:c1", notebook="notebook:n1", progress=40)
        resp, listing = _list(
            client,
            [ep],
            {"command:c1": {"status": "running", "error_message": None}},
            notebook_id="notebook:n1",
        )
        assert resp.status_code == 200
        body = resp.json()[0]
        assert body["notebook_id"] == "notebook:n1"
        assert body["progress"] == 40
        listing.assert_awaited_once_with(notebook_id="notebook:n1")

    def test_list_without_filter_calls_unfiltered(self, client):
        resp, listing = _list(client, [], {})
        assert resp.status_code == 200
        listing.assert_awaited_once_with()

    def test_completed_reports_100_and_queued_reports_0(self, client):
        done = make_episode(command="command:a", progress=70)
        queued = make_episode(id="episode:q", command="command:b")
        resp, _ = _list(
            client,
            [done, queued],
            {
                "command:a": {"status": "completed", "error_message": None},
                "command:b": {"status": "queued", "error_message": None},
            },
        )
        by_id = {e["id"]: e for e in resp.json()}
        assert by_id["episode:abc"]["progress"] == 100
        assert by_id["episode:q"]["progress"] == 0
        assert by_id["episode:q"]["notebook_id"] is None

    def test_get_by_id_returns_fields(self, client):
        ep = make_episode(command="command:c1", notebook="notebook:n9", progress=55)
        with (
            patch(
                "api.routers.podcasts.PodcastService.get_episode",
                new=AsyncMock(return_value=ep),
            ),
            patch.object(
                PodcastEpisode,
                "get_job_detail",
                new=AsyncMock(
                    return_value={"status": "running", "error_message": None}
                ),
            ),
            patch(
                "api.routers.podcasts._resolve_snapshot_models",
                new=AsyncMock(return_value={}),
            ),
        ):
            resp = client.get("/api/podcasts/episodes/episode:abc")
        assert resp.status_code == 200
        assert resp.json()["notebook_id"] == "notebook:n9"
        assert resp.json()["progress"] == 55
