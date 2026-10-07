import { render, screen, fireEvent } from '@testing-library/react'
import { it, expect } from 'vitest'
import { FolderCollections } from './FolderCollections'
const items = [{ id:'a', name:'Filed', folder_id:'folder:1' }, { id:'b', name:'Unfiled' }]
it('groups all items by collection, retains unfiled and collapses a collection independently', () => {
  render(<FolderCollections items={items} folders={[{id:'folder:1',name:'Research',kind:'notebook'}]} renderItems={entries => <>{entries.map(entry => <p key={entry.id}>{entry.name}</p>)}</>} />)
  const collection = screen.getByRole('button', {name:'Research 1'})
  expect(collection).toHaveAttribute('aria-expanded','true')
  fireEvent.click(collection)
  expect(screen.queryByText('Filed')).toBeNull()
  expect(screen.getByText('Unfiled')).toBeInTheDocument()
  fireEvent.click(collection)
  expect(screen.getByText('Filed')).toBeInTheDocument()
})
