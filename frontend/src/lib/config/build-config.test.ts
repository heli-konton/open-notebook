import { afterEach, describe, expect, it, vi } from 'vitest'
import packageJson from '../../../package.json'

describe('production build contract', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('selects webpack explicitly for the custom webpack configuration', () => {
    expect(packageJson.scripts.build).toBe('next build --webpack')
  })

  it('keeps standalone packaging and the webpack hook for normal builds', async () => {
    vi.stubEnv('NOVA_NOTES_BOUNDED_BUILD', '')
    const { default: config } = await import('../../../next.config')

    expect(config.output).toBe('standalone')
    expect(config.webpack).toBeTypeOf('function')
  })
})
