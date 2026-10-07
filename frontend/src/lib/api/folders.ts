import apiClient from './client'
import type { Folder, FolderKind, FolderAction } from '@/lib/types/folders'
export const foldersApi = {
  list: async (kind: FolderKind) => (await apiClient.get<Folder[]>('/folders', { params: { kind } })).data,
  mutate: async (input: FolderAction) => {
    switch (input.action) {
      case 'create': return (await apiClient.post<Folder>('/folders', { name: input.name, kind: input.kind })).data
      case 'rename': return (await apiClient.put<Folder>(`/folders/${encodeURIComponent(input.id)}`, { name: input.name })).data
      case 'delete': await apiClient.delete(`/folders/${encodeURIComponent(input.id)}`); return
      case 'assign': await apiClient.put(`/folders/assignment/${input.kind}/${encodeURIComponent(input.id)}`, { folder_id: input.folder_id }); return
    }
  },
}
