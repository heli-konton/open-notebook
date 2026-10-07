# Optimized-release Now Playing browser regression

`verify_release_mobile.py` tests an **already running release**, not a dev server
or mocked API. It does not build, deploy, seed data, alter server files, create
models, or write API fixtures. Run it against a private, authentication-disabled
acceptance instance containing an existing playable speech episode longer than
30 seconds. The first visible episode Play button must select that fixture.
Password-enabled authentication and physical/native Safari are outside this
harness's scope.

## Run

Use Python 3.12 with `playwright==1.58.0` and its Chromium installed. For example,
on a CI runner with sufficient disk space (not on a disk-constrained host):

```sh
python3.12 -m venv "$RUNNER_TEMP/nova-sheet-venv"
"$RUNNER_TEMP/nova-sheet-venv/bin/python" -m pip install playwright==1.58.0
"$RUNNER_TEMP/nova-sheet-venv/bin/python" -m playwright install chromium
"$RUNNER_TEMP/nova-sheet-venv/bin/python" frontend/scripts/verify_release_mobile.py \
  --origin "$STAGE_ORIGIN" --output "$EVIDENCE_DIR"
```

`STAGE_ORIGIN` is the **frontend** origin, including its port, not a bare API
server. `API_ORIGIN` may instead provide this value as an environment default.
For a preinstalled browser, pass `--chrome-bin "$CHROME_BIN"` (or set
`CHROME_BIN`). Reuse an existing Python Playwright installation when available;
no repository dependencies, browser downloads, or builds are required for that
path. Use a new evidence directory for each run.

The script exits **1** for any failed case and **0** only for all six successes.
It writes incrementally collected `results.json` and settled/failure screenshots.
Every case starts with a fresh browser context and an actual first `/podcasts`
visit: no localStorage, authentication, or theme preseed. A cold redirect to
notebooks is followed through the real navigation link. Keyboard link activation
avoids the asynchronous version toast covering mobile navigation; remaining
visible toasts are dismissed through their own controls.

The six cases are 430×932 and 320×740 touch/mobile contexts plus 1440×1000
desktop, each with normal and reduced motion. Assertions cover:

- Real audio metadata/decoding and advancing playback (no audio/network mocks).
- No running/pending sheet/subtree animations, then two stable animation frames,
  before checking all four viewport bounds. No fixed sleep substitutes for this.
- Mobile full width and bottom anchoring; desktop horizontal/vertical centering.
- Reachable controls, mobile targets ≥44×44px, pause/resume, keyboard range seek,
  15-second rewind and stop/reset. Desktop's existing 36px secondary Back to
  library button is unchanged; its audio/close targets remain ≥44px.
- Focus return on Back to library and Escape; the same single audio DOM element
  and decoded blob source remain selected across sheet/control interactions.
- No browser page errors or non-read-only request attempts. Non-GET/HEAD/OPTIONS
  requests are blocked rather than allowed to modify the acceptance fixture.

## Root cause and fast source regression

Tailwind's dialog centering uses the independent `translate` property with
`--tw-translate-x` and `--tw-translate-y`. In the inspected optimized release,
utilities set these to `-50%`. The unlayered mobile sheet rule correctly wins for
`top`, `bottom`, `left`, and width, **but its `translate:none` is absent from the
optimized stylesheet**: optimization folds `transform:none;translate:none` into
`transform:translate(0)`. Resetting `transform` alone does not cancel independent
translation. This is not a need for higher specificity or `!important`.

The narrow fix zeros the two Tailwind centering variables only inside the
existing mobile `.now-playing-sheet` media rule. Other dialogs and desktop
centering are untouched. Safe areas, dimensions, animations, reduced-motion
rules, and controls remain unchanged. `NowPlayingPosition.test.ts` uses the
Tailwind PostCSS plugin's own Lightning CSS optimizer and parses the resulting
CSS to guard retention of both mobile axis resets and their scope:

```sh
cd frontend
npm run test -- src/components/podcasts/NowPlayingPosition.test.ts
```

These fast source tests complement, **not replace**, real-browser geometry.
The browser harness caught the existing optimized release with settled bounds
`(-215,-130,430,708)` and `(-160,-241.75,320,654.5)` under both motion preferences,
while both desktop cases passed at `(16,147.75,1408,704.5)`.

## Diagnostic-only CSS probe

`--diagnostic-sheet-css path/to/sheet.css` injects a stylesheet **only into the
fresh browser page**. This is explicitly marked `diagnostic_only:true` in every
result and the summary. It never patches the image or server and must never be
reported as successful release acceptance.

During source diagnosis, the exact proposed mobile rule was extracted from
`globals.css`, optimized with the existing Lightning CSS dependency, and passed
via this option. All six cases passed; mobile bounds became
`(0,224,430,708)` and `(0,85.5,320,654.5)`, with identical desktop geometry and
successful controls/focus/audio-identity checks. Source and optimizer tests also
went red before the CSS fix, then green afterward.

**Required follow-up:** build a new optimized candidate through the normal
release process, pin its image/source identity, and rerun the harness **without
any diagnostic stylesheet** plus the rest of release acceptance. The diagnostic
probe is evidence for the fix, not proof of that future image. No merge, release
build, deployment, or production operation is performed by this script.
