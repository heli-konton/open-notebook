import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

import { NotebookPodcasts } from './NotebookPodcasts'
import type { PodcastEpisode } from '@/lib/types/podcasts'

let episodes: PodcastEpisode[] = []
const usePodcastEpisodes = vi.fn()
vi.mock('@/lib/hooks/use-podcasts', () => ({
  usePodcastEpisodes: (...args: unknown[]) => usePodcastEpisodes(...args),
}))
vi.mock('@/components/podcasts/GeneratePodcastDialog', () => ({
  GeneratePodcastDialog: () => null,
}))
vi.mock('@/lib/hooks/use-episode-audio', () => ({
  useEpisodeAudio: (_e: unknown, enabled: boolean) => ({
    audioSrc: enabled ? 'blob:audio' : undefined,
    audioError: null,
  }),
}))

function ep(overrides: Partial<PodcastEpisode>): PodcastEpisode {
  return {
    id: 'episode:1',
    name: 'Ep',
    episode_profile: { id: 'p', name: 'p', description: '', speaker_config: null, default_briefing: '', num_segments: 3 },
    speaker_profile: { id: 's', name: 's', description: '', speakers: [] },
    briefing: '',
    notebook_id: 'notebook:1',
    ...overrides,
  }
}

describe('NotebookPodcasts', () => {
  beforeEach(() => {
    episodes = []
    usePodcastEpisodes.mockImplementation(() => ({ episodes, isLoading: false }))
  })

  it('scopes the query to the notebook and shows the empty state', () => {
    render(<NotebookPodcasts notebookId="notebook:1" />)
    expect(usePodcastEpisodes).toHaveBeenCalledWith({ notebookId: 'notebook:1' })
    expect(screen.getByText('podcasts.noNotebookPodcasts')).toBeInTheDocument()
  })

  it('shows progress for running episodes and a player for completed ones', () => {
    episodes = [
      ep({ id: 'episode:1', name: 'Running ep', job_status: 'running', progress: 35 }),
      ep({ id: 'episode:2', name: 'Done ep', job_status: 'completed', progress: 100 }),
    ]
    const { container } = render(<NotebookPodcasts notebookId="notebook:1" />)
    expect(screen.getByText('Running ep')).toBeInTheDocument()
    expect(screen.getByText('35%')).toBeInTheDocument()
    expect(screen.getAllByTestId('episode-progress')).toHaveLength(1)
    expect(container.querySelectorAll('audio')).toHaveLength(1)
  })
})
