export type FolderKind = 'notebook' | 'podcast'
export interface Folder { id: string; name: string; kind: FolderKind }
export type FolderAction = { action: 'create'; name: string; kind: FolderKind } | { action: 'rename'; id: string; name: string } | { action: 'delete'; id: string } | { action: 'assign'; kind: FolderKind; id: string; folder_id: string | null }
