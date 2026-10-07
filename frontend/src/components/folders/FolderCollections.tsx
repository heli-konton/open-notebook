'use client'
import { useId, useState, type ReactNode } from 'react'
import { ChevronDown, Folder as FolderIcon } from 'lucide-react'
import type { Folder } from '@/lib/types/folders'
import { useTranslation } from '@/lib/hooks/use-translation'

export function FolderCollections<T extends { id: string; folder_id?: string | null }>({ items, folders, renderItems }: { items:T[]; folders:Folder[]; renderItems:(items:T[])=>ReactNode }) {
  const { t } = useTranslation()
  const id = useId()
  const [collapsed, setCollapsed] = useState<string[]>([])
  // Keep records visible even while the folder query is loading or unavailable.
  const known = new Set(folders.map(folder => folder.id))
  const groups = folders.map(folder => ({ ...folder, items: items.filter(item => item.folder_id === folder.id) }))
  groups.push({ id: 'unfiled', name: t('folders.unfiled'), kind: 'notebook', items: items.filter(item => !item.folder_id || !known.has(item.folder_id)) })
  return <div className="folder-collections">{groups.filter(group => group.items.length > 0).map(group => {
    const open = !collapsed.includes(group.id)
    const panelId = `${id}-${group.id}`
    return <section className="folder-collection" key={group.id}>
      <h2><button className="collection-heading" aria-expanded={open} aria-controls={panelId} onClick={() => setCollapsed(old => open ? [...old, group.id] : old.filter(value => value !== group.id))}>
        <ChevronDown aria-hidden className={open ? '' : '-rotate-90'} /><FolderIcon aria-hidden /><span>{group.name}</span><span className="collection-count">{group.items.length}</span>
      </button></h2>
      {open && <div id={panelId} className="collection-content">{renderItems(group.items)}</div>}
    </section>
  })}</div>
}
