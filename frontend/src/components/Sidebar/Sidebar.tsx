import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Upload, Star, ChevronLeft, Loader2 } from 'lucide-react'
import { papersApi } from '@/api/papers'
import { useGraphStore } from '@/stores/graphStore'
import { useUIStore } from '@/stores/uiStore'
import PaperListItem from './PaperListItem'
import UploadZone from '@/components/UploadZone/UploadZone'
import IngestionProgress from './IngestionProgress'
import { clsx } from 'clsx'

interface Props {
  workspaceId: string
}

export default function Sidebar({ workspaceId }: Props) {
  const [search, setSearch] = useState('')
  const [showKeyOnly, setShowKeyOnly] = useState(false)
  const [showUpload, setShowUpload] = useState(false)

  const { sidebarOpen, toggleSidebar, ingestionQueue } = useUIStore()
  const { setSelectedNode } = useGraphStore()

  const { data, isLoading } = useQuery({
    queryKey: ['papers', workspaceId, search, showKeyOnly],
    queryFn: () =>
      papersApi.list(workspaceId, {
        search: search || undefined,
        is_key_paper: showKeyOnly || undefined,
        per_page: 50,
      }),
    select: (res) => res.data.data,
  })

  const papers = data || []
  const ingestionItems = Object.values(ingestionQueue)

  return (
    <>
      {/* 사이드바 패널 */}
      <aside
        className={clsx(
          'relative flex flex-col h-full glass-panel transition-all duration-300 overflow-hidden',
          sidebarOpen ? 'w-72' : 'w-0 opacity-0'
        )}
      >
        <div className="flex flex-col h-full p-3 min-w-[18rem]">
          {/* 헤더 */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white/80">논문 목록</h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowKeyOnly(!showKeyOnly)}
                title="키 논문만 보기"
                className={clsx(
                  'p-1.5 rounded-md transition-colors',
                  showKeyOnly ? 'text-synapse-gold bg-synapse-gold/10' : 'text-white/30 hover:text-white/60'
                )}
              >
                <Star size={14} />
              </button>
              <button
                onClick={() => setShowUpload(true)}
                className="btn-primary py-1 px-2 text-xs"
              >
                <Upload size={12} className="mr-1 inline" />
                업로드
              </button>
            </div>
          </div>

          {/* 검색 */}
          <div className="relative mb-3">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              placeholder="논문 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field pl-8"
            />
          </div>

          {/* 처리 중인 논문 진행 상황 */}
          {ingestionItems.length > 0 && (
            <div className="mb-3 space-y-2">
              {ingestionItems.map((item) => (
                <IngestionProgress key={item.paperId} progress={item} />
              ))}
            </div>
          )}

          {/* 논문 목록 */}
          <div className="flex-1 overflow-y-auto space-y-1">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 size={20} className="animate-spin text-synapse-blue" />
              </div>
            ) : papers.length === 0 ? (
              <div className="text-center py-12 text-white/30 text-sm">
                <p>논문이 없습니다</p>
                <p className="text-xs mt-1">PDF를 업로드해보세요</p>
              </div>
            ) : (
              papers.map((paper) => (
                <PaperListItem
                  key={paper.id}
                  paper={paper}
                  onClick={() => setSelectedNode(paper.id)}
                />
              ))
            )}
          </div>

          {/* 통계 */}
          <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between text-xs text-white/30">
            <span>{papers.length}개 논문</span>
            <span>{papers.filter((p) => p.isKeyPaper).length}개 키 논문</span>
          </div>
        </div>
      </aside>

      {/* 사이드바 토글 버튼 */}
      <button
        onClick={toggleSidebar}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-20 p-1 glass-panel 
                   text-white/40 hover:text-white/80 transition-all hover:bg-white/5"
        style={{ left: sidebarOpen ? '18rem' : '0' }}
      >
        <ChevronLeft size={14} className={clsx('transition-transform', !sidebarOpen && 'rotate-180')} />
      </button>

      {/* 업로드 모달 */}
      {showUpload && (
        <UploadZone
          workspaceId={workspaceId}
          onClose={() => setShowUpload(false)}
        />
      )}
    </>
  )
}
