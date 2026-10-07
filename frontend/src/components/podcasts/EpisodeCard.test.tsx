import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { EpisodeCard } from './EpisodeCard'
import type { PodcastEpisode } from '@/lib/types/podcasts'

// useTranslation is mocked globally in setup.ts (t returns the key string)
const selectEpisode = vi.fn()
vi.mock('./PodcastPlayer', () => ({ usePodcastPlayer: () => ({ select: selectEpisode, playing: false, episode: null, clear: vi.fn() }) }))
vi.mock('@/lib/hooks/use-folders', () => ({ useFolders: () => ({ data: [] }), useFolderMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) }))

it('opens the persistent player without mounting competing card audio nodes', () => {
  const episode = makeEpisode({ audio_url: '/api/podcasts/episodes/episode:1/audio' })
  const view = render(<EpisodeCard episode={episode} onDelete={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'player.play' }))
  expect(selectEpisode).toHaveBeenCalledWith(episode)
  expect(view.container.querySelector('audio')).toBeNull()
})

vi.mock('@/lib/api/client', () => ({
  default: { get: vi.fn() },
}))

vi.mock('@/lib/api/podcasts', () => ({
  resolvePodcastAssetUrl: vi.fn(async () => undefined),
}))

function makeEpisode(overrides: Partial<PodcastEpisode> = {}): PodcastEpisode {
  return {
    id: 'episode:1',
    name: 'Test Episode',
    episode_profile: {
      id: 'episode_profile:1',
      name: 'default',
      description: '',
      speaker_config: null,
      default_briefing: '',
      num_segments: 5,
    },
    speaker_profile: {
      id: 'speaker_profile:1',
      name: 'default',
      description: '',
      speakers: [],
    },
    briefing: 'briefing',
    job_status: 'completed',
    ...overrides,
  }
}

function renderAndOpenDetails(episode: PodcastEpisode) {
  render(<EpisodeCard episode={episode} onDelete={vi.fn()} />)
  fireEvent.click(screen.getByText('podcasts.details'))
}

describe('EpisodeCard model details', () => {
  it('renders API-resolved model display fields for new episodes', () => {
    renderAndOpenDetails(
      makeEpisode({
        episode_profile: {
          id: 'episode_profile:1',
          name: 'modern',
          description: '',
          speaker_config: null,
          default_briefing: '',
          num_segments: 5,
          outline_llm: 'model:outline',
          transcript_llm: 'model:transcript',
          outline_model_provider: 'openai',
          outline_model_name: 'gpt-4o',
          transcript_model_provider: 'anthropic',
          transcript_model_name: 'claude-sonnet',
        },
        speaker_profile: {
          id: 'speaker_profile:1',
          name: 'modern',
          description: '',
          speakers: [],
          voice_model: 'model:voice',
          voice_model_provider: 'elevenlabs',
          voice_model_name: 'eleven_turbo',
        },
      })
    )

    expect(screen.getByText('openai / gpt-4o')).toBeInTheDocument()
    expect(screen.getByText('anthropic / claude-sonnet')).toBeInTheDocument()
    expect(screen.getByText('elevenlabs / eleven_turbo')).toBeInTheDocument()
  })

  it('falls back to legacy snapshot strings for old episodes', () => {
    renderAndOpenDetails(
      makeEpisode({
        episode_profile: {
          id: 'episode_profile:1',
          name: 'legacy',
          description: '',
          speaker_config: null,
          default_briefing: '',
          num_segments: 5,
          outline_provider: 'openai',
          outline_model: 'gpt-3.5-turbo',
          transcript_provider: 'openai',
          transcript_model: 'gpt-4',
        },
        speaker_profile: {
          id: 'speaker_profile:1',
          name: 'legacy',
          description: '',
          speakers: [],
          tts_provider: 'openai',
          tts_model: 'tts-1',
        },
      })
    )

    expect(screen.getByText('openai / gpt-3.5-turbo')).toBeInTheDocument()
    expect(screen.getByText('openai / gpt-4')).toBeInTheDocument()
    expect(screen.getByText('openai / tts-1')).toBeInTheDocument()
  })

  it('degrades to dashes when references are unresolvable and no legacy strings exist', () => {
    renderAndOpenDetails(
      makeEpisode({
        episode_profile: {
          id: 'episode_profile:1',
          name: 'orphaned',
          description: '',
          speaker_config: null,
          default_briefing: '',
          num_segments: 5,
          outline_llm: 'model:deleted',
          transcript_llm: 'model:deleted',
        },
        speaker_profile: {
          id: 'speaker_profile:1',
          name: 'orphaned',
          description: '',
          speakers: [],
          voice_model: 'model:deleted',
        },
      })
    )

    expect(screen.getAllByText('— / —')).toHaveLength(3)
  })
})

it('keeps mobile feed playback first while exposing episode management on demand', () => {
  vi.mocked(window.matchMedia).mockImplementationOnce(query => ({matches:true,media:query,onchange:null,addListener:vi.fn(),removeListener:vi.fn(),addEventListener:vi.fn(),removeEventListener:vi.fn(),dispatchEvent:vi.fn()}))
  render(<EpisodeCard episode={makeEpisode({audio_url:'/api/podcasts/episodes/episode:1/audio'})} onDelete={vi.fn()} />)
  expect(screen.getByRole('button',{name:'player.play'})).toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'podcasts.delete'})).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'common.actions'}))
  expect(screen.getByRole('button',{name:'podcasts.delete'})).toBeInTheDocument()
  expect(screen.getByRole('button',{name:'podcasts.details'})).toBeInTheDocument()
})
