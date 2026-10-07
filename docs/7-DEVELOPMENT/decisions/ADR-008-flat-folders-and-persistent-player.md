# ADR-008: Flat folders and a persistent authenticated player

Date: 2026-10-07
Status: Implemented; full-stack release verification pending

## Context

nova_notes is a user-facing rebrand of Open Notebook. Notebooks use the
`notebook` table; generated podcasts use `episode` via `PodcastEpisode`.
Existing migrations end at 23 and are registered in `database/async_migrate.py`.
Folder membership must not change notebook archive state or podcast generation,
source relationships, audio paths, or content ownership. Mobile playback must
continue when navigating between authenticated dashboard routes.

## Decision

Migration 24 introduces flat `folder` records with `name` and immutable `kind`
(`notebook` or `podcast`). Content has one optional string `folder_id`; existing
items are Unfiled. CRUD and assignment live behind the existing authenticated
API middleware in `/api/folders`. IDs and folder kind are validated; assignment
rechecks folder availability inside a database transaction. Folder deletion
fires an event that clears assignments in the same transaction, never deleting
content. `FolderItem` excludes membership from ordinary content saves, so stale
notebook edits or worker saves cannot restore deleted/moved assignments.
Down migration removes the event, assignment fields and folder table only.

All and Unfiled are computed views, not records. Counts are based on actual
loaded items; notebook search/archive filters compose with folder selection.
React Query invalidation refreshes membership after CRUD/moves. No nesting,
reordering or drag/drop is added.

`PodcastPlayerProvider` mounts above the dashboard shell and owns exactly one
HTML audio element. It fetches the existing authenticated audio endpoint on
selection, creates a Blob URL, aborts obsolete requests, and revokes URLs on
replacement/close/unmount. Pause retains position; Stop resets it; rewind clamps
at zero; seek clamps to actual duration. Audio errors remain visible. Existing
backend range handling is unchanged; Blob retrieval still downloads the entire
file before playback, as the previous card did. Long-file streaming remains a
future improvement, not a claimed capability of this change.

User-facing identity is `nova_notes`, with a graphite/slate book/nova motif and
cyan accent. Existing saved theme choices remain honored; new installs default
to dark. Internal `open_notebook` imports, environment variables and API routes
stay compatible; upstream attribution/license remain intact. All new UI copy
has keys in fourteen locales. Mobile uses actual application UI, not device
chrome or fabricated metrics.

## Consequences and verification

Backend vertical slices exercise a real database with bounded dependencies:
`pytest tests/test_folders.py -q` (embedded DB), or set
`NOVA_TEST_SURREAL_URL=ws://127.0.0.1:18000/rpc` against an isolated SurrealDB 2.7
server. Tests cover CRUD, safe deletion, reassign/unassign, archive preservation,
invalid/missing/wrong-kind assignments and stale-save protection. Frontend
Vitest covers grouping, move controls, mobile navigation and playback controls;
media decoding is not available in jsdom and is not claimed by these tests.

For low-disk verification only, `NOVA_NOTES_BOUNDED_BUILD=1` disables webpack's
disk cache, uses one build worker and omits duplicated standalone output.
Run `NOVA_NOTES_BOUNDED_BUILD=1 NODE_OPTIONS=--max-old-space-size=768 npm run build -- --webpack`.
Serve that verification build with
`NOVA_NOTES_BOUNDED_BUILD=1 npx next start --hostname 127.0.0.1 --port 13000`.
Normal deployment builds retain upstream standalone output and `npm start`.

Release gates still require the complete Python dependency stack, authenticated
full-stack smoke tests (including real generated audio and range requests),
visual desktop/iPhone review, and a standard standalone/Docker build on a host
with adequate headroom. No production data, AI generation or deployment is
part of this implementation verification.
