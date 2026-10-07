import { it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useFolderMutation, useFolders } from './use-folders'
import { foldersApi } from '@/lib/api/folders'
vi.mock('@/lib/api/folders', () => ({ foldersApi: { mutate: vi.fn(), list: vi.fn() } }))
function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: 1, retryDelay: 0 }, queries: { retry: 1, retryDelay: 0 } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
it('does not duplicate a create when its response is lost despite shared retry defaults', async () => {
  vi.mocked(foldersApi.mutate).mockRejectedValue(new Error('Response lost after create'))
  const { result } = renderHook(() => useFolderMutation(), { wrapper })
  await act(async () => { await result.current.mutateAsync({ action: 'create', kind: 'notebook', name: 'Research' }).catch(() => {}) })
  expect(foldersApi.mutate).toHaveBeenCalledTimes(1)
})
it('does not automatically retry folder queries', async () => {
  vi.mocked(foldersApi.list).mockRejectedValue(new Error('Offline'))
  const { result } = renderHook(() => useFolders('notebook'), { wrapper })
  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(foldersApi.list).toHaveBeenCalledTimes(1)
})
