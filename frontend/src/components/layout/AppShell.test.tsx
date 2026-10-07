import { render, screen, fireEvent } from '@testing-library/react'
import { it, expect, vi } from 'vitest'
import { AppShell } from './AppShell'
const navigate = vi.hoisted(() => vi.fn())
vi.mock('next/navigation',()=>({usePathname:()=>'/podcasts',useRouter:()=>({push:navigate})}))
vi.mock('./AppSidebar',()=>({AppSidebar:({children}:{children?:React.ReactNode})=> <div>Full navigation{children}</div>}))
vi.mock('./SetupBanner',()=>({SetupBanner:()=>null}))
it('exposes primary mobile navigation and keyboard-accessible full menu', () => {
  render(<AppShell><p>Workspace</p></AppShell>)
  expect(screen.getByRole('link',{name:'navigation.podcasts'})).toHaveAttribute('href','/podcasts')
  fireEvent.click(screen.getByRole('button',{name:'common.actions'}))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.getByText('Workspace')).toBeInTheDocument()
})
it('provides a global identity and working search entry without another permanent folder column', () => {
  render(<AppShell libraryNavigation={<p>Collection navigation</p>}><p>Workspace</p></AppShell>)
  expect(screen.getByRole('banner')).toBeInTheDocument()
  expect(screen.getByRole('link',{name:'common.search'})).toHaveAttribute('href','/search')
  expect(screen.getByTestId('library-navigation')).toHaveTextContent('Collection navigation')
})
it('submits global search to the real search workflow with an encoded query', () => {
  render(<AppShell><p>Workspace</p></AppShell>)
  fireEvent.change(screen.getByRole('searchbox',{name:'common.search'}),{target:{value:' local-first & notes '}})
  fireEvent.submit(screen.getByRole('search'))
  expect(navigate).toHaveBeenCalledWith('/search?mode=search&q=local-first%20%26%20notes')
})
