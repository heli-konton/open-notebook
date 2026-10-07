import { render, screen, fireEvent, within } from '@testing-library/react'
import { it, expect, vi } from 'vitest'
import { EpisodesTab } from './EpisodesTab'
const episodes = [{id:'episode:1',name:'Filed episode',folder_id:'folder:1',job_status:'completed'},{id:'episode:2',name:'Unfiled episode',job_status:'completed'}]
vi.mock('@/lib/hooks/use-podcasts', () => ({ usePodcastEpisodes: () => ({ episodes, statusGroups:{completed:episodes}, statusCounts:{total:2,completed:2,running:0,pending:0,failed:0}, isLoading:false, refetch:vi.fn() }), useDeletePodcastEpisode: () => ({mutateAsync:vi.fn()}), useRetryPodcastEpisode: () => ({mutateAsync:vi.fn()}) }))
vi.mock('@/lib/hooks/use-folders', () => ({useFolders:()=>({data:[{id:'folder:1',name:'Research',kind:'podcast'}]}),useFolderMutation:()=>({mutateAsync:vi.fn()})}))
vi.mock('./EpisodeCard', () => ({EpisodeCard: ({episode}:{episode:{name:string}}) => <p>{episode.name}</p>}))
vi.mock('./GeneratePodcastDialog', () => ({GeneratePodcastDialog:()=>null}))
it('filters podcast status groups to the selected folder', () => {
  render(<EpisodesTab />)
  expect(screen.getByText('Filed episode')).toBeInTheDocument()
  fireEvent.click(within(screen.getByRole('complementary', {name:'folders.title'})).getByRole('button',{name:'folders.unfiled 1'}))
  expect(screen.queryByText('Filed episode')).toBeNull()
  expect(screen.getByText('Unfiled episode')).toBeInTheDocument()
  fireEvent.click(within(screen.getByRole('complementary', {name:'folders.title'})).getByRole('button',{name:'Research 1'}))
  expect(screen.getByText('Filed episode')).toBeInTheDocument()
  expect(screen.queryByText('Unfiled episode')).toBeNull()
})

it('uses folder collections for the playback feed and keeps pending workflows secondary', () => {
  episodes.push({id:'episode:3',name:'Queued episode',job_status:'pending'})
  render(<EpisodesTab />)
  const collection = within(screen.getByRole('region', {name:'podcasts.statusCompletedTitle'})).getByRole('button', {name:'Research 1'})
  expect(collection).toHaveAttribute('aria-expanded','true')
  fireEvent.click(collection)
  expect(screen.queryByText('Filed episode')).toBeNull()
  expect(screen.getByText('Unfiled episode')).toBeInTheDocument()
  expect(screen.queryByText('Queued episode')).toBeNull()
  fireEvent.click(screen.getByText('common.actions'))
  expect(screen.getByText('Queued episode')).toBeInTheDocument()
  episodes.pop()
})
