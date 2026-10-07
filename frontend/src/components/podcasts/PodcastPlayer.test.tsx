import { it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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
