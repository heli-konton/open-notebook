'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { Pause, Play, RotateCcw, Square, X } from 'lucide-react'
import apiClient from '@/lib/api/client'
import { resolvePodcastAssetUrl } from '@/lib/api/podcasts'
import type { PodcastEpisode } from '@/lib/types/podcasts'
import { useTranslation } from '@/lib/hooks/use-translation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog'
import { EpisodeArtwork } from './EpisodeArtwork'

type Player = { episode: PodcastEpisode | null; playing: boolean; select: (episode: PodcastEpisode) => Promise<void>; clear: (id?: string) => void }
const PlayerContext = createContext<Player>({ episode: null, playing: false, select: async () => {}, clear: () => {} })
export function usePodcastPlayer() { return useContext(PlayerContext) }

function clock(seconds: number) {
  const value = Math.max(0, Math.floor(seconds))
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`
}

/** One audio element for the authenticated dashboard, including navigation.
 * Protected audio is fetched on demand via the existing authenticated client.
 * A Blob URL retains local seeking; backend FileResponse range support remains
 * untouched. No raw disk-path fallback, anonymous fetch, or competing players.
 */
export function PodcastPlayerProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const audio = useRef<HTMLAudioElement>(null)
  const current = useRef<PodcastEpisode | null>(null)
  const objectUrl = useRef<string | null>(null)
  const request = useRef<AbortController | null>(null)
  const serial = useRef(0)
  const [episode, setEpisode] = useState<PodcastEpisode | null>(null)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [expanded, setExpanded] = useState(false)

  const release = () => {
    serial.current++
    request.current?.abort()
    request.current = null
    audio.current?.pause()
    audio.current?.removeAttribute('src')
    audio.current?.load()
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    objectUrl.current = null
  }
  useEffect(() => () => { release() }, [])

  const resume = async () => {
    const token = serial.current
    const id = current.current?.id
    const node = audio.current
    if (!node || !id) return
    try {
      await node.play()
      if (serial.current === token && current.current?.id === id) setError(false)
    } catch {
      if (serial.current === token && current.current?.id === id) {
        setError(true)
        setPlaying(false)
      }
    }
  }
  const clear = (id?: string) => {
    if (id && current.current?.id !== id) return
    release()
    current.current = null
    setExpanded(false)
    setEpisode(null); setPlaying(false); setLoading(false); setError(false)
    setPosition(0); setDuration(0)
  }
  const select = async (next: PodcastEpisode) => {
    if (current.current?.id === next.id && objectUrl.current) {
      if (playing) audio.current?.pause()
      else await resume()
      return
    }
    release()
    current.current = next
    setEpisode(next); setPlaying(false); setLoading(true); setError(false)
    setPosition(0); setDuration(0)
    const token = serial.current
    const controller = new AbortController()
    request.current = controller
    try {
      // Only the backend's authenticated audio endpoint is playable.
      const path = `/api/podcasts/episodes/${encodeURIComponent(next.id)}/audio`
      const url = await resolvePodcastAssetUrl(path)
      if (!url || !next.audio_url) throw new Error('Audio unavailable')
      const response = await apiClient.get<Blob>(url, { responseType: 'blob', signal: controller.signal })
      if (serial.current !== token || controller.signal.aborted) return
      const blobUrl = URL.createObjectURL(response.data)
      objectUrl.current = blobUrl
      if (audio.current) { audio.current.src = blobUrl; audio.current.load() }
      setLoading(false)
      await resume()
    } catch {
      if (serial.current === token && !controller.signal.aborted) { setLoading(false); setError(true) }
    }
  }
  const seek = (value: number) => {
    if (!audio.current || !Number.isFinite(value)) return
    const bounded = Math.min(duration, Math.max(0, value))
    audio.current.currentTime = bounded
    setPosition(bounded)
  }
  const stop = () => { audio.current?.pause(); seek(0); setPlaying(false) }

  const togglePlayback = () => {
    if (playing) audio.current?.pause()
    else if (objectUrl.current) void resume()
    else if (episode) void select(episode)
  }
  const timeline = () => <div className="player-timeline">
    <input type="range" aria-label={t('player.seek')} aria-valuetext={`${clock(position)} / ${clock(duration)}`} min={0} max={duration || 0} step={1} value={Math.min(position, duration)} disabled={loading || !duration} onChange={e => seek(Number(e.target.value))} />
    <span className="font-mono text-xs text-muted-foreground">{clock(position)} / {clock(duration)}</span>
  </div>
  const controls = () => <div className="player-controls">
    <Button variant="ghost" disabled={loading || !duration} aria-label={t('player.rewind')} onClick={() => seek((audio.current?.currentTime ?? 0) - 15)}><RotateCcw aria-hidden className="h-5 w-5" /><span>15</span></Button>
    <Button className="player-primary" disabled={loading} aria-label={t(playing ? 'player.pause' : 'player.play')} onClick={togglePlayback}>{playing ? <Pause aria-hidden className="h-6 w-6" /> : <Play aria-hidden className="h-6 w-6" />}</Button>
    <Button className="player-stop" variant="ghost" disabled={loading} aria-label={t('player.stop')} onClick={stop}><Square aria-hidden className="h-5 w-5" /></Button>
  </div>
  const feedback = () => <>{loading && <p role="status">{t('common.loading')}</p>}{error && <p role="alert" className="text-destructive">{t('podcasts.audioUnavailable')}</p>}</>
  const source = episode?.episode_profile?.name || t('common.unknown')

  return <PlayerContext.Provider value={{ episode, playing, select, clear }}>
    {children}
    <audio ref={audio} preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={() => { setError(true); setPlaying(false) }} onTimeUpdate={() => setPosition(audio.current?.currentTime ?? 0)} onLoadedMetadata={() => { const seconds = audio.current?.duration ?? 0; setDuration(Number.isFinite(seconds) ? seconds : 0) }} />
    {episode && <Dialog open={expanded} onOpenChange={setExpanded}>
      <section className="podcast-player" aria-label={t('player.title')}>
        <DialogTrigger asChild><button className="player-track" aria-label={t('player.expand')}>
          <EpisodeArtwork /><span className="min-w-0"><span className="player-track-title">{episode.name}</span><span className="player-source">{t('podcasts.profile')}: {source}</span></span>
        </button></DialogTrigger>
        <div className="player-transport">{controls()}{timeline()}</div>
        <Button className="player-clear" variant="ghost" aria-label={t('player.close')} onClick={() => clear()}><X aria-hidden className="h-5 w-5" /></Button>
        <div className="player-feedback">{feedback()}</div>
      </section>
      <DialogContent className="now-playing-sheet" onCloseAutoFocus={event => {
        // Radix restores focus to the mini-player trigger on dismissal.
        if (!current.current) event.preventDefault()
      }}>
        <p className="now-playing-label text-center">{t('player.title')}</p>
        <EpisodeArtwork large />
        <DialogHeader><DialogTitle>{episode.name}</DialogTitle><DialogDescription>{t('podcasts.profile')}: {source}</DialogDescription></DialogHeader>
        {feedback()}{timeline()}{controls()}
        <Button variant="ghost" onClick={() => setExpanded(false)}>{t('player.minimize')}</Button>
      </DialogContent>
    </Dialog>}
  </PlayerContext.Provider>
}
