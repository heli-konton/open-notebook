import type { NotebookDiscoverRequest } from '@/lib/types/api'

export type DiscoverMode = 'notebook' | 'podcast'

export const DISCOVER_MIN_PROMPT_LENGTH = 3
export const DISCOVER_DEFAULT_SOURCES = 10
export const DISCOVER_MAX_SOURCES = 50
/** Select sentinel meaning "use the episode profile's speaker profile". */
export const DEFAULT_SPEAKER_VALUE = '__default__'

export interface DiscoverFormValues {
  mode: DiscoverMode
  prompt: string
  numSources: string
  episodeProfile: string
  speakerProfile: string
}

export type DiscoverErrorKey =
  | 'promptTooShort'
  | 'numSourcesInvalid'
  | 'episodeProfileRequired'

export interface DiscoverValidation {
  errors: Partial<Record<'prompt' | 'numSources' | 'episodeProfile', DiscoverErrorKey>>
  payload: NotebookDiscoverRequest | null
}

/** Validate the form and build the POST /notebooks/discover payload. */
export function validateDiscoverForm(values: DiscoverFormValues): DiscoverValidation {
  const errors: DiscoverValidation['errors'] = {}
  const prompt = values.prompt.trim()

  if (prompt.length < DISCOVER_MIN_PROMPT_LENGTH) {
    errors.prompt = 'promptTooShort'
  }

  let numSources: number | undefined
  const rawNum = values.numSources.trim()
  if (rawNum !== '') {
    const parsed = Number(rawNum)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > DISCOVER_MAX_SOURCES) {
      errors.numSources = 'numSourcesInvalid'
    } else {
      numSources = parsed
    }
  }

  if (values.mode === 'podcast' && !values.episodeProfile) {
    errors.episodeProfile = 'episodeProfileRequired'
  }

  if (Object.keys(errors).length > 0) {
    return { errors, payload: null }
  }

  const payload: NotebookDiscoverRequest = { prompt }
  if (numSources !== undefined) {
    payload.num_sources = numSources
  }
  if (values.mode === 'podcast') {
    payload.create_podcast = true
    payload.episode_profile = values.episodeProfile
    if (values.speakerProfile && values.speakerProfile !== DEFAULT_SPEAKER_VALUE) {
      payload.speaker_profile = values.speakerProfile
    }
  }
  return { errors, payload }
}
