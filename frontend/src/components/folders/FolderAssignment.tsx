 'use client'
import type { FolderKind } from '@/lib/types/folders'
import { useFolders, useFolderMutation } from '@/lib/hooks/use-folders'
import { useTranslation } from '@/lib/hooks/use-translation'
export function FolderAssignment({ kind, id, folder_id }: { kind: FolderKind; id: string; folder_id?: string | null }) {
  const { t } = useTranslation()
  const folders = useFolders(kind)
  const mutation = useFolderMutation()
  return <select className="folder-assignment rounded-md border bg-background px-3 py-2 text-sm max-w-full" aria-label={t('folders.move')} value={folder_id ?? ''} disabled={mutation.isPending || folders.isLoading || folders.isError} onClick={e => e.stopPropagation()} onChange={e => { void mutation.mutateAsync({ action: 'assign', kind, id, folder_id: e.target.value || null }).catch(() => {}) }}>
    <option value="">{t('folders.unfiled')}</option>
    {folders.data?.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
  </select>
}
