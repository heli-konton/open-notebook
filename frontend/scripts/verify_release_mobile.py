#!/usr/bin/env python3
"""Read-only, real-audio Now Playing regression against an existing release.

Requires Python Playwright + Chromium; see README-release-mobile.md. No mocks,
API fixtures, authentication/storage seeding, server edits or audio downloads.
"""
import argparse
import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright


SETTLE = """async el => {
  const deadline = performance.now() + 5000;
  const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
  let previous, stable = 0;
  while (performance.now() < deadline) {
    await frame();
    const active = el.getAnimations({subtree: true}).filter(
      a => a.playState === 'running' || a.pending);
    const r = el.getBoundingClientRect();
    const current = [r.x, r.y, r.width, r.height];
    stable = !active.length && previous && current.every(
      (v, i) => Math.abs(v - previous[i]) < 0.05) ? stable + 1 : 0;
    if (stable >= 2) return current;
    previous = current;
  }
  throw new Error('Sheet animations/geometry did not settle in 5s');
}"""


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def settle(dialog):
    dialog.evaluate(SETTLE)
    return dialog.bounding_box()


def audio_state(page):
    return page.locator('audio').evaluate("""a => ({
      duration: a.duration, time: a.currentTime, ready: a.readyState,
      paused: a.paused, src: a.currentSrc,
      sameElement: a === window.__releaseAudio,
      sameSource: a.currentSrc === window.__releaseAudioSource
    })""")


def identity(page):
    state = audio_state(page)
    check(page.locator('audio').count() == 1 and state['sameElement']
          and state['sameSource'], f'Playback identity changed: {state}')


def run_case(browser, args, width, height, motion):
    mobile = width < 768
    context = browser.new_context(viewport={'width': width, 'height': height},
                                  is_mobile=mobile, has_touch=mobile,
                                  reduced_motion=motion, locale='en-US')
    page = context.new_page()
    page.set_default_timeout(15000)
    errors, writes = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))

    # Guard the fixture server: this script only exercises GETs and local audio.
    def readonly(route):
        if route.request.method not in ('GET', 'HEAD', 'OPTIONS'):
            writes.append(f'{route.request.method} {route.request.url}')
            route.abort()
        else:
            route.continue_()
    page.route('**/*', readonly)
    result = {'viewport': [width, height], 'motion': motion,
              'diagnostic_only': bool(args.diagnostic_sheet_css),
              'fresh_context': True, 'storage_seeded': False}
    name = f'{width}x{height}-{motion}'
    try:
        # Deliberately first navigation: auth/bootstrap must work without preseed.
        page.goto(args.origin.rstrip('/') + '/podcasts')
        # Wait for the cold auth/config request chain and its route changes,
        # rather than mistaking a transient podcast render for bootstrap done.
        # This is bootstrap only; sheet timing uses animation/frame checks.
        page.wait_for_load_state('networkidle')
        page.wait_for_function("""() =>
          (location.pathname === '/notebooks' &&
            !!document.querySelector('.app-shell')) ||
          (location.pathname === '/podcasts' &&
            !!document.querySelector('.episode-play'))
        """)
        result['bootstrap_url'] = page.url
        # Keyboard activation follows the real link even if an asynchronous
        # version toast temporarily overlays mobile navigation.
        # Cold bootstrap may redirect to notebooks; follow the actual UI.
        if not page.url.endswith('/podcasts'):
            nav = page.locator('.mobile-navigation' if mobile else '.desktop-sidebar')
            nav.get_by_role('link', name='Podcasts', exact=True).press('Enter')
        page.wait_for_url('**/podcasts')
        for close in page.get_by_role('button', name='Close toast').all():
            if close.is_visible():
                close.click()
        page.get_by_role('button', name='Play', exact=True).first.click()
        page.wait_for_function("""() => {
          const a = document.querySelector('audio');
          return a && a.readyState >= 2 && Number.isFinite(a.duration)
            && a.duration > 30 && a.currentTime > 0.3 && !a.paused;
        }""")
        page.locator('audio').evaluate("""a => {
          window.__releaseAudio = a;
          window.__releaseAudioSource = a.currentSrc;
        }""")
        result['decoded_audio'] = audio_state(page)
        if args.diagnostic_sheet_css:
            # Ephemeral browser hypothesis only, never release acceptance.
            page.add_style_tag(content=Path(args.diagnostic_sheet_css).read_text())
        trigger = page.get_by_role('button', name='Expand player')
        trigger.click()
        dialog = page.get_by_role('dialog')
        dialog.wait_for(state='visible')
        box = settle(dialog)
        result['box'] = box
        result['computed_css'] = dialog.evaluate("""el => {
          const s = getComputedStyle(el);
          return {translate:s.translate, transform:s.transform,
            top:s.top, bottom:s.bottom, left:s.left,
            translateX:s.getPropertyValue('--tw-translate-x'),
            translateY:s.getPropertyValue('--tw-translate-y'),
            animations:el.getAnimations({subtree:true}).length};
        }""")
        page.screenshot(path=str(args.output / f'{name}-settled.png'))
        tolerance = 1
        check(box['x'] >= -tolerance and box['y'] >= -tolerance
              and box['x'] + box['width'] <= width + tolerance
              and box['y'] + box['height'] <= height + tolerance,
              f'Settled sheet clipped outside viewport: {box}')
        if mobile:
            check(abs(box['x']) <= tolerance
                  and abs(box['width'] - width) <= tolerance
                  and abs(box['y'] + box['height'] - height) <= tolerance,
                  f'Mobile sheet is not full-width/bottom-anchored: {box}')
        else:
            check(abs(box['x'] + box['width'] / 2 - width / 2) <= tolerance
                  and abs(box['y'] + box['height'] / 2 - height / 2) <= tolerance,
                  f'Desktop dialog is no longer centered: {box}')
        targets = []
        for target in dialog.locator('button, input[type=range]').all():
            target.scroll_into_view_if_needed()
            rect = target.bounding_box()
            label = target.get_attribute('aria-label') or target.inner_text()
            # Mobile has a 44px minimum on every button; desktop's unchanged
            # secondary Back to library button is 36px, not a touch control.
            if mobile or label != 'Back to library':
                check(rect and rect['width'] >= 44 and rect['height'] >= 44,
                      f'Touch target below 44px: {label}: {rect}')
            check(rect['x'] >= -tolerance and rect['y'] >= -tolerance
                  and rect['x'] + rect['width'] <= width + tolerance
                  and rect['y'] + rect['height'] <= height + tolerance,
                  f'Control not reachable within viewport: {label}: {rect}')
            targets.append({'label': label, 'box': rect})
        result['touch_targets'] = targets
        dialog.get_by_role('button', name='Pause', exact=True).click()
        page.wait_for_function('document.querySelector("audio").paused')
        slider = dialog.get_by_role('slider')
        slider.focus()
        slider.press('Home')
        for _ in range(25):
            slider.press('ArrowRight')
        page.wait_for_function('Math.abs(document.querySelector("audio").currentTime - 25) < 1')
        identity(page)
        dialog.get_by_role('button', name='Rewind 15 seconds', exact=True).click()
        page.wait_for_function('Math.abs(document.querySelector("audio").currentTime - 10) < 1')
        dialog.get_by_role('button', name='Play', exact=True).click()
        page.wait_for_function('!document.querySelector("audio").paused')
        dialog.get_by_role('button', name='Stop and reset', exact=True).click()
        page.wait_for_function('document.querySelector("audio").paused && document.querySelector("audio").currentTime < 0.1')
        identity(page)
        dialog.get_by_role('button', name='Back to library', exact=True).click()
        dialog.wait_for(state='hidden')
        page.wait_for_function('document.activeElement?.getAttribute("aria-label") === "Expand player"')
        trigger.click()
        settle(page.get_by_role('dialog'))
        page.keyboard.press('Escape')
        page.get_by_role('dialog').wait_for(state='hidden')
        page.wait_for_function('document.activeElement?.getAttribute("aria-label") === "Expand player"')
        identity(page)
        check(not writes, f'Unexpected write attempts: {writes}')
        check(not errors, f'Browser errors: {errors}')
        result.update(passed=True, controls_passed=True, focus_return_passed=True,
                      playback_identity_preserved=True)
    except Exception as error:
        result.update(passed=False, failure=str(error))
        page.screenshot(path=str(args.output / f'{name}-failure.png'))
    finally:
        result.update(page_errors=errors, write_attempts=writes, final_url=page.url)
        context.close()
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--origin', default=os.environ.get('API_ORIGIN'), required=not os.environ.get('API_ORIGIN'))
    parser.add_argument('--chrome-bin', default=os.environ.get('CHROME_BIN'))
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--diagnostic-sheet-css', type=Path,
                        help='Ephemeral hypothesis stylesheet; results are NOT release acceptance')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    results = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=args.chrome_bin, headless=True,
                                     args=['--no-sandbox'])
        try:
            for motion in ('no-preference', 'reduce'):
                for width, height in ((430, 932), (320, 740), (1440, 1000)):
                    result = run_case(browser, args, width, height, motion)
                    results.append(result)
                    print(json.dumps(result), flush=True)
                    (args.output / 'results.json').write_text(json.dumps(results, indent=2))
        finally:
            browser.close()
    passed = sum(result['passed'] for result in results)
    print(f'{passed}/{len(results)} cases passed; diagnostic_only={bool(args.diagnostic_sheet_css)}')
    return 0 if passed == len(results) else 1


if __name__ == '__main__':
    raise SystemExit(main())
