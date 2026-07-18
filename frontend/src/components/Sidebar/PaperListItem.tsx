import { Star, Link } from 'lucide-react'
import { clsx } from 'clsx'
import type { Paper } from '@/types'
import { useGraphStore } from '@/stores/graphStore'

interface Props {
  paper: Paper
  onClick: () => void
}

const STATUS_DOT: Record<string, string> = {
  completed: 'bg-synapse-green',
  pending: 'bg-yellow-400',
  failed: 'bg-synapse-coral',
}

export default function PaperListItem({ paper, onClick }: Props) {
  const { selectedNodeId } = useGraphStore()
  const isSelected = selectedNodeId === paper.id

  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full text-left p-2.5 rounded-lg transition-all duration-150',
        isSelected
          ? 'bg-synapse-blue/10 border border-synapse-blue/20'
          : 'hover:bg-white/5 border border-transparent'
      )}
    >
      <div className="flex items-start gap-2">
        {/* 상태 점 */}
        <span
          className={clsx('mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0',
            STATUS_DOT[paper.status] || 'bg-white/20')}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <p className="text-xs font-medium text-white/80 truncate leading-tight">
              {paper.title}
            </p>
            {paper.isKeyPaper && <Star size={10} className="text-synapse-gold flex-shrink-0" />}
          </div>
          <p className="text-[11px] text-white/35 mt-0.5 truncate">
            {paper.authors.slice(0, 2).join(', ')}
            {paper.authors.length > 2 ? ' 외' : ''} · {paper.year}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="flex items-center gap-0.5 text-[10px] text-white/25">
              <Link size={9} />
              {paper.connectionCount}
            </span>
            <div className="flex-1 bg-white/5 rounded-full h-0.5 overflow-hidden">
              <div
                className="h-full bg-synapse-blue/60 rounded-full"
                style={{ width: `${paper.avgStrength * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </button>
  )
}
