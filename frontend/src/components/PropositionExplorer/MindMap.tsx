import { useMemo, useState, useCallback } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { X, Quote, BookOpen, Compass } from 'lucide-react'
import { clsx } from 'clsx'
import type { ExploreBranch, ExploreResult } from '@/types'

// 분기 유형별 색상 (그래프 엣지 색상과 통일)
const TYPE_COLORS: Record<string, { stroke: string; text: string; bg: string; border: string; label: string }> = {
  supporting: { stroke: '#4ECCA3', text: 'text-synapse-green', bg: 'bg-synapse-green/10', border: 'border-synapse-green/30', label: '지지' },
  contradicting: { stroke: '#FF6B6B', text: 'text-synapse-coral', bg: 'bg-synapse-coral/10', border: 'border-synapse-coral/30', label: '반론' },
  extending: { stroke: '#5BC8F5', text: 'text-synapse-blue', bg: 'bg-synapse-blue/10', border: 'border-synapse-blue/30', label: '확장' },
  methodological: { stroke: '#A855F7', text: 'text-synapse-purple', bg: 'bg-synapse-purple/10', border: 'border-synapse-purple/30', label: '방법론' },
}

const X_GAP = 340 // 레벨 간 가로 간격
const Y_GAP = 110 // 리프 하나가 차지하는 세로 간격
const NODE_WIDTH = 240

type BranchNodeData = {
  branch: ExploreBranch
  isRoot: boolean
  onSelect: (b: ExploreBranch) => void
}

function countLeaves(b: ExploreBranch): number {
  if (!b.children || b.children.length === 0) return 1
  return b.children.reduce((s, c) => s + countLeaves(c), 0)
}

/** 마인드맵 레이아웃 — 루트 중앙, 분기가 좌우로 직선으로 뻗음 */
function layoutMindMap(
  root: ExploreBranch,
  onSelect: (b: ExploreBranch) => void
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []

  const place = (
    b: ExploreBranch,
    path: string,
    depth: number,
    side: 1 | -1,
    top: number, // 리프 단위 세로 시작 위치
    parentPath: string | null
  ) => {
    const leaves = countLeaves(b)
    const y = (top + leaves / 2) * Y_GAP
    const x = side * depth * X_GAP

    nodes.push({
      id: path,
      type: 'branch',
      position: { x: x - NODE_WIDTH / 2, y },
      data: { branch: b, isRoot: depth === 0, onSelect } satisfies BranchNodeData,
    })

    if (parentPath !== null) {
      const color = (TYPE_COLORS[b.type] || TYPE_COLORS.extending).stroke
      edges.push({
        id: `e-${parentPath}-${path}`,
        source: parentPath,
        target: path,
        sourceHandle: side > 0 ? 'sr' : 'sl',
        targetHandle: side > 0 ? 'tl' : 'tr',
        type: 'straight', // 직선 연결
        style: { stroke: color, strokeWidth: 1.5, opacity: 0.7 },
      })
    }

    let cursor = top
    b.children?.forEach((child, i) => {
      place(child, `${path}-${i}`, depth + 1, side, cursor, path)
      cursor += countLeaves(child)
    })
  }

  // 1레벨 자식을 좌/우로 균형 분배 (리프 수 기준)
  const children = root.children || []
  const totalLeaves = children.reduce((s, c) => s + countLeaves(c), 0)
  const right: ExploreBranch[] = []
  const left: ExploreBranch[] = []
  let rightLeaves = 0
  children.forEach((c) => {
    if (rightLeaves < totalLeaves / 2) {
      right.push(c)
      rightLeaves += countLeaves(c)
    } else {
      left.push(c)
    }
  })
  const leftLeaves = totalLeaves - rightLeaves

  // 루트 (중앙)
  nodes.push({
    id: 'root',
    type: 'branch',
    position: { x: -NODE_WIDTH / 2, y: 0 },
    data: { branch: root, isRoot: true, onSelect } satisfies BranchNodeData,
  })

  let cursor = -rightLeaves / 2
  right.forEach((c, i) => {
    place(c, `r-${i}`, 1, 1, cursor, 'root')
    cursor += countLeaves(c)
  })
  cursor = -leftLeaves / 2
  left.forEach((c, i) => {
    place(c, `l-${i}`, 1, -1, cursor, 'root')
    cursor += countLeaves(c)
  })

  return { nodes, edges }
}

/** 커스텀 노드 — 유형 색상 카드 + 좌우 연결 핸들 */
function BranchNode({ data }: NodeProps) {
  const { branch, isRoot, onSelect } = data as BranchNodeData
  const style = TYPE_COLORS[branch.type] || TYPE_COLORS.extending

  return (
    <div
      onClick={() => onSelect(branch)}
      style={{ width: NODE_WIDTH }}
      className={clsx(
        'rounded-xl border px-3 py-2.5 cursor-pointer transition-all hover:scale-[1.03]',
        isRoot
          ? 'bg-synapse-purple/15 border-synapse-purple/50 shadow-[0_0_24px_rgba(168,85,247,0.25)]'
          : clsx('bg-navy-800/90', style.bg, style.border)
      )}
    >
      {/* 직선 엣지용 핸들 (좌우 양방향) */}
      <Handle id="tl" type="target" position={Position.Left} className="!opacity-0 !pointer-events-none" />
      <Handle id="tr" type="target" position={Position.Right} className="!opacity-0 !pointer-events-none" />
      <Handle id="sl" type="source" position={Position.Left} className="!opacity-0 !pointer-events-none" />
      <Handle id="sr" type="source" position={Position.Right} className="!opacity-0 !pointer-events-none" />

      {!isRoot && (
        <span className={clsx('text-[9px] font-medium px-1.5 py-0.5 rounded', style.bg, style.text)}>
          {style.label}
        </span>
      )}
      <p
        className={clsx(
          'leading-snug mt-1',
          isRoot ? 'text-sm font-semibold text-white/90' : 'text-xs font-medium text-white/80'
        )}
      >
        {branch.concept}
      </p>
      {branch.evidence.length > 0 && (
        <div className="flex items-center gap-1 mt-1.5 text-[10px] text-white/35">
          <BookOpen size={9} />
          근거 {branch.evidence.length}편
        </div>
      )}
    </div>
  )
}

const nodeTypes = { branch: BranchNode }

interface Props {
  result: ExploreResult
  onClose: () => void
}

export default function MindMap({ result, onClose }: Props) {
  const [selected, setSelected] = useState<ExploreBranch | null>(null)

  const onSelect = useCallback((b: ExploreBranch) => setSelected(b), [])

  const { nodes, edges } = useMemo(
    () => layoutMindMap(result.tree, onSelect),
    [result, onSelect]
  )

  const selectedStyle = selected ? TYPE_COLORS[selected.type] || TYPE_COLORS.extending : null

  return (
    <div className="absolute inset-0 z-[5]" style={{ background: '#0A0E1A' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        nodesDraggable
        nodesConnectable={false}
        onPaneClick={() => setSelected(null)}
      >
        <Background color="#1E2A45" gap={24} size={1} />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>

      {/* 상단 헤더 — 명제 + 신뢰도 + 닫기 */}
      <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 glass-panel px-4 py-2.5 flex items-center gap-3 max-w-[60%]">
        <Compass size={15} className="text-synapse-purple flex-shrink-0" />
        <p className="text-sm text-white/85 font-medium truncate">{result.proposition}</p>
        <span className="text-[10px] text-synapse-purple flex-shrink-0">
          신뢰도 {(result.confidence * 100).toFixed(0)}%
        </span>
        <button
          onClick={onClose}
          title="그래프로 돌아가기"
          className="flex-shrink-0 text-white/40 hover:text-white/80 transition-colors"
        >
          <X size={15} />
        </button>
      </div>

      {/* 선택된 분기 상세 — 근거 논문 */}
      {selected && selectedStyle && (
        <div className="absolute top-28 right-4 bottom-4 z-20 w-80 glass-panel overflow-y-auto p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className={clsx('text-[10px] font-medium px-1.5 py-0.5 rounded', selectedStyle.bg, selectedStyle.text)}>
              {selectedStyle.label}
            </span>
            <button onClick={() => setSelected(null)} className="ml-auto text-white/40 hover:text-white/80">
              <X size={13} />
            </button>
          </div>
          <p className="text-sm font-medium text-white/85 mb-1.5">{selected.concept}</p>
          <p className="text-xs text-white/50 leading-relaxed mb-3">{selected.summary}</p>

          {selected.evidence.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] text-white/30 font-medium">근거 논문 {selected.evidence.length}편</p>
              {selected.evidence.map((ev, i) => (
                <div key={i} className="p-2.5 bg-navy-800 rounded-lg border border-white/5">
                  <p className="text-[11px] font-medium text-white/70">{ev.title}</p>
                  <p className="text-[10px] text-white/30 mb-1.5">
                    {ev.authors[0]} {ev.authors.length > 1 && '외'} · {ev.year} · p.{ev.page}
                  </p>
                  <div className="flex gap-1.5">
                    <Quote size={9} className="text-white/20 flex-shrink-0 mt-0.5" />
                    <p className="text-[10px] text-white/50 italic leading-relaxed">"{ev.quote}"</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
