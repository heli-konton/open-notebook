'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useDiscoverNotebook } from '@/lib/hooks/use-notebooks'
import { useEpisodeProfiles, useSpeakerProfiles } from '@/lib/hooks/use-podcasts'
import { useTranslation } from '@/lib/hooks/use-translation'

import {
  DEFAULT_SPEAKER_VALUE,
  DISCOVER_DEFAULT_SOURCES,
  DISCOVER_MAX_SOURCES,
  type DiscoverMode,
  validateDiscoverForm,
} from './discover-notebook'

interface DiscoverNotebookDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: DiscoverMode
}

export function DiscoverNotebookDialog({ open, onOpenChange, mode }: DiscoverNotebookDialogProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const discover = useDiscoverNotebook()
  const isPodcast = mode === 'podcast'

  const { episodeProfiles } = useEpisodeProfiles()
  const { speakerProfiles } = useSpeakerProfiles(episodeProfiles)

  const [prompt, setPrompt] = useState('')
  const [numSources, setNumSources] = useState(String(DISCOVER_DEFAULT_SOURCES))
  const [episodeProfile, setEpisodeProfile] = useState('')
  const [speakerProfile, setSpeakerProfile] = useState(DEFAULT_SPEAKER_VALUE)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!open) {
      setPrompt('')
      setNumSources(String(DISCOVER_DEFAULT_SOURCES))
      setEpisodeProfile('')
      setSpeakerProfile(DEFAULT_SPEAKER_VALUE)
      setSubmitted(false)
    }
  }, [open])

  const { errors, payload } = validateDiscoverForm({
    mode,
    prompt,
    numSources,
    episodeProfile,
    speakerProfile,
  })
  const showErrors = submitted
  const isPending = discover.isPending

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    if (!payload || isPending) {
      return
    }
    try {
      const result = await discover.mutateAsync(payload)
      onOpenChange(false)
      router.push(`/notebooks/${encodeURIComponent(result.notebook_id)}`)
    } catch {
      // The mutation hook already shows an error toast; keep the dialog open.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {isPodcast ? t('notebooks.discoverPodcastTitle') : t('notebooks.discoverTitle')}
          </DialogTitle>
          <DialogDescription>
            {isPodcast ? t('notebooks.discoverPodcastDesc') : t('notebooks.discoverDesc')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="discover-prompt">{t('notebooks.discoverPrompt')} *</Label>
            <Textarea
              id="discover-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={t('notebooks.discoverPromptPlaceholder')}
              rows={4}
              disabled={isPending}
            />
            {showErrors && errors.prompt ? (
              <p className="text-sm text-destructive">{t('notebooks.discoverPromptTooShort')}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="discover-num-sources">{t('notebooks.discoverNumSources')}</Label>
            <Input
              id="discover-num-sources"
              type="number"
              min={1}
              max={DISCOVER_MAX_SOURCES}
              value={numSources}
              onChange={(event) => setNumSources(event.target.value)}
              disabled={isPending}
            />
            {showErrors && errors.numSources ? (
              <p className="text-sm text-destructive">{t('notebooks.discoverNumSourcesInvalid')}</p>
            ) : null}
          </div>

          {isPodcast ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="discover-episode-profile">{t('podcasts.episodeProfile')} *</Label>
                <Select value={episodeProfile} onValueChange={setEpisodeProfile} disabled={isPending}>
                  <SelectTrigger id="discover-episode-profile">
                    <SelectValue placeholder={t('podcasts.episodeProfilePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {episodeProfiles.map((profile) => (
                      <SelectItem key={profile.id} value={profile.name}>
                        {profile.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {showErrors && errors.episodeProfile ? (
                  <p className="text-sm text-destructive">{t('podcasts.profileRequiredDesc')}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="discover-speaker-profile">{t('notebooks.discoverSpeakerProfile')}</Label>
                <Select value={speakerProfile} onValueChange={setSpeakerProfile} disabled={isPending}>
                  <SelectTrigger id="discover-speaker-profile">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DEFAULT_SPEAKER_VALUE}>
                      {t('notebooks.discoverSpeakerDefault')}
                    </SelectItem>
                    {speakerProfiles.map((profile) => (
                      <SelectItem key={profile.id} value={profile.name}>
                        {profile.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isPending || !payload}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isPending ? t('notebooks.discovering') : t('notebooks.discoverSubmit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
