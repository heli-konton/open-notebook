import { render, screen, fireEvent } from '@testing-library/react'
import { it, expect, vi } from 'vitest'
import { AppShell } from './AppShell'
vi.mock('./AppSidebar',()=>({AppSidebar:()=> <div>Full navigation</div>}))
vi.mock('./SetupBanner',()=>({SetupBanner:()=>null}))
it('exposes primary mobile navigation and keyboard-accessible full menu', () => {
  render(<AppShell><p>Workspace</p></AppShell>)
  expect(screen.getByRole('link',{name:'navigation.podcasts'})).toHaveAttribute('href','/podcasts')
  fireEvent.click(screen.getByRole('button',{name:'common.actions'}))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.getByText('Workspace')).toBeInTheDocument()
})
