import { apiClient } from './client'

export type ConflictType =
  | 'measurement' | 'population' | 'design' | 'analysis' | 'scale' | 'genuine'

export interface ClaimMethod {
  population: string | null
  sampleSize: string | null
  measure: string | null
  design: string | null
  direction: 'positive' | 'negative' | null
}

export interface TensionClaim {
  paperId: string
  paperTitle?: string
  year?: number | null
  authors?: string[]
  statement: string
  quote: string
  method: ClaimMethod
}

export interface Tension {
  id: string
  issue: string
  claimA: TensionClaim
  claimB: TensionClaim
  conflictType: ConflictType
  reconciliation: string
  confidence: number
  resolvable: boolean
}

export interface TensionResult {
  topic: string
  summary: string
  tensions: Tension[]
  consensus: string[]
  gaps: string[]
  analysisId: string
}

export const tensionsApi = {
  find: (workspaceId: string, body: { topic?: string; maxTensions?: number }) =>
    apiClient.post<{ success: boolean; data: TensionResult }>(
      `/workspaces/${workspaceId}/tensions`,
      body,
      // 주장 추출 + 충돌 분류로 LLM 호출이 무거움
      { timeout: 180_000 }
    ),
}
