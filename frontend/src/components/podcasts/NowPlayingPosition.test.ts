import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import postcss from 'postcss'

// Use the production Tailwind PostCSS plugin's own optimizer (no extra toolchain).
const require = createRequire(import.meta.url)
const { transform } = createRequire(require.resolve('@tailwindcss/postcss'))('lightningcss')
const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8')
const mobile = postcss.parse(css).nodes.find(node =>
  node.type === 'atrule' && node.name === 'media' && node.params === '(max-width: 767px)')!

// Geometry is covered by scripts/verify_release_mobile.py in a real browser.
// This fast guard exercises optimization, where translate:none was folded into
// transform and stopped cancelling the dialog's independent Tailwind translate.
describe('optimized Now Playing positioning', () => {
  it('neutralizes both Tailwind centering axes in the mobile sheet after optimization', () => {
    const optimized = transform({ filename: 'sheet.css', code: Buffer.from(mobile.toString()), minify: true }).code.toString()
    const sheet = postcss.parse(optimized).nodes.flatMap(node =>
      node.type === 'atrule' ? node.nodes ?? [] : []).find(node =>
        node.type === 'rule' && node.selector === '.now-playing-sheet')!
    if (sheet.type !== 'rule') throw new Error('Expected optimized sheet rule')
    const declarations = Object.fromEntries(sheet.nodes.filter(node => node.type === 'decl').map(node =>
      [node.prop, node.value]))
    expect(declarations['--tw-translate-x']).toBe('0')
    expect(declarations['--tw-translate-y']).toBe('0')
    expect(declarations.bottom).toBe('0')
    expect(declarations.left).toBe('0')
    expect(declarations.top).toBe('auto')
  })

  it('does not reset centering axes outside the mobile Now Playing rule', () => {
    const root = postcss.parse(css)
    const resets: string[] = []
    root.walkDecls(/^--tw-translate-[xy]$/, declaration => {
      const rule = declaration.parent!
      expect(rule.type).toBe('rule')
      if (rule.type !== 'rule') throw new Error('Expected positioning rule')
      expect(rule.selector).toBe('.now-playing-sheet')
      const media = rule.parent!
      expect(media.type).toBe('atrule')
      if (media.type !== 'atrule') throw new Error('Expected mobile media query')
      expect(media.params).toBe('(max-width: 767px)')
      resets.push(declaration.prop)
    })
    expect(resets.sort()).toEqual(['--tw-translate-x', '--tw-translate-y'])
  })
})
