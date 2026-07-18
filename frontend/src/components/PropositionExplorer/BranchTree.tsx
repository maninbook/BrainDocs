import { useState } from 'react'
import { ChevronRight, ChevronDown, Quote, BookOpen } from 'lucide-react'
import { clsx } from 'clsx'
import type { ExploreBranch } from '@/types'

const BRANCH_STYLES = {
  supporting: { color: 'text-synapse-green', bg: 'bg-synapse-green/10', border: 'border-synapse-green/20', label: '지지' },
  contradicting: { color: 'text-synapse-coral', bg: 'bg-synapse-coral/10', border: 'border-synapse-coral/20', label: '반론' },
  extending: { color: 'text-synapse-blue', bg: 'bg-synapse-blue/10', border: 'border-synapse-blue/20', label: '확장' },
  methodological: { color: 'text-synapse-purple', bg: 'bg-synapse-purple/10', border: 'border-synapse-purple/20', label: '방법론' },
}

interface Props {
  branch: ExploreBranch
  depth?: number
  workspaceId: string
}

export default function BranchTree({ branch, depth = 0, workspaceId }: Props) {
  const [expanded, setExpanded] = useState(depth < 2)
  const [showEvidence, setShowEvidence] = useState(false)
  const style = BRANCH_STYLES[branch.type] || BRANCH_STYLES.extending

  return (
    <div className={clsx('relative', depth > 0 && 'ml-4 pl-3 border-l border-white/5')}>
      {/* 노드 */}
      <div className={clsx('rounded-lg p-2.5 mb-2 border', style.bg, style.border)}>
        <div className="flex items-start gap-2">
          {/* 확장 버튼 */}
          {branch.children.length > 0 && (
            <button onClick={() => setExpanded(!expanded)} className={clsx('mt-0.5 flex-shrink-0', style.color)}>
              {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={clsx('text-[10px] font-medium px-1.5 py-0.5 rounded', style.bg, style.color)}>
                {style.label}
              </span>
              <span className="text-xs font-medium text-white/80 truncate">{branch.concept}</span>
            </div>

            <p className="text-[11px] text-white/50 leading-relaxed">{branch.summary}</p>

            {/* 근거 버튼 */}
            {branch.evidence.length > 0 && (
              <button
                onClick={() => setShowEvidence(!showEvidence)}
                className={clsx(
                  'flex items-center gap-1 mt-2 text-[10px] transition-colors',
                  showEvidence ? style.color : 'text-white/25 hover:text-white/50'
                )}
              >
                <BookOpen size={10} />
                {branch.evidence.length}개 근거 논문
              </button>
            )}

            {/* 근거 목록 */}
            {showEvidence && (
              <div className="mt-2 space-y-2">
                {branch.evidence.map((ev, i) => (
                  <div key={i} className="p-2 bg-navy-800 rounded-lg border border-white/5">
                    <p className="text-[11px] font-medium text-white/70 truncate">{ev.title}</p>
                    <p className="text-[10px] text-white/30 mb-1">
                      {ev.authors[0]} · {ev.year} · p.{ev.page}
                    </p>
                    <div className="flex gap-1.5">
                      <Quote size={9} className="text-white/20 flex-shrink-0 mt-0.5" />
                      <p className="text-[10px] text-white/50 italic leading-relaxed">
                        "{ev.quote}"
                      </p>
                    </div>
                    <div className="mt-1 flex items-center gap-1">
                      <div className="flex-1 bg-white/5 rounded-full h-0.5">
                        <div
                          className={clsx('h-full rounded-full', style.bg.replace('/10', '/60'))}
                          style={{ width: `${ev.relevance * 100}%` }}
                        />
                      </div>
                      <span className="text-[9px] text-white/20">관련도 {(ev.relevance * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 자식 브랜치 */}
      {expanded && branch.children.map((child) => (
        <BranchTree key={child.id} branch={child} depth={depth + 1} workspaceId={workspaceId} />
      ))}
    </div>
  )
}
