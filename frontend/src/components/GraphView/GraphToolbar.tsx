import { useGraphStore } from '@/stores/graphStore'
import { Network, Layers, Clock, GitBranch, Compass } from 'lucide-react'
import { clsx } from 'clsx'

const VIEW_MODES = [
  { id: 'galaxy', label: 'Galaxy', icon: Network, tooltip: '전체 그래프' },
  { id: 'cluster', label: 'Cluster', icon: Layers, tooltip: '주제별 클러스터' },
  { id: 'timeline', label: 'Timeline', icon: Clock, tooltip: '연도별 타임라인' },
  { id: 'citation_tree', label: 'Citation', icon: GitBranch, tooltip: '인용 트리' },
  { id: 'proposition_map', label: 'Explore', icon: Compass, tooltip: '명제 탐색 맵' },
] as const

export default function GraphToolbar() {
  const { viewMode, setViewMode, minStrength, setMinStrength } = useGraphStore()

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2">
      {/* 뷰 모드 버튼들 */}
      <div className="flex items-center gap-1 glass-panel px-2 py-1.5">
        {VIEW_MODES.map((mode) => {
          const Icon = mode.icon
          return (
            <button
              key={mode.id}
              onClick={() => setViewMode(mode.id)}
              title={mode.tooltip}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                viewMode === mode.id
                  ? 'bg-synapse-blue/20 text-synapse-blue border border-synapse-blue/30'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/5'
              )}
            >
              <Icon size={13} />
              <span>{mode.label}</span>
            </button>
          )
        })}
      </div>

      {/* 연결 강도 필터 */}
      <div className="flex items-center gap-2 glass-panel px-3 py-1.5">
        <span className="text-xs text-white/40">강도</span>
        <input
          type="range"
          min={0}
          max={0.9}
          step={0.1}
          value={minStrength}
          onChange={(e) => setMinStrength(Number(e.target.value))}
          className="w-20 accent-synapse-blue"
        />
        <span className="text-xs text-synapse-blue font-mono w-6">
          {minStrength.toFixed(1)}
        </span>
      </div>
    </div>
  )
}
