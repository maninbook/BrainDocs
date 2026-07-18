import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Brain, Plus, FolderOpen, Loader2, X, FileText } from 'lucide-react'
import { workspacesApi } from '@/api/workspaces'
import type { Workspace } from '@/types'
import { clsx } from 'clsx'

const THUMBNAIL_COLORS = [
  '#4A7FA5', '#4ECCA3', '#A855F7', '#F5C842', '#FF6B6B', '#5BC8F5',
]

export default function HomePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [selectedColor, setSelectedColor] = useState(THUMBNAIL_COLORS[0])

  const { data: workspaces, isLoading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => workspacesApi.list(),
    select: (res) => res.data.data,
  })

  const createMutation = useMutation({
    mutationFn: () =>
      workspacesApi.create({
        name: newName.trim() || '새 워크스페이스',
        description: newDesc.trim() || undefined,
        thumbnailColor: selectedColor,
      } as any),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      setShowCreate(false)
      setNewName('')
      setNewDesc('')
      navigate(`/workspace/${res.data.data.id}`)
    },
  })

  return (
    <div className="min-h-screen bg-navy-900 flex items-center justify-center p-8">
      <div className="w-full max-w-2xl">
        {/* 헤더 */}
        <div className="flex items-center justify-center gap-3 mb-3">
          <Brain size={40} className="text-synapse-blue" />
          <h1 className="text-3xl font-bold text-white">BrainDocs</h1>
        </div>
        <p className="text-white/50 text-center mb-10 leading-relaxed">
          논문들이 서로 말을 걸게 하는 지식 그래프 플랫폼.<br />
          업로드하고, 탐색하고, 연결하세요.
        </p>

        {/* 워크스페이스 목록 */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={24} className="animate-spin text-synapse-blue" />
          </div>
        ) : workspaces && workspaces.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 mb-4">
            {workspaces.map((ws: Workspace) => (
              <button
                key={ws.id}
                onClick={() => navigate(`/workspace/${ws.id}`)}
                className="flex items-start gap-3 p-4 rounded-xl border border-white/10
                           hover:border-white/25 hover:bg-white/5 transition-all text-left group"
              >
                <div
                  className="w-8 h-8 rounded-lg flex-shrink-0 mt-0.5"
                  style={{ backgroundColor: ws.thumbnailColor + '40', border: `1px solid ${ws.thumbnailColor}60` }}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white/80 group-hover:text-white truncate">{ws.name}</p>
                  {ws.description && (
                    <p className="text-xs text-white/30 mt-0.5 truncate">{ws.description}</p>
                  )}
                  <div className="flex items-center gap-1 mt-1.5">
                    <FileText size={11} className="text-white/20" />
                    <span className="text-[10px] text-white/30">{ws.paperCount ?? 0}편</span>
                  </div>
                </div>
                <FolderOpen size={14} className="text-white/20 group-hover:text-synapse-blue ml-auto flex-shrink-0 mt-1 transition-colors" />
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center py-10 text-white/30 text-sm mb-4">
            <p>워크스페이스가 없습니다.</p>
            <p className="text-xs mt-1">새 워크스페이스를 만들어 시작해보세요.</p>
          </div>
        )}

        {/* 새 워크스페이스 버튼 */}
        <button
          onClick={() => setShowCreate(true)}
          className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl
                     border border-white/10 text-white/50 hover:bg-white/5 hover:border-white/20
                     hover:text-white/70 transition-all text-sm font-medium"
        >
          <Plus size={16} />
          새 워크스페이스 만들기
        </button>
      </div>

      {/* 생성 모달 */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-navy-800 border border-white/10 rounded-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-white">새 워크스페이스</h2>
              <button onClick={() => setShowCreate(false)} className="text-white/30 hover:text-white/70">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-white/40 block mb-1.5">이름</label>
                <input
                  type="text"
                  placeholder="예: AI 연구 논문 모음"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && createMutation.mutate()}
                  autoFocus
                  className="w-full bg-navy-700 border border-white/10 rounded-lg px-3 py-2
                             text-sm text-white placeholder-white/20 focus:outline-none
                             focus:border-synapse-blue/50 transition-colors"
                />
              </div>

              <div>
                <label className="text-xs text-white/40 block mb-1.5">설명 (선택)</label>
                <input
                  type="text"
                  placeholder="간략한 설명"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full bg-navy-700 border border-white/10 rounded-lg px-3 py-2
                             text-sm text-white placeholder-white/20 focus:outline-none
                             focus:border-synapse-blue/50 transition-colors"
                />
              </div>

              <div>
                <label className="text-xs text-white/40 block mb-1.5">색상</label>
                <div className="flex gap-2">
                  {THUMBNAIL_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setSelectedColor(color)}
                      className={clsx(
                        'w-7 h-7 rounded-full transition-all',
                        selectedColor === color ? 'ring-2 ring-white/60 ring-offset-2 ring-offset-navy-800' : ''
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {createMutation.isError && (
              <p className="mt-3 text-xs text-red-400">생성에 실패했습니다. 다시 시도해주세요.</p>
            )}

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 py-2 rounded-lg border border-white/10 text-sm text-white/40 hover:text-white/70 transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                className="flex-1 py-2 rounded-lg bg-synapse-blue/20 border border-synapse-blue/40
                           text-sm text-synapse-blue hover:bg-synapse-blue/30 transition-all
                           disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {createMutation.isPending ? (
                  <><Loader2 size={13} className="animate-spin" /> 생성 중...</>
                ) : '만들기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
