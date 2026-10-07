import { render, screen, fireEvent, within } from '@testing-library/react'
import { it, expect, vi } from 'vitest'
import NotebooksPage from './page'
vi.mock('@/components/layout/AppShell', () => ({AppShell:({children,libraryNavigation}:{children:React.ReactNode;libraryNavigation:React.ReactNode})=><>{libraryNavigation}{children}</>}))
vi.mock('@/lib/hooks/use-notebooks', () => ({useNotebooks:(archived:boolean)=>({data:archived?[{id:'c',name:'Archived record',folder_id:'folder:1'}]:[{id:'a',name:'Filed record',folder_id:'folder:1'},{id:'b',name:'Unfiled record'}],isLoading:false,refetch:vi.fn()})}))
vi.mock('@/lib/hooks/use-folders', () => ({useFolders:()=>({data:[{id:'folder:1',name:'Research',kind:'notebook'}]}),useFolderMutation:()=>({mutateAsync:vi.fn()})}))
vi.mock('./components/NotebookList',()=>({NotebookList:({notebooks,title}:{notebooks:{id:string;name:string}[];title:string})=><section aria-label={title}>{notebooks?.map(item=><p key={item.id}>{item.name}</p>)}</section>}))
vi.mock('./components/RecentlyViewed',()=>({RecentlyViewed:()=>null}))
vi.mock('@/components/notebooks/CreateNotebookDialog',()=>({CreateNotebookDialog:()=>null}))
it('groups notebooks by folder without mixing archived records into active collections', () => {
  render(<NotebooksPage />)
  const collections = screen.getAllByRole('button',{name:'Research 1'})
  const accordion = collections.find(button=>button.hasAttribute('aria-expanded'))!
  expect(accordion).toHaveAttribute('aria-expanded','true')
  fireEvent.click(accordion)
  expect(screen.queryByText('Filed record')).toBeNull()
  expect(screen.getByText('Unfiled record')).toBeInTheDocument()
  const archive = screen.getByRole('button',{name:/notebooks.archivedNotebooks/})
  expect(archive).toHaveAttribute('aria-expanded','false')
  fireEvent.click(archive)
  expect(screen.getByText('Archived record')).toBeInTheDocument()
  fireEvent.click(within(screen.getByRole('complementary')).getByRole('button',{name:'Research 2'}))
  expect(screen.queryByText('Unfiled record')).toBeNull()
})
