import { apiClient } from './client'
import type { Paper } from '@/types'

export const papersApi = {
  list: (workspaceId: string, params?: {
    search?: string; page?: number; per_page?: number; is_key_paper?: boolean
  }) =>
    apiClient.get<{ success: boolean; data: Paper[]; meta: { total: number } }>(
      `/workspaces/${workspaceId}/papers`, { params }
    ),

  get: (workspaceId: string, paperId: string) =>
    apiClient.get<{ success: boolean; data: Paper }>(
      `/workspaces/${workspaceId}/papers/${paperId}`
    ),

  upload: (workspaceId: string, formData: FormData) =>
    apiClient.post<{ success: boolean; data: { paperId: string; taskId: string } }>(
      `/workspaces/${workspaceId}/papers`, formData
    ),

  patch: (workspaceId: string, paperId: string, data: Partial<Paper>) =>
    apiClient.patch(`/workspaces/${workspaceId}/papers/${paperId}`, data),

  delete: (workspaceId: string, paperId: string) =>
    apiClient.delete(`/workspaces/${workspaceId}/papers/${paperId}`),

  getStatus: (workspaceId: string, paperId: string) =>
    apiClient.get(`/workspaces/${workspaceId}/papers/${paperId}/status`),
}
