# Local library acceptance

`verify-library.cjs` exercises the actual Next.js application at desktop (1440×1000), mobile (430×932), and narrow mobile (320×740) sizes. It captures podcast feed, mini-player, now-playing sheet, and notebook screenshots; checks decoded audio, sheet bounds, primary 44px playback targets, focus restoration, collection collapse, archived records, horizontal overflow, and runtime errors.

Start the development server without a second optimized build:

```sh
NOVA_NOTES_BOUNDED_BUILD=1 npm run dev -- --webpack --hostname 127.0.0.1 --port 3014
```

In another terminal, use an **existing** Playwright installation and local browser:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright \
CHROME_BIN=/absolute/path/to/chrome \
VERIFY_OUTPUT=/absolute/path/to/scratch/library-visual \
node scripts/verify-library.cjs
```

An ordinary installation can omit `PLAYWRIGHT_MODULE` and `CHROME_BIN`. `VERIFY_ORIGIN` overrides the default local origin. Without `VERIFY_OUTPUT`, captures are written to ignored `test-results/library-visual/`. Do not install or download browsers just to run this check when disk headroom is tight.

## Scope of proof

All API responses are explicit **verification fixtures**, intercepted in an isolated browser context. No backend state is read or modified. Audio is the repository's existing `open_notebook/ai/assets/test_speech.mp3` speech fixture, not generated tones. It is shorter than a second, so the player correctly rounds its duration display to `0:00`.

This verifies Chromium rendering and real HTML audio decoding/control interaction. It does **not** establish live backend authorization, real podcast generation/download correctness, iOS Safari/device behavior, or deployment readiness. The API currently exposes episode profile metadata, not originating notebook/source identifiers or artwork; the UI shows that actual profile and a decorative cover rather than inventing provenance.
