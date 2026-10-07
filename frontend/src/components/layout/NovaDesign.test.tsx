import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { enUS } from '@/lib/locales/en-US'
const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')
describe('nova_notes identity and responsive shell contract', () => {
  it('brands the shell and title while retaining upstream attribution', () => {
    expect(enUS.common.appName).toBe('nova_notes')
    expect(source('src/app/layout.tsx')).toContain('title: "nova_notes"')
    expect(source('public/logo.svg')).toContain('#38bdf8')
    expect(source('../LICENSE')).toContain('MIT')
  })
  it('provides safe-area dynamic viewport and reduced motion layouts', () => {
    const css = source('src/app/globals.css')
    expect(css).toContain('100dvh')
    expect(css).toContain('env(safe-area-inset-bottom')
    expect(css).toContain('prefers-reduced-motion')
    expect(css).toContain('.mobile-navigation')
    expect(css).toContain('.collection-layout')
    expect(source('src/lib/theme-script.ts')).toContain("|| 'dark'")
  })
})
