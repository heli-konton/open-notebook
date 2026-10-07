import { render, screen } from '@testing-library/react'
import { it, expect, vi } from 'vitest'
import { NotebookList } from './NotebookList'
import type { NotebookResponse } from '@/lib/types/api'
vi.mock('./NotebookCard',()=>({NotebookCard:({notebook}:{notebook:NotebookResponse})=><p>{notebook.name}</p>}))
vi.mock('./NotebookRow',()=>({NotebookRow:({notebook}:{notebook:NotebookResponse})=><p>{notebook.name}</p>}))
vi.mock('@/lib/stores/notebook-view-store',()=>({useNotebookViewStore:()=> 'tile'}))
it('lets the folder accordion own its heading without duplicating active-notebook headers', () => {
  render(<NotebookList notebooks={[{id:'a',name:'Research note'} as NotebookResponse]} isLoading={false} title="Active notebooks" hideHeading />)
  expect(screen.queryByRole('heading',{name:'Active notebooks'})).toBeNull()
  expect(screen.getByText('Research note')).toBeInTheDocument()
})
