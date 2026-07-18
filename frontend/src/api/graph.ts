import { apiClient } from './client'
import type { GraphData } from '@/types'

export const graphApi = {
  getGraph: (workspaceId: string, params?: { minStrength?: number; relationType?: string[] }) =>
    apiClient.get<{ success: boolean; data: GraphData }>(
      `/workspaces/${workspaceId}/graph`, { params }
    ),

  getLocalGraph: (workspaceId: string, paperId: string, params?: { depth?: number }) =>
    apiClient.get<{ success: boolean; data: GraphData }>(
      `/workspaces/${workspaceId}/graph/local/${paperId}`, { params }
    ),

  getClusters: (workspaceId: string) =>
    apiClient.get(`/workspaces/${workspaceId}/graph/clusters`),

  createEdge: (workspaceId: string, data: {
    sourcePaperId: string; targetPaperId: string; relationType: string; note?: string
  }) =>
    apiClient.post(`/workspaces/${workspaceId}/graph/edges`, data),
}
