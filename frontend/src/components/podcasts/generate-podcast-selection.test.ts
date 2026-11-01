import { describe, it, expect } from 'vitest'

import {
  getInvolvedNotebookIds,
  resolveNotebookChoice,
  type NotebookSelection,
} from './generate-podcast-selection'

const sel = (sources: Record<string, 'off' | 'full' | 'insights'> = {}, notes: Record<string, 'off' | 'full'> = {}): NotebookSelection => ({
  sources,
  notes,
})

describe('getInvolvedNotebookIds', () => {
  it('ignores notebooks with only "off" selections', () => {
    expect(
      getInvolvedNotebookIds({
        'notebook:a': sel({ 's1': 'full' }),
        'notebook:b': sel({ 's2': 'off' }, { n1: 'off' }),
        'notebook:c': sel({}, { n2: 'full' }),
      })
    ).toEqual(['notebook:a', 'notebook:c'])
  })
})

describe('resolveNotebookChoice', () => {
  const two = { 'notebook:a': sel({ s1: 'full' }), 'notebook:b': sel({ s2: 'insights' }) }

  it('uses the only involved notebook automatically', () => {
    const r = resolveNotebookChoice({ 'notebook:a': sel({ s1: 'full' }), 'notebook:b': sel({ s2: 'off' }) })
    expect(r).toMatchObject({ notebookId: 'notebook:a', needsChoice: false })
  })

  it('requires a choice when several notebooks are involved and none is picked', () => {
    const r = resolveNotebookChoice(two)
    expect(r).toMatchObject({ notebookId: null, needsChoice: true })
    expect(r.involved).toEqual(['notebook:a', 'notebook:b'])
  })

  it('uses the explicit choice when it is one of the involved notebooks', () => {
    expect(resolveNotebookChoice(two, 'notebook:b')).toMatchObject({ notebookId: 'notebook:b', needsChoice: false })
  })

  it('ignores a stale choice that is no longer involved', () => {
    expect(resolveNotebookChoice(two, 'notebook:z')).toMatchObject({ notebookId: null, needsChoice: true })
  })

  it('defaults to the originating notebook when it is involved', () => {
    expect(resolveNotebookChoice(two, null, 'notebook:a')).toMatchObject({ notebookId: 'notebook:a', needsChoice: false })
  })

  it('still requires a choice when the originating notebook is not involved', () => {
    expect(resolveNotebookChoice(two, null, 'notebook:z')).toMatchObject({ needsChoice: true })
  })

  it('falls back to the originating notebook when nothing is selected', () => {
    expect(resolveNotebookChoice({}, null, 'notebook:a')).toMatchObject({ notebookId: 'notebook:a', needsChoice: false })
    expect(resolveNotebookChoice({})).toMatchObject({ notebookId: null, needsChoice: false })
  })
})
