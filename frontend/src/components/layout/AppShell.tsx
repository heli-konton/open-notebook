'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { Menu, BookOpen, Headphones, FileText, Search } from 'lucide-react'
import { AppSidebar } from './AppSidebar'
import { SetupBanner } from './SetupBanner'
import { usePodcastPlayer } from '@/components/podcasts/PodcastPlayer'
import { useTranslation } from '@/lib/hooks/use-translation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

export function AppShell({ children, libraryNavigation }: { children: React.ReactNode; libraryNavigation?: React.ReactNode }) {
  const { t } = useTranslation()
  const pathname = usePathname()
  const router = useRouter()
  const player = usePodcastPlayer()
  const [menuOpen, setMenuOpen] = useState(false)
  const [search, setSearch] = useState('')
  const links = [
    { href: '/notebooks', label: 'navigation.notebooks', icon: BookOpen },
    { href: '/podcasts', label: 'navigation.podcasts', icon: Headphones },
    { href: '/sources', label: 'navigation.sources', icon: FileText },
  ]

  return <div className="app-shell" data-player-open={!!player.episode}>
    <header className="global-header">
      <Link className="flex items-center gap-2 font-semibold" href="/notebooks">
        <Image src="/logo.svg" width={32} height={32} alt="" />{t('common.appName')}
      </Link>
      <form className="global-search-form" role="search" onSubmit={event => {
        event.preventDefault()
        const query = search.trim()
        if (query) router.push(`/search?mode=search&q=${encodeURIComponent(query)}`)
      }}>
        <Search aria-hidden className="h-4 w-4" />
        <input type="search" aria-label={t('common.search')} placeholder={t('common.search')} value={search} onChange={event => setSearch(event.target.value)} />
      </form>
      <Link href="/search" className="mobile-search" aria-label={t('common.search')}><Search aria-hidden className="h-4 w-4" /></Link>
      <Button className="mobile-menu-trigger" variant="ghost" aria-label={t('common.actions')} onClick={() => setMenuOpen(true)}><Menu aria-hidden /></Button>
    </header>
    <div className="app-workspace">
      <div className="desktop-sidebar">
        <AppSidebar>{libraryNavigation && <div data-testid="library-navigation" className="library-navigation">{libraryNavigation}</div>}</AppSidebar>
      </div>
      <main className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
        <SetupBanner />
        {libraryNavigation && <details className="mobile-library"><summary>{t('folders.title')}</summary>{libraryNavigation}</details>}
        {children}
      </main>
    </div>
    <nav className="mobile-navigation" aria-label={t('common.quickActions')}>
      {links.map(link => <Link key={link.href} href={link.href} aria-current={pathname?.startsWith(link.href) ? 'page' : undefined}>
        <link.icon aria-hidden className="h-5 w-5" /><span>{t(link.label)}</span>
      </Link>)}
    </nav>
    <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
      <DialogContent className="mobile-menu">
        <DialogHeader><DialogTitle>{t('common.appName')}</DialogTitle><DialogDescription>{t('common.quickActionsDesc')}</DialogDescription></DialogHeader>
        <div onClick={event => { if ((event.target as Element).closest('a')) setMenuOpen(false) }}><AppSidebar /></div>
      </DialogContent>
    </Dialog>
  </div>
}
