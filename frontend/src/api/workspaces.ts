import { apiClient } from './client'
import type { Workspace } from '@/types'

export const workspacesApi = {
  list: () =>
    apiClient.get<{ success: boolean; data: Workspace[] }>('/workspaces'),

  create: (payload: { name: string; description?: string }) =>
    apiClient.post<{ success: boolean; data: { id: string; name: string } }>(
      '/workspaces',
      payload
    ),

  delete: (workspaceId: string) =>
    apiClient.delete(`/workspaces/${workspaceId}`),
}
