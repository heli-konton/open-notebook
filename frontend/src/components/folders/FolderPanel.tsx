 'use client'
import { useState } from 'react'
import { Folder as FolderIcon } from 'lucide-react'
import type { FolderKind } from '@/lib/types/folders'
import { useFolders, useFolderMutation } from '@/lib/hooks/use-folders'
import { useTranslation } from '@/lib/hooks/use-translation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

export function filterFolderItems<T extends { folder_id?: string | null }>(items: T[], value: string): T[] {
  return value === 'all' ? items : items.filter(item => value === 'unfiled' ? !item.folder_id : item.folder_id === value)
}

export function FolderPanel({ kind, items, value, onChange }: { kind: FolderKind; items: { folder_id?: string | null }[]; value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation()
  const folders = useFolders(kind)
  const mutation = useFolderMutation()
  const [edit, setEdit] = useState<{id?: string; name: string; mode: 'create' | 'rename' | 'delete'} | null>(null)
  const selected = folders.data?.find(folder => folder.id === value)
  const choices = [{ id: 'all', name: t('folders.all') }, { id: 'unfiled', name: t('folders.unfiled') }, ...(folders.data ?? [])]
  async function save() {
    if (!edit) return
    try {
      await mutation.mutateAsync(edit.mode === 'create' ? { action: 'create', kind, name: edit.name } : edit.mode === 'rename' ? { action: 'rename', id: edit.id!, name: edit.name } : { action: 'delete', id: edit.id! })
      if (edit.mode === 'delete') onChange('all')
      setEdit(null)
    } catch { /* Mutation reports error and dialog stays open. */ }
  }
  return <aside className="folder-panel" aria-label={t('folders.title')}>
    <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-3">{t('folders.title')}</h2>
    {folders.isLoading && <p role="status">{t('common.loading')}</p>}
    {folders.isError && <p role="alert">{t('folders.error')}</p>}
    <div className="folder-choices">{choices.map(folder => <Button key={folder.id} variant={value === folder.id ? 'secondary' : 'ghost'} aria-pressed={value === folder.id} className="justify-between gap-3" onClick={() => onChange(folder.id)}><span className="flex items-center gap-2"><FolderIcon aria-hidden className="h-4 w-4" />{folder.name}</span><span>{filterFolderItems(items, folder.id).length}</span></Button>)}</div>
    <div className="flex flex-wrap gap-2 mt-3">
      <Button variant="outline" onClick={() => setEdit({ mode: 'create', name: '' })}>{t('folders.create')}</Button>
      {selected && <><Button variant="ghost" onClick={() => setEdit({ mode: 'rename', id: selected.id, name: selected.name })}>{t('folders.renameTitle')}</Button><Button variant="ghost" onClick={() => setEdit({ mode: 'delete', id: selected.id, name: selected.name })}>{t('common.delete')}</Button></>}
    </div>
    <Dialog open={!!edit} onOpenChange={open => { if (!open) setEdit(null) }}><DialogContent><DialogHeader><DialogTitle>{t(edit?.mode === 'delete' ? 'folders.deleteTitle' : edit?.mode === 'rename' ? 'folders.renameTitle' : 'folders.create')}</DialogTitle><DialogDescription>{t(edit?.mode === 'delete' ? 'folders.deleteDescription' : 'folders.description')}</DialogDescription></DialogHeader>
      {edit?.mode === 'delete' ? <p>{edit.name}</p> : <Input aria-label={t('folders.name')} maxLength={100} value={edit?.name ?? ''} onChange={e => setEdit(old => old && { ...old, name: e.target.value })} onKeyDown={e => { if (e.key === 'Enter' && edit?.name.trim() && !mutation.isPending) void save() }} />}
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEdit(null)}>{t('common.cancel')}</Button><Button disabled={mutation.isPending || !edit?.name.trim()} onClick={() => void save()}>{t(edit?.mode === 'delete' ? 'common.delete' : 'common.save')}</Button></div>
    </DialogContent></Dialog>
  </aside>
}
