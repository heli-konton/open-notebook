import { AudioLines } from 'lucide-react'

/** Decorative cover for episodes: no remote artwork or invented source data. */
export function EpisodeArtwork({ large = false }: { large?: boolean }) {
  return <div className={`episode-artwork${large ? ' episode-artwork-large' : ''}`} aria-hidden="true"><AudioLines /></div>
}
