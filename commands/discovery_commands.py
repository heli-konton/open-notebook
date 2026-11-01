import asyncio
import time
from typing import Any, Awaitable, Callable, Dict, List, Optional

from loguru import logger
from surreal_commands import CommandInput, CommandOutput, command

from open_notebook.domain.notebook import Notebook, Source
from open_notebook.utils.discovery import (
    MIN_SOURCES,
    LLMCall,
    clamp_num_sources,
    default_llm_call,
    generate_queries,
    select_sources,
    source_state_from,
    wait_for_sources,
)
from open_notebook.utils.web_search import Searcher, search_many

PODCAST_WAIT_TIMEOUT_S = 600
PODCAST_WAIT_INTERVAL_S = 5

AddSource = Callable[[str, str, str], Awaitable[str]]


class DiscoverNotebookInput(CommandInput):
    notebook_id: str
    prompt: str
    num_sources: int = 10
    create_podcast: bool = False
    episode_profile: Optional[str] = None
    speaker_profile: Optional[str] = None


class DiscoverNotebookOutput(CommandOutput):
    success: bool
    notebook_id: str
    sources: List[Dict[str, str]] = []
    failures: List[Dict[str, str]] = []
    queries: List[str] = []
    podcast_job_id: Optional[str] = None
    processing_time: float = 0.0
    error_message: Optional[str] = None


async def add_link_source(notebook_id: str, url: str, title: str) -> str:
    """Add a link source through the same path as POST /api/sources.

    Reuses the router's create_source so URL validation (SSRF guard), async
    processing and embedding behave exactly as for a user-added link.
    """
    from api.models import SourceCreate
    from api.routers.sources import create_source

    payload = SourceCreate(
        type="link",
        url=url,
        title=title or None,
        notebooks=[notebook_id],
        transformations=[],
        embed=True,
        async_processing=True,
    )
    response = await create_source((payload, None))
    return str(response.id)


async def _source_state(source_id: str) -> str:
    try:
        source = await Source.get(source_id)
    except Exception as e:  # deleted by the user, transient DB error, ...
        logger.warning(f"Could not load source {source_id}: {e}")
        return "failed"
    if source is None:
        return "failed"
    if source.full_text and source.full_text.strip():
        return "done"
    return source_state_from(None, await source.get_status())


async def run_discovery(
    data: DiscoverNotebookInput,
    *,
    llm: LLMCall = default_llm_call,
    searcher: Optional[Searcher] = None,
    add_source: AddSource = add_link_source,
    get_state: Callable[[str], Awaitable[str]] = _source_state,
    submit_podcast: Optional[Callable[..., Awaitable[str]]] = None,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    clock: Callable[[], float] = time.monotonic,
    notebook_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Core discovery flow. Raises ValueError with a clear message on failure."""
    n = clamp_num_sources(data.num_sources)
    queries = await generate_queries(data.prompt, llm)
    candidates = await search_many(
        queries, searcher=searcher, sleep=sleep, delay=0 if searcher else 1.0
    )
    if len(candidates) < MIN_SOURCES:
        raise ValueError(
            f"Web search returned only {len(candidates)} usable results "
            f"(need at least {MIN_SOURCES}); try a broader prompt or retry later."
        )
    chosen = await select_sources(data.prompt, candidates, n, llm)

    added: List[Dict[str, str]] = []
    source_ids: List[str] = []
    failures: List[Dict[str, str]] = []
    for c in chosen:
        try:
            sid = await add_source(data.notebook_id, c.url, c.title)
        except Exception as e:
            logger.warning(f"Could not add {c.url}: {e}")
            failures.append({"url": c.url, "error": str(e)[:200]})
            continue
        source_ids.append(sid)
        added.append({"url": c.url, "title": c.title, "domain": c.domain})

    if len(added) < MIN_SOURCES:
        raise ValueError(
            f"Only {len(added)} sources could be added (need at least "
            f"{MIN_SOURCES}); failures: {failures}"
        )

    podcast_job_id: Optional[str] = None
    if data.create_podcast:
        if not data.episode_profile:
            raise ValueError("episode_profile is required to create a podcast")
        await wait_for_sources(
            source_ids,
            get_state,
            min_done=MIN_SOURCES,
            timeout=PODCAST_WAIT_TIMEOUT_S,
            interval=PODCAST_WAIT_INTERVAL_S,
            sleep=sleep,
            clock=clock,
        )
        submit = submit_podcast or _submit_podcast
        name = notebook_name
        if not name:
            notebook = await Notebook.get(data.notebook_id)
            name = notebook.name
        podcast_job_id = await submit(
            episode_profile_name=data.episode_profile,
            speaker_profile_name=data.speaker_profile,
            episode_name=name,
            notebook_id=data.notebook_id,
        )

    return {
        "sources": added,
        "failures": failures,
        "queries": queries,
        "podcast_job_id": podcast_job_id,
    }


async def _submit_podcast(
    episode_profile_name: str,
    speaker_profile_name: Optional[str],
    episode_name: str,
    notebook_id: str,
) -> str:
    from api.podcast_service import PodcastService
    from open_notebook.podcasts.models import EpisodeProfile

    if not speaker_profile_name:
        profile = await EpisodeProfile.get_by_name(episode_profile_name)
        if not profile or not profile.speaker_config:
            raise ValueError(
                f"Episode profile '{episode_profile_name}' has no speaker profile; "
                "pass speaker_profile explicitly"
            )
        speaker_profile_name = str(profile.speaker_config)  # record ID, resolvable
    return await PodcastService.submit_generation_job(
        episode_profile_name=episode_profile_name,
        speaker_profile_name=speaker_profile_name,
        episode_name=episode_name,
        notebook_id=notebook_id,
    )


# max_attempts=1: re-running would add duplicate sources / podcasts. A failure
# is raised as ValueError so the job is marked failed with a clear message.
@command("discover_notebook", app="open_notebook", retry={"max_attempts": 1})
async def discover_notebook_command(
    input_data: DiscoverNotebookInput,
) -> DiscoverNotebookOutput:
    start = time.time()
    result = await run_discovery(input_data)
    return DiscoverNotebookOutput(
        success=True,
        notebook_id=input_data.notebook_id,
        processing_time=time.time() - start,
        **result,
    )
