import { describe, it, expect } from 'vitest'

import { DEFAULT_SPEAKER_VALUE, validateDiscoverForm, type DiscoverFormValues } from './discover-notebook'

const base: DiscoverFormValues = {
  mode: 'notebook',
  prompt: 'Solid state batteries',
  numSources: '10',
  episodeProfile: '',
  speakerProfile: DEFAULT_SPEAKER_VALUE,
}

describe('validateDiscoverForm', () => {
  it('rejects prompts shorter than 3 characters (after trim)', () => {
    const r = validateDiscoverForm({ ...base, prompt: ' ab ' })
    expect(r.payload).toBeNull()
    expect(r.errors.prompt).toBe('promptTooShort')
  })

  it('builds the notebook-only payload', () => {
    expect(validateDiscoverForm(base).payload).toEqual({
      prompt: 'Solid state batteries',
      num_sources: 10,
    })
  })

  it('omits num_sources when blank and rejects invalid values', () => {
    expect(validateDiscoverForm({ ...base, numSources: '' }).payload).toEqual({ prompt: 'Solid state batteries' })
    for (const bad of ['0', '-1', '2.5', 'abc', '51']) {
      expect(validateDiscoverForm({ ...base, numSources: bad }).errors.numSources).toBe('numSourcesInvalid')
    }
  })

  it('requires an episode profile in podcast mode', () => {
    const r = validateDiscoverForm({ ...base, mode: 'podcast' })
    expect(r.payload).toBeNull()
    expect(r.errors.episodeProfile).toBe('episodeProfileRequired')
  })

  it('builds the podcast payload with profile names', () => {
    expect(
      validateDiscoverForm({ ...base, mode: 'podcast', episodeProfile: 'tech_discussion', speakerProfile: 'duo' }).payload
    ).toEqual({
      prompt: 'Solid state batteries',
      num_sources: 10,
      create_podcast: true,
      episode_profile: 'tech_discussion',
      speaker_profile: 'duo',
    })
  })

  it('omits speaker_profile when the default is selected', () => {
    const r = validateDiscoverForm({ ...base, mode: 'podcast', episodeProfile: 'tech_discussion' })
    expect(r.payload).not.toHaveProperty('speaker_profile')
  })
})
