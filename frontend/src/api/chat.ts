import { apiClient } from './client'

export interface ChatSource {
  paperId: string
  title: string
  authors: string[]
  year: number | null
  snippet: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  sources?: ChatSource[]
}

export const chatApi = {
  send: (workspaceId: string, messages: Array<{ role: 'user' | 'assistant'; content: string }>) =>
    apiClient.post<{ success: boolean; data: { answer: string; sources: ChatSource[] } }>(
      `/workspaces/${workspaceId}/chat`,
      { messages },
      // RAG 검색 + LLM 호출 — 기본 30초로는 부족
      { timeout: 120_000 }
    ),
}
