import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { DiscoverNotebookDialog } from './DiscoverNotebookDialog'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
}))

const mutateAsync = vi.fn()
let isPending = false
vi.mock('@/lib/hooks/use-notebooks', () => ({
  useDiscoverNotebook: () => ({ mutateAsync, isPending }),
}))

vi.mock('@/lib/hooks/use-podcasts', () => ({
  useEpisodeProfiles: () => ({ episodeProfiles: [{ id: 'ep:1', name: 'tech' }] }),
  useSpeakerProfiles: () => ({ speakerProfiles: [{ id: 'sp:1', name: 'duo' }] }),
}))

describe('DiscoverNotebookDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isPending = false
  })

  it('does not submit a too-short prompt and shows the error', () => {
    render(<DiscoverNotebookDialog open onOpenChange={vi.fn()} mode="notebook" />)
    fireEvent.change(screen.getByLabelText(/notebooks.discoverPrompt/), { target: { value: 'ab' } })
    expect(screen.getByRole('button', { name: 'notebooks.discoverSubmit' })).toBeDisabled()
    fireEvent.submit(screen.getByLabelText(/notebooks.discoverPrompt/).closest('form')!)
    expect(mutateAsync).not.toHaveBeenCalled()
    expect(screen.getByText('notebooks.discoverPromptTooShort')).toBeInTheDocument()
  })

  it('submits the payload and navigates to the new notebook', async () => {
    mutateAsync.mockResolvedValue({ notebook_id: 'notebook:xyz', job_id: 'j', status: 'queued' })
    const onOpenChange = vi.fn()
    render(<DiscoverNotebookDialog open onOpenChange={onOpenChange} mode="notebook" />)
    fireEvent.change(screen.getByLabelText(/notebooks.discoverPrompt/), { target: { value: 'Quantum computing' } })
    fireEvent.change(screen.getByLabelText('notebooks.discoverNumSources'), { target: { value: '7' } })
    fireEvent.click(screen.getByRole('button', { name: 'notebooks.discoverSubmit' }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ prompt: 'Quantum computing', num_sources: 7 }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/notebooks/notebook%3Axyz'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('podcast mode shows profile selects and disables submit until a profile is chosen', () => {
    render(<DiscoverNotebookDialog open onOpenChange={vi.fn()} mode="podcast" />)
    fireEvent.change(screen.getByLabelText(/notebooks.discoverPrompt/), { target: { value: 'Quantum computing' } })
    expect(screen.getByLabelText(/podcasts.episodeProfile/)).toBeInTheDocument()
    expect(screen.getByLabelText('notebooks.discoverSpeakerProfile')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'notebooks.discoverSubmit' })).toBeDisabled()
  })

  it('disables submit while pending and stays open on error', async () => {
    isPending = true
    const { rerender } = render(<DiscoverNotebookDialog open onOpenChange={vi.fn()} mode="notebook" />)
    expect(screen.getByRole('button', { name: 'notebooks.discovering' })).toBeDisabled()

    isPending = false
    mutateAsync.mockRejectedValue(new Error('boom'))
    const onOpenChange = vi.fn()
    rerender(<DiscoverNotebookDialog open onOpenChange={onOpenChange} mode="notebook" />)
    fireEvent.change(screen.getByLabelText(/notebooks.discoverPrompt/), { target: { value: 'Quantum computing' } })
    fireEvent.click(screen.getByRole('button', { name: 'notebooks.discoverSubmit' }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled())
    expect(push).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })
})
