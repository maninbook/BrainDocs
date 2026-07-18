import { apiClient } from './client'
import type { ExploreResult } from '@/types'

export const exploreApi = {
  explore: (workspaceId: string, data: {
    proposition: string
    mode?: 'focused' | 'balanced' | 'exploratory'
    maxBranches?: number
    maxDepth?: number
    includeContradictions?: boolean
  }) =>
    apiClient.post<{ success: boolean; data: ExploreResult }>(
      `/workspaces/${workspaceId}/explore`, data,
      // Graph RAG 탐색은 LLM 호출 포함으로 오래 걸림 — 기본 30초로는 중간에 끊김
      { timeout: 120_000 }
    ),

  getHistory: (workspaceId: string, params?: { page?: number }) =>
    apiClient.get(`/workspaces/${workspaceId}/explore/history`, { params }),

  getResult: (workspaceId: string, exploreId: string) =>
    apiClient.get<{ success: boolean; data: ExploreResult }>(
      `/workspaces/${workspaceId}/explore/${exploreId}`
    ),
}
