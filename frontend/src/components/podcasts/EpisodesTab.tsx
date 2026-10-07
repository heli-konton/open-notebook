'use client'

import { useState } from 'react'
import { AlertCircle, Loader2, RefreshCcw } from 'lucide-react'
import { useDeletePodcastEpisode, usePodcastEpisodes, useRetryPodcastEpisode } from '@/lib/hooks/use-podcasts'
import { useFolders } from '@/lib/hooks/use-folders'
import { FolderPanel, filterFolderItems } from '@/components/folders/FolderPanel'
import { FolderCollections } from '@/components/folders/FolderCollections'
import { groupEpisodesByStatus, type PodcastEpisode } from '@/lib/types/podcasts'
import { EpisodeCard } from './EpisodeCard'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { GeneratePodcastDialog } from './GeneratePodcastDialog'
import { useTranslation } from '@/lib/hooks/use-translation'

export function EpisodesTab({ selectedFolder, hideFolderNavigation = false }: { selectedFolder?: string; hideFolderNavigation?: boolean }) {
  const { t } = useTranslation()
  const [localFolder, setFolder] = useState('all')
  const [managementOpen, setManagementOpen] = useState(false)
  const [showGenerateDialog, setShowGenerateDialog] = useState(false)
  const { episodes, statusCounts, isLoading, isError, refetch, isFetching } = usePodcastEpisodes()
  const folders = useFolders('podcast')
  const deleteEpisode = useDeletePodcastEpisode()
  const retryEpisode = useRetryPodcastEpisode()
  const visible = filterFolderItems(episodes, selectedFolder ?? localFolder)
  const groups = groupEpisodesByStatus(visible)
  const cards = (data: PodcastEpisode[]) => <div className="episode-feed">{data.map(episode => <EpisodeCard key={episode.id} episode={episode} onDelete={id => deleteEpisode.mutateAsync(id)} deleting={deleteEpisode.isPending} onRetry={async id => { await retryEpisode.mutateAsync(id) }} retrying={retryEpisode.isPending} />)}</div>

  return <div className="podcast-library space-y-6">
    {!hideFolderNavigation && <FolderPanel kind="podcast" items={episodes} value={localFolder} onChange={setFolder} />}
    {isError && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>{t('podcasts.loadErrorTitle')}</AlertTitle><AlertDescription>{t('podcasts.loadErrorDesc')}</AlertDescription></Alert>}
    {isLoading && <p role="status" className="flex items-center gap-3 p-6"><Loader2 className="h-4 w-4 animate-spin" />{t('podcasts.loadingEpisodes')}</p>}
    {!isLoading && visible.length === 0 && <p className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">{t('podcasts.noEpisodesYet')}</p>}
    <section aria-label={t('podcasts.statusCompletedTitle')}><p className="sr-only">{t('podcasts.statusCompletedDesc')}</p>
      <FolderCollections items={groups.completed} folders={folders.data ?? []} renderItems={cards} />
    </section>
    <section className="podcast-management">
      <Button variant="outline" aria-expanded={managementOpen} aria-controls="podcast-management" onClick={() => setManagementOpen(open => !open)}>{t('common.actions')}<span className="management-count">{statusCounts.running + statusCounts.pending + statusCounts.failed}</span></Button>
      {managementOpen && <div id="podcast-management" className="space-y-6 mt-4">
        <h2 className="text-lg font-semibold">{t('podcasts.overviewTitle')}</h2><p className="text-sm text-muted-foreground">{t('podcasts.overviewDesc')}</p><p className="text-xs">{t('podcasts.total')}: {statusCounts.total}</p>
        <div className="flex flex-wrap gap-2"><Button onClick={() => setShowGenerateDialog(true)}>{t('podcasts.generateBtn')}</Button><Button variant="outline" onClick={() => void refetch()} disabled={isFetching}><RefreshCcw className="h-4 w-4" />{t('common.refresh')}</Button></div>
        {(['running', 'pending', 'failed'] as const).map(key => groups[key].length > 0 && <section key={key}><h3 className="text-sm font-semibold mb-3">{t(key === 'running' ? 'podcasts.statusRunningTitle' : key === 'pending' ? 'podcasts.statusPendingTitle' : 'podcasts.statusFailedTitle')} ({groups[key].length})</h3><p className="text-sm text-muted-foreground mb-3">{t(key === 'running' ? 'podcasts.statusRunningDesc' : key === 'pending' ? 'podcasts.statusPendingDesc' : 'podcasts.statusFailedDesc')}</p>{cards(groups[key])}</section>)}
      </div>}
    </section>
    <GeneratePodcastDialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog} />
  </div>
}
