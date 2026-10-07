import { it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FolderAssignment } from './FolderAssignment'
const mutate = vi.fn(async () => undefined)
vi.mock('@/lib/hooks/use-folders', () => ({ useFolders: () => ({ data: [{id:'folder:1', name:'Research', kind:'notebook'}] }), useFolderMutation: () => ({ mutateAsync: mutate, isPending: false }) }))
it('moves an existing item and unassigns with explicit null', () => {
  render(<FolderAssignment kind="notebook" id="notebook:1" folder_id={null} />)
  fireEvent.change(screen.getByRole('combobox', {name:'folders.move'}), { target: { value: 'folder:1' } })
  expect(mutate).toHaveBeenCalledWith({action:'assign',kind:'notebook',id:'notebook:1',folder_id:'folder:1'})
  fireEvent.change(screen.getByRole('combobox'), {target:{value:''}})
  expect(mutate).toHaveBeenLastCalledWith({action:'assign',kind:'notebook',id:'notebook:1',folder_id:null})
})
