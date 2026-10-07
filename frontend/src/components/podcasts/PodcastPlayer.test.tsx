import { it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { PodcastPlayerProvider, usePodcastPlayer } from './PodcastPlayer'
import apiClient from '@/lib/api/client'
import type { PodcastEpisode } from '@/lib/types/podcasts'
vi.mock('@/lib/api/client', () => ({ default: { get: vi.fn(async () => ({ data: new Blob(['audio']) })) } }))
vi.mock('@/lib/api/podcasts', () => ({ resolvePodcastAssetUrl: vi.fn(async (path: string) => 'http://test' + path) }))
const episode = { id:'episode:1', name:'Real episode', audio_url:'/api/podcasts/episodes/episode:1/audio' } as PodcastEpisode
function Harness() { const player = usePodcastPlayer(); return <button onClick={() => void player.select(episode)}>Select</button> }
it('uses one authenticated audio node; pause resumes position, seek, rewind and stop reset', async () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async function(this: HTMLMediaElement) { fireEvent.play(this) })
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function(this: HTMLMediaElement) { fireEvent.pause(this) })
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  URL.createObjectURL = vi.fn(() => 'blob:real')
  URL.revokeObjectURL = vi.fn()
  const view = render(<PodcastPlayerProvider><Harness /></PodcastPlayerProvider>)
  fireEvent.click(screen.getByText('Select'))
  await waitFor(() => expect(play).toHaveBeenCalled())
  const audio = view.container.querySelector('audio')!
  expect(view.container.querySelectorAll('audio')).toHaveLength(1)
  expect(apiClient.get).toHaveBeenCalledWith('http://test/api/podcasts/episodes/episode%3A1/audio', expect.objectContaining({ responseType:'blob', signal:expect.any(AbortSignal) }))
  Object.defineProperty(audio, 'duration', {configurable:true,value:120})
  fireEvent.loadedMetadata(audio)
  audio.currentTime = 45
  fireEvent.timeUpdate(audio)
  fireEvent.click(screen.getByRole('button', {name:'player.pause'}))
  expect(audio.currentTime).toBe(45)
  fireEvent.click(screen.getByRole('button', {name:'player.play'}))
  await waitFor(() => expect(play).toHaveBeenCalledTimes(2))
  expect(audio.currentTime).toBe(45)
  fireEvent.click(screen.getByRole('button', {name:'player.rewind'}))
  expect(audio.currentTime).toBe(30)
  fireEvent.change(screen.getByRole('slider', {name:'player.seek'}), {target:{value:'80'}})
  expect(audio.currentTime).toBe(80)
  fireEvent.click(screen.getByRole('button', {name:'player.stop'}))
  expect(audio.currentTime).toBe(0)
  view.unmount()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:real')
})

function SwitchHarness() {
  const player = usePodcastPlayer()
  return <><button onClick={() => void player.select(episode)}>First</button><button onClick={() => void player.select({ ...episode, id: 'episode:2', name: 'Second episode' })}>Second</button></>
}
it.each(['resolve', 'reject'] as const)('ignores stale play %s settlement after changing episode', async settlement => {
  let resolve!: () => void
  let reject!: (reason: Error) => void
  const pending = new Promise<void>((yes, no) => { resolve = yes; reject = no })
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockReset().mockImplementationOnce(() => pending)
    .mockImplementationOnce(async function(this: HTMLMediaElement) {
      if (settlement === 'resolve') throw new Error('Current episode blocked')
      fireEvent.play(this)
    })
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  URL.createObjectURL = vi.fn(() => 'blob:audio')
  URL.revokeObjectURL = vi.fn()
  render(<PodcastPlayerProvider><SwitchHarness /></PodcastPlayerProvider>)
  fireEvent.click(screen.getByText('First'))
  await waitFor(() => expect(play).toHaveBeenCalledTimes(1))
  fireEvent.click(screen.getByText('Second'))
  await waitFor(() => expect(play).toHaveBeenCalledTimes(2))
  if (settlement === 'resolve') expect(screen.getByRole('alert')).toBeInTheDocument()
  else expect(screen.queryByRole('alert')).toBeNull()
  await act(async () => { if (settlement === 'resolve') resolve(); else reject(new Error('Stale play rejected')) })
  expect(screen.getByText('Second episode')).toBeInTheDocument()
  if (settlement === 'resolve') expect(screen.getByRole('alert')).toBeInTheDocument()
  else { expect(screen.queryByRole('alert')).toBeNull(); expect(screen.getByRole('button', {name:'player.pause'})).toBeInTheDocument() }
})

it('expands mini-player into a dismissible sheet, restores focus and preserves playback', async () => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockReset().mockImplementation(async function(this: HTMLMediaElement) { fireEvent.play(this) })
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  URL.createObjectURL = vi.fn(() => 'blob:sheet')
  URL.revokeObjectURL = vi.fn()
  const view = render(<PodcastPlayerProvider><Harness /></PodcastPlayerProvider>)
  fireEvent.click(screen.getByText('Select'))
  const trigger = await screen.findByRole('button', {name:'player.expand'})
  trigger.focus()
  fireEvent.click(trigger)
  expect(screen.getByRole('dialog', {name:'Real episode'})).toBeInTheDocument()
  expect(screen.getByRole('slider', {name:'player.seek'})).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', {name:'player.minimize'}))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  await waitFor(() => expect(trigger).toHaveFocus())
  expect(screen.getByRole('button', {name:'player.pause'})).toBeInTheDocument()
  expect(view.container.querySelectorAll('audio')).toHaveLength(1)
})
