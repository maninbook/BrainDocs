import { useQuery } from '@tanstack/react-query'
import { ExternalLink, Star, Network, X } from 'lucide-react'
import { papersApi } from '@/api/papers'
import { useGraphStore } from '@/stores/graphStore'
import { useUIStore } from '@/stores/uiStore'

interface Props { workspaceId: string }

export default function DetailPanel({ workspaceId }: Props) {
  const { selectedNodeId } = useGraphStore()
  const { toggleDetailPanel } = useUIStore()

  const { data: paper, isLoading } = useQuery({
    queryKey: ['paper', workspaceId, selectedNodeId],
    queryFn: () => papersApi.get(workspaceId, selectedNodeId!),
    select: (res) => res.data.data,
    enabled: !!selectedNodeId,
  })

  // 논문 데이터 로딩 중 — 스켈레톤 표시
  if (isLoading) return (
    <div className="h-full glass-panel flex flex-col overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-white/5">
        <h3 className="text-sm font-semibold">논문 상세</h3>
      </div>
      <div className="flex-1 p-4 space-y-4 animate-pulse">
        <div className="space-y-2">
          <div className="h-4 bg-white/10 rounded w-full" />
          <div className="h-4 bg-white/10 rounded w-3/4" />
          <div className="h-3 bg-white/5 rounded w-1/2 mt-1" />
        </div>
        <div className="space-y-2 pt-2">
          <div className="h-2.5 bg-white/5 rounded w-10" />
          <div className="h-3 bg-white/5 rounded w-full" />
          <div className="h-3 bg-white/5 rounded w-full" />
          <div className="h-3 bg-white/5 rounded w-5/6" />
          <div className="h-3 bg-white/5 rounded w-2/3" />
        </div>
        <div className="flex gap-1 pt-2">
          <div className="h-5 bg-white/5 rounded-full w-14" />
          <div className="h-5 bg-white/5 rounded-full w-20" />
          <div className="h-5 bg-white/5 rounded-full w-16" />
        </div>
      </div>
    </div>
  )

  if (!paper) return (
    <div className="h-full glass-panel flex items-center justify-center text-white/30 text-sm">
      논문을 선택하세요
    </div>
  )

  return (
    <div className="h-full glass-panel flex flex-col overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-white/5">
        <h3 className="text-sm font-semibold">논문 상세</h3>
        <button onClick={toggleDetailPanel} className="text-white/30 hover:text-white/70">
          <X size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <div className="flex items-start gap-2">
            <h4 className="text-sm font-medium text-white/90 leading-snug flex-1">{paper.title}</h4>
            {paper.isKeyPaper && <Star size={14} className="text-synapse-gold flex-shrink-0 mt-0.5" />}
          </div>
          <p className="text-xs text-white/40 mt-1">
            {paper.authors.join(', ')} · {paper.year}
          </p>
          {paper.journal && <p className="text-xs text-synapse-blue/70 mt-0.5">{paper.journal}</p>}
        </div>

        <div>
          <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5">초록</p>
          <p className="text-xs text-white/60 leading-relaxed">{paper.abstract}</p>
        </div>

        <div>
          <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5">키워드</p>
          <div className="flex flex-wrap gap-1">
            {paper.keywords.map((kw) => (
              <span key={kw} className="text-[10px] px-2 py-0.5 bg-navy-700 rounded-full text-white/50">
                {kw}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2 border-t border-white/5">
          <span className="flex items-center gap-1 text-xs text-white/40">
            <Network size={12} />
            {paper.connectionCount}개 연결
          </span>
          {paper.doi && (
            <a
              href={`https://doi.org/${paper.doi}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs text-synapse-blue hover:text-synapse-blue/70"
            >
              <ExternalLink size={12} />
              DOI
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
