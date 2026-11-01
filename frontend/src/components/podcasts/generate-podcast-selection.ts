import { SourceListResponse } from '@/lib/types/api'

export type SourceMode = 'off' | 'insights' | 'full'

export interface NotebookSelection {
  sources: Record<string, SourceMode>
  notes: Record<string, SourceMode>
}

export interface NotebookSummary {
  notebookId: string
  sources: number
  notes: number
}

export interface NotebookContextConfig {
  notebookId: string
  contextConfig: {
    sources: Record<string, string>
    notes: Record<string, string>
  }
}

// Helper function to format large numbers with K/M suffixes
export function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`
  }
  return num.toString()
}

export function hasSelections(selection?: NotebookSelection): boolean {
  if (!selection) {
    return false
  }
  return (
    Object.values(selection.sources).some((mode) => mode !== 'off') ||
    Object.values(selection.notes).some((mode) => mode !== 'off')
  )
}

export function getSourceDefaultMode(source: SourceListResponse): SourceMode {
  return source.insights_count && source.insights_count > 0 ? 'insights' : 'full'
}

/**
 * Convert the per-notebook selection state into build-context configs,
 * skipping notebooks with no active selections.
 */
export function selectionsToContextConfigs(
  selections: Record<string, NotebookSelection>
): NotebookContextConfig[] {
  const configs: NotebookContextConfig[] = []

  Object.entries(selections).forEach(([notebookId, selection]) => {
    const sourcesConfig = Object.entries(selection.sources)
      .filter(([, mode]) => mode !== 'off')
      .reduce<Record<string, string>>((acc, [sourceId, mode]) => {
        const normalizedId = sourceId.replace(/^source:/, '')
        acc[normalizedId] = mode === 'insights' ? 'insights' : 'full content'
        return acc
      }, {})

    const notesConfig = Object.entries(selection.notes)
      .filter(([, mode]) => mode !== 'off')
      .reduce<Record<string, string>>((acc, [noteId]) => {
        const normalizedId = noteId.replace(/^note:/, '')
        acc[normalizedId] = 'full content'
        return acc
      }, {})

    if (Object.keys(sourcesConfig).length === 0 && Object.keys(notesConfig).length === 0) {
      return
    }

    configs.push({
      notebookId,
      contextConfig: {
        sources: sourcesConfig,
        notes: notesConfig,
      },
    })
  })

  return configs
}

/** Notebook ids that currently have at least one active source/note selection. */
export function getInvolvedNotebookIds(
  selections: Record<string, NotebookSelection>
): string[] {
  return Object.entries(selections)
    .filter(([, selection]) => hasSelections(selection))
    .map(([notebookId]) => notebookId)
}

export interface NotebookChoice {
  /** Notebook the episode will be filed under, or null if none/unchosen. */
  notebookId: string | null
  /** True when the user must pick one of `involved` before submitting. */
  needsChoice: boolean
  involved: string[]
}

/**
 * Decide which notebook an episode is filed under.
 * - exactly one involved notebook: use it automatically
 * - several: the user's pick (or the notebook the dialog was opened from, if
 *   it is among them); otherwise unresolved and a choice is required
 * - none: fall back to the notebook the dialog was opened from (if any)
 */
export function resolveNotebookChoice(
  selections: Record<string, NotebookSelection>,
  chosenNotebookId?: string | null,
  defaultNotebookId?: string | null
): NotebookChoice {
  const involved = getInvolvedNotebookIds(selections)

  if (involved.length === 0) {
    return { notebookId: defaultNotebookId ?? null, needsChoice: false, involved }
  }
  if (involved.length === 1) {
    return { notebookId: involved[0], needsChoice: false, involved }
  }
  if (chosenNotebookId && involved.includes(chosenNotebookId)) {
    return { notebookId: chosenNotebookId, needsChoice: false, involved }
  }
  if (defaultNotebookId && involved.includes(defaultNotebookId)) {
    return { notebookId: defaultNotebookId, needsChoice: false, involved }
  }
  return { notebookId: null, needsChoice: true, involved }
}
