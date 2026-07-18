import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Brain, Compass, MessageCircle } from 'lucide-react'
import GraphView from '@/components/GraphView/GraphView'
import GraphToolbar from '@/components/GraphView/GraphToolbar'
import Sidebar from '@/components/Sidebar/Sidebar'
import DetailPanel from '@/components/DetailPanel/DetailPanel'
import PropositionInput from '@/components/PropositionExplorer/PropositionInput'
import BranchTree from '@/components/PropositionExplorer/BranchTree'
import MindMap from '@/components/PropositionExplorer/MindMap'
import ChatPanel from '@/components/Chat/ChatPanel'
import { graphApi } from '@/api/graph'
import { useGraphStore } from '@/stores/graphStore'
import { useUIStore } from '@/stores/uiStore'
import { useWebSocket } from '@/hooks/useWebSocket'
import type { ExploreResult } from '@/types'

export default function WorkspacePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const [exploreResult, setExploreResult] = useState<ExploreResult | null>(null)
  const [showExplorePanel, setShowExplorePanel] = useState(false)
  const [showChat, setShowChat] = useState(false)

  const { setGraphData, setLoading, selectedNodeId, viewMode, setViewMode } = useGraphStore()
  const { detailPanelOpen, openDetailPanel, closeDetailPanel } = useUIStore()

  useWebSocket(workspaceId || null)  // socketRef unused here; Sidebar/DetailPanel use it via hooks

  // 그래프 데이터 로드
  const { data: graphData, isLoading } = useQuery({
    queryKey: ['graph', workspaceId],
    queryFn: () => graphApi.getGraph(workspaceId!),
    select: (res) => res.data.data,
    enabled: !!workspaceId,
  })

  useEffect(() => {
    if (graphData) {
      setGraphData(graphData)
      setLoading(false)
    }
    if (isLoading) setLoading(true)
  }, [graphData, isLoading])

  // 노드 선택 시 상세 패널 자동 열기/닫기
  useEffect(() => {
    if (selectedNodeId) {
      openDetailPanel()
    } else {
      closeDetailPanel()
    }
  }, [selectedNodeId])

  if (!workspaceId) return null

  return (
    <div className="flex h-screen overflow-hidden bg-navy-900">
      {/* 사이드바 */}
      <div className="relative flex-shrink-0">
        <Sidebar workspaceId={workspaceId} />
      </div>

      {/* 메인 영역 */}
      <div className="flex-1 relative overflow-hidden">
        {/* 그래프 뷰 */}
        <GraphView workspaceId={workspaceId} />

        {/* 명제 탐색 마인드맵 (Explore 모드) */}
        {viewMode === 'proposition_map' && exploreResult && (
          <MindMap result={exploreResult} onClose={() => setViewMode('galaxy')} />
        )}
        {viewMode === 'proposition_map' && !exploreResult && (
          <div className="absolute inset-0 z-[5] flex items-center justify-center" style={{ background: '#0A0E1A' }}>
            <p className="text-sm text-white/40">
              아래 <span className="text-synapse-purple">명제 탐색</span>을 실행하면 마인드맵이 여기에 그려집니다
            </p>
          </div>
        )}

        {/* 그래프 툴바 */}
        <GraphToolbar />

        {/* 로고 */}
        <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
          <Brain size={20} className="text-synapse-blue" />
          <span className="text-sm font-semibold text-white/60">BrainDocs</span>
        </div>

        {/* 명제 탐색 버튼 */}
        <button
          onClick={() => setShowExplorePanel(!showExplorePanel)}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10
                     flex items-center gap-2 px-4 py-2 glass-panel
                     text-synapse-purple border-synapse-purple/20 hover:bg-synapse-purple/10
                     transition-all text-sm font-medium"
        >
          <Compass size={15} />
          명제 탐색
        </button>

        {/* AI 채팅 버튼 */}
        {!showChat && (
          <button
            onClick={() => setShowChat(true)}
            title="논문에게 질문하기"
            className="absolute bottom-6 right-4 z-10 flex items-center gap-2 px-4 py-2 glass-panel
                       text-synapse-blue border-synapse-blue/20 hover:bg-synapse-blue/10
                       transition-all text-sm font-medium"
          >
            <MessageCircle size={15} />
            AI 채팅
          </button>
        )}

        {/* AI 채팅 패널 */}
        {showChat && <ChatPanel workspaceId={workspaceId} onClose={() => setShowChat(false)} />}

        {/* 명제 탐색 패널 */}
        {showExplorePanel && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20
                          w-[420px] max-h-[70vh] overflow-y-auto glass-panel">
            <PropositionInput
              workspaceId={workspaceId}
              onResult={(result) => {
                setExploreResult(result)
                // 탐색 완료 → 마인드맵 뷰로 전환, 입력 패널 닫기
                setViewMode('proposition_map')
                setShowExplorePanel(false)
              }}
            />
            {exploreResult && (
              <div className="border-t border-white/5 p-4">
                <div className="mb-3">
                  <p className="text-xs font-medium text-white/60 mb-1">탐색 요약</p>
                  <p className="text-sm text-white/80 leading-relaxed">{exploreResult.summary}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] text-white/30">신뢰도</span>
                    <div className="flex-1 bg-white/5 rounded-full h-1">
                      <div
                        className="h-full bg-synapse-purple rounded-full"
                        style={{ width: `${exploreResult.confidence * 100}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-synapse-purple">
                      {(exploreResult.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
                <BranchTree
                  branch={exploreResult.tree}
                  workspaceId={workspaceId}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* 상세 패널 */}
      {detailPanelOpen && (
        <div className="w-80 flex-shrink-0">
          <DetailPanel workspaceId={workspaceId} />
        </div>
      )}
    </div>
  )
}
