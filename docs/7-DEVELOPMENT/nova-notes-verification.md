# NOVA-NOTES-IMPLEMENT-01 verification handoff

## Identity and scope

Repository: isolated clone of `heli-konton/open-notebook`, branch
`helios/folders-and-responsive-player`.
Baseline: `30c7e2a63e43b7f270fc2c638f0b6246934a53f4`.
Requested action: implement approved nova_notes folders, responsive identity and
persistent real-audio controls locally. No push, PR, merge or deployment.

## TDD evidence

Vertical slices were run RED before GREEN: folder module existence; real
create/list API; move/reassign/unassign preserving archive state; rename/delete
preserving audio; missing/invalid/wrong-kind validation; folder navigation and
move selector; authenticated player controls; episode-card player integration;
filtered episode grouping; identity/layout contract; mobile navigation dialog.
Focused failing commands and subsequent passes are recorded in the agent's
terminal history, not reconstructed output.

Two additional regression slices found real bugs during review:
- A stale content save restored a deleted folder ID. The test failed first;
  `FolderItem._prepare_save_data` now excludes service-owned assignment data.
- Assignment could resurrect an episode deleted during validation: expected
  404, actual 200. Transaction revalidation now refuses the missing item, with
  an existence recheck to handle SDK versions hiding the transaction THROW.
- The fresh-install theme contract failed (system default instead of dark),
  then passed after matching both pre-hydration bootstrap and persisted store.

## Executed checks

All commands run from the repository unless specified. Python executable:
`/home/helios_hands/.hermes/cache/scratch/nova-tests/bin/python`.

- `python -m pytest tests/test_folders.py -q`: **11 passed in 1.02s** against
  real embedded SurrealDB; no fabricated DB responses.
- `NOVA_TEST_SURREAL_URL=ws://127.0.0.1:18000/rpc python -m pytest tests/test_folders.py -q`:
  **11 passed in 1.16s** against isolated local SurrealDB **2.7.0**, memory store.
- In `frontend`, `npm test -- --maxWorkers=1`: **29 files, 149 tests passed**.
- In `frontend`, `npx tsc --noEmit`: exit **0**.
- In `frontend`, `npm run lint`: exit **0**, **7 warnings** in untouched existing
  components/hooks (SourcesColumn, GeneratePodcastDialog, CredentialFormDialog,
  ModelSelector, use-credentials); no errors.
- `ruff check api/folders_service.py api/routers/folders.py open_notebook/domain/folder_item.py tests/test_folders.py`:
  **All checks passed**. New Python files formatted with Ruff.
- `git diff --check`: exit **0**.
- Final bounded optimized production build:
  `NOVA_NOTES_BOUNDED_BUILD=1 NODE_OPTIONS=--max-old-space-size=768 npm run build -- --webpack`:
  exit **0**, compiled in **23.6s**, TypeScript **22.4s**, all **15/15** static
  pages generated, build traces completed. Final headroom **868 MiB**.
- Served the earlier successful production verification build with direct
  `next start`; HTTP GET `/login` succeeded and returned title `nova_notes`.
  This is SSR/HTTP proof only, not authenticated browser interaction proof.

## Limitations / release gates

- Full `pytest tests/ -q --maxfail=1` stops at collection because the bounded
  environment lacks `surreal_commands`; the heavy AI stack was not installed.
  Folder tests bypass only eager unrelated utility imports and use the real
  repository/database and real router. Full application startup/migrations with
  all dependencies remain to be verified.
- The first build reached the mandated 800 MiB disk floor and was terminated.
  Only this task's incomplete `.next` was removed; retry disabled webpack cache,
  limited build workers and omitted standalone duplication. The normal
  standalone/Docker packaging build has NOT been verified. `npm start` expects
  standalone output; use direct `next start` for the bounded verification build.
- Browser automation is unavailable: cloud gateway unavailable and local
  default browser unsupported. No screenshot/device/visual acceptance is claimed.
- Frontend media tests use jsdom media-method mocks, not decoded real MP3s.
  Actual iPhone/Safari autoplay, real generated-audio playback, range requests,
  navigation persistence and mobile tap interactions need authenticated
  full-stack browser/device checks. No AI generation or production data used.
- Blob playback preserves seeking but requires full protected file download;
  this retains the preexisting transport rather than introducing streaming.
- All fourteen locales have new keys/translations and pass locale parity;
  native-language editorial review remains advisable.

Implementation is committed for independent parent review, not declared fully
release-accepted. See ADR-008 and the user guide for architecture and usage.
