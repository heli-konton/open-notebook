import { render, screen, fireEvent } from '@testing-library/react'
import { it, expect, vi } from 'vitest'
import PodcastsPage from './page'
vi.mock('@/components/layout/AppShell',()=>({AppShell:({children,libraryNavigation}:{children:React.ReactNode;libraryNavigation:React.ReactNode})=><>{libraryNavigation}{children}</>}))
vi.mock('@/lib/hooks/use-podcasts',()=>({useEpisodeProfiles:()=>({episodeProfiles:[]}),useSpeakerProfiles:()=>({speakerProfiles:[]}),usePodcastEpisodes:()=>({episodes:[]})}))
vi.mock('@/lib/hooks/use-folders',()=>({useFolders:()=>({data:[]}),useFolderMutation:()=>({mutateAsync:vi.fn()})}))
vi.mock('@/components/podcasts/EpisodesTab',()=>({EpisodesTab:()=> <p>Playback library</p>}))
vi.mock('@/components/podcasts/TemplatesTab',()=>({TemplatesTab:()=> <p>Template management</p>}))
it('keeps template workflows accessible through a secondary mobile control', () => {
  render(<PodcastsPage />)
  fireEvent.click(screen.getByRole('button',{name:'podcasts.templatesTab'}))
  expect(screen.getByText('Template management')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'podcasts.episodesTab'}))
  expect(screen.getByText('Playback library')).toBeInTheDocument()
})
