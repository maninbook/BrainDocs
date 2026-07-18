import { useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { useQueryClient } from '@tanstack/react-query'
import { useGraphStore } from '@/stores/graphStore'
import { useUIStore } from '@/stores/uiStore'

// 같은 origin (Vite 프록시가 /socket.io를 백엔드로 포워딩)
const WS_URL = import.meta.env.VITE_WS_URL || (typeof window !== 'undefined' ? window.location.origin : '')

export function useWebSocket(workspaceId: string | null) {
  const socketRef = useRef<Socket | null>(null)
  const { addNodes, addEdges, updateEdgeStrength } = useGraphStore()
  const { updateIngestionProgress, removeIngestionProgress } = useUIStore()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!workspaceId) return

    const token = localStorage.getItem('access_token')
    const socket = io(WS_URL, {
      query: { workspace_id: workspaceId },
      auth: { token },
      transports: ['websocket'],
    })
    socketRef.current = socket

    socket.on('connect', () => {
      console.log('[WS] Connected to workspace', workspaceId)
    })

    socket.on('ingestion_progress', (data) => {
      updateIngestionProgress(data)
      if (data.progress === 100) {
        // 완료 시 논문 목록 + 그래프 즉시 새로고침
        queryClient.invalidateQueries({ queryKey: ['papers', workspaceId] })
        queryClient.invalidateQueries({ queryKey: ['graph', workspaceId] })
        setTimeout(() => removeIngestionProgress(data.paperId), 3000)
      }
    })

    socket.on('graph_updated', (data) => {
      if (data.newNodes?.length) addNodes(data.newNodes)
      if (data.newEdges?.length) addEdges(data.newEdges)
      if (data.updatedEdges?.length) {
        data.updatedEdges.forEach((e: { id: string; attributes: { strength: number } }) => {
          updateEdgeStrength(e.id, e.attributes.strength)
        })
      }
      // 안전장치 — 새 노드/엣지 정보가 비어 있어도 그래프 갱신 신호로 활용
      if (!data.newNodes?.length && !data.newEdges?.length) {
        queryClient.invalidateQueries({ queryKey: ['graph', workspaceId] })
      }
    })

    socket.on('synapse_updated', (data) => {
      updateEdgeStrength(data.edgeId, data.newStrength)
    })

    return () => {
      socket.disconnect()
    }
  }, [workspaceId])

  const emitPaperViewed = (paperId: string, relatedPaperId: string) => {
    socketRef.current?.emit('paper_viewed', {
      paperId,
      relatedPaperId,
      workspaceId,
    })
  }

  return { socketRef, emitPaperViewed }
}
