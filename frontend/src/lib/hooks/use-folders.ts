import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { foldersApi } from '@/lib/api/folders'
import { QUERY_KEYS } from '@/lib/api/query-client'
import type { FolderKind } from '@/lib/types/folders'
import { useToast } from './use-toast'
import { useTranslation } from './use-translation'
export function useFolders(kind: FolderKind) {
  return useQuery({ queryKey: [...QUERY_KEYS.folders, kind], queryFn: () => foldersApi.list(kind) })
}
export function useFolderMutation() {
  const client = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()
  return useMutation({ mutationFn: foldersApi.mutate, onSuccess: async () => {
    await Promise.all(['folders', 'notebooks', 'notebook', 'podcasts'].map(key => client.invalidateQueries({ queryKey: [key] })))
    toast({ title: t('common.success'), description: t('folders.saved') })
  }, onError: () => toast({ title: t('common.error'), description: t('folders.error'), variant: 'destructive' }) })
}
