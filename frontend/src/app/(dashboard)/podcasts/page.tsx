'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Mic, LayoutTemplate } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { FolderPanel } from '@/components/folders/FolderPanel'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { EpisodesTab } from '@/components/podcasts/EpisodesTab'
import { TemplatesTab } from '@/components/podcasts/TemplatesTab'
import { useTranslation } from '@/lib/hooks/use-translation'
import { useEpisodeProfiles, useSpeakerProfiles, usePodcastEpisodes } from '@/lib/hooks/use-podcasts'
import { needsModelSetup } from '@/lib/types/podcasts'

export default function PodcastsPage() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<'episodes' | 'templates'>('episodes')
  const [folder, setFolder] = useState('all')
  const { episodes } = usePodcastEpisodes()
  const { episodeProfiles } = useEpisodeProfiles()
  const { speakerProfiles } = useSpeakerProfiles(episodeProfiles)
  const hasUnconfiguredProfiles = useMemo(() => episodeProfiles.some(needsModelSetup) || speakerProfiles.some(needsModelSetup), [episodeProfiles, speakerProfiles])

  return <AppShell libraryNavigation={<FolderPanel kind="podcast" items={episodes} value={folder} onChange={setFolder} />}>
    <div className="flex-1 overflow-y-auto"><div className="podcasts-page px-6 py-6 space-y-6">
      <div className="library-page-heading"><h1 className="text-2xl font-semibold tracking-tight">{t('podcasts.listTitle')}</h1><p className="text-muted-foreground library-page-description">{t('podcasts.listDesc')}</p></div>
      <Tabs value={activeTab} onValueChange={value => setActiveTab(value as 'episodes' | 'templates')} className="space-y-6">
        <TabsList aria-label={t('common.accessibility.podcastViews')} className="podcast-view-controls" title={t('podcasts.chooseAView')}>
          <TabsTrigger value="episodes"><Mic className="h-4 w-4" />{t('podcasts.episodesTab')}</TabsTrigger>
          <TabsTrigger value="templates"><LayoutTemplate className="h-4 w-4" />{t('podcasts.templatesTab')}</TabsTrigger>
        </TabsList>
        <TabsContent value="episodes"><EpisodesTab selectedFolder={folder} hideFolderNavigation /></TabsContent>
        <TabsContent value="templates"><TemplatesTab /></TabsContent>
      </Tabs>
      <Button className="mobile-template-control" variant="ghost" onClick={() => setActiveTab(activeTab === 'episodes' ? 'templates' : 'episodes')}>{t(activeTab === 'episodes' ? 'podcasts.templatesTab' : 'podcasts.episodesTab')}</Button>
      {hasUnconfiguredProfiles && <details className="podcast-setup"><summary>{t('podcasts.setupRequired')}</summary><Alert className="mt-3"><AlertTriangle className="h-4 w-4" /><AlertTitle>{t('podcasts.setupRequired')}</AlertTitle><AlertDescription>{t('podcasts.setupRequiredDesc')}</AlertDescription></Alert></details>}
    </div></div>
  </AppShell>
}
