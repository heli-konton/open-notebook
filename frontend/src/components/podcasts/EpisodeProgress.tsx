'use client'

import { Progress } from '@/components/ui/progress'
import { useTranslation } from '@/lib/hooks/use-translation'
import {
  ACTIVE_EPISODE_STATUSES,
  type EpisodeStatus,
} from '@/lib/types/podcasts'
import { cn } from '@/lib/utils'

/** Clamp to an integer 0-100; null/undefined/NaN -> null (unknown). */
export function normalizeProgress(progress?: number | null): number | null {
  if (typeof progress !== 'number' || Number.isNaN(progress)) {
    return null
  }
  return Math.min(100, Math.max(0, Math.round(progress)))
}

/** True while an episode is generating (progress bar should be shown). */
export function isEpisodeInProgress(status?: EpisodeStatus | null): boolean {
  return !!status && ACTIVE_EPISODE_STATUSES.includes(status)
}

interface EpisodeProgressProps {
  status?: EpisodeStatus | null
  progress?: number | null
  className?: string
}

/**
 * Progress bar + "NN%" for an unfinished episode. Falls back to an
 * indeterminate (pulsing) bar when `progress` is unknown. Renders nothing for
 * finished/failed episodes.
 */
export function EpisodeProgress({ status, progress, className }: EpisodeProgressProps) {
  const { t } = useTranslation()

  if (!isEpisodeInProgress(status)) {
    return null
  }

  const value = normalizeProgress(progress)

  return (
    <div
      className={cn('flex items-center gap-3', className)}
      data-testid="episode-progress"
    >
      <Progress
        value={value ?? 100}
        aria-label={t('podcasts.progressLabel')}
        aria-valuenow={value ?? undefined}
        data-indeterminate={value === null ? 'true' : undefined}
        className={cn('h-2 flex-1', value === null && 'animate-pulse')}
      />
      {value !== null ? (
        <span className="w-10 text-right text-xs font-mono text-muted-foreground">
          {value}%
        </span>
      ) : null}
    </div>
  )
}
