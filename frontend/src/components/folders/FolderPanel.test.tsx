import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { FolderPanel, filterFolderItems } from './FolderPanel'

vi.mock('@/lib/hooks/use-folders', () => ({
  useFolders: () => ({ data: [{ id: 'folder:1', name: 'Research', kind: 'notebook' }], isLoading: false }),
  useFolderMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

describe('collection navigation', () => {
  it('shows real counts and selects Unfiled and named folders', () => {
    const select = vi.fn()
    render(<FolderPanel kind="notebook" items={[{ folder_id: 'folder:1' }, {}]} value="all" onChange={select} />)
    fireEvent.click(screen.getByRole('button', { name: 'folders.unfiled 1' }))
    expect(select).toHaveBeenCalledWith('unfiled')
    fireEvent.click(screen.getByRole('button', { name: 'Research 1' }))
    expect(select).toHaveBeenCalledWith('folder:1')
    expect(screen.getByRole('button', { name: 'folders.all 2' })).toHaveAttribute('aria-pressed', 'true')
  })
  it('filters without changing archive membership or input', () => {
    const items = [{ folder_id: 'folder:1', archived: true }, { folder_id: null }, {}]
    expect(filterFolderItems(items, 'all')).toEqual(items)
    expect(filterFolderItems(items, 'unfiled')).toEqual(items.slice(1))
    expect(filterFolderItems(items, 'folder:1')).toEqual([items[0]])
    expect(items).toHaveLength(3)
  })
})
