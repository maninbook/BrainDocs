import { useEffect, useRef, useCallback } from 'react'
import Graph from 'graphology'
import Sigma from 'sigma'
// import { circular } from 'graphology-layout' (누락된 의존성 제거)
import FA2Layout from 'graphology-layout-forceatlas2/worker'
import { useGraphStore } from '@/stores/graphStore'
import type { GraphData } from '@/types'

// 관계 유형별 엣지 색상
const EDGE_COLORS: Record<string, string> = {
  citation: '#5BC8F5',
  concept_share: '#4ECCA3',
  methodology: '#A855F7',
  contradiction: '#FF6B6B',
}

interface Props {
  workspaceId: string
}

export default function GraphView({ workspaceId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sigmaRef = useRef<Sigma | null>(null)
  const graphRef = useRef<Graph | null>(null)
  const layoutRef = useRef<FA2Layout | null>(null)
  const selectedNodeIdRef = useRef<string | null>(null)

  const { graphData, selectedNodeId, minStrength, setSelectedNode, setHoveredNode } = useGraphStore()

  // 그래프 데이터 → Graphology 변환
  const buildGraph = useCallback((data: GraphData) => {
    const g = new Graph({ multi: false, type: 'undirected' })

    data.nodes.forEach((node) => {
      g.addNode(node.id, {
        label: node.label.length > 30 ? node.label.slice(0, 30) + '…' : node.label,
        x: node.x || Math.random() * 100,
        y: node.y || Math.random() * 100,
        size: node.size,
        color: node.color,
        isKeyPaper: node.attributes.isKeyPaper,
        // sigma의 type은 'circle'만 지원 (커스텀 프로그램 안 씀)
        // node.type ('paper')는 attributes로만 전달
        nodeKind: node.type,
        ...node.attributes,
      })
    })

    data.edges
      .filter((e) => e.attributes.strength >= minStrength)
      .forEach((edge) => {
        if (g.hasNode(edge.source) && g.hasNode(edge.target) && !g.hasEdge(edge.source, edge.target)) {
          g.addEdge(edge.source, edge.target, {
            id: edge.id,
            size: Math.max(0.5, edge.attributes.strength * 4),
            color: EDGE_COLORS[edge.attributes.relationType] || '#4A7FA5',
            strength: edge.attributes.strength,
            relationType: edge.attributes.relationType,
            type: 'line',
          })
        }
      })

    return g
  }, [minStrength])

  useEffect(() => {
    if (!containerRef.current || !graphData) return

    // 기존 인스턴스 정리
    layoutRef.current?.stop()
    sigmaRef.current?.kill()

    const g = buildGraph(graphData)
    graphRef.current = g

    // 초기 원형 레이아웃 설정 (graphology-layout 미설치 대응)
    const nodes = g.nodes()
    nodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / nodes.length
      g.setNodeAttribute(node, 'x', 100 * Math.cos(angle))
      g.setNodeAttribute(node, 'y', 100 * Math.sin(angle))
    })
    // circular.assign(g)

    // Sigma 인스턴스 생성
    const sigma = new Sigma(g, containerRef.current, {
      renderEdgeLabels: false,
      defaultEdgeColor: '#4A7FA5',
      defaultNodeColor: '#4A7FA5',
      labelFont: 'Inter, sans-serif',
      labelSize: 12,
      labelColor: { color: '#94A3B8' },
      minCameraRatio: 0.05,
      maxCameraRatio: 5,
      allowInvalidContainer: true,
      nodeReducer: (node, data) => {
        const res = { ...data }
        if (data.isKeyPaper) {
          res.color = '#F5C842'
          res.size = (data.size || 10) * 1.5
        }
        const currentSelected = selectedNodeIdRef.current
        if (currentSelected && node !== currentSelected) {
          const neighbors = g.neighbors(currentSelected)
          if (!neighbors.includes(node)) {
            res.color = data.color + '40'
          }
        }
        return res
      },
      edgeReducer: (edge, data) => {
        const currentSelected = selectedNodeIdRef.current
        if (currentSelected) {
          const [s, t] = g.extremities(edge)
          if (s !== currentSelected && t !== currentSelected) {
            return { ...data, color: data.color + '20', size: 0.3 }
          }
        }
        return data
      },
    })
    sigmaRef.current = sigma

    // ForceAtlas2 레이아웃
    const layout = new FA2Layout(g, {
      settings: {
        gravity: 1,
        scalingRatio: 10,
        strongGravityMode: false,
        barnesHutOptimize: true,
      },
    })
    layoutRef.current = layout
    layout.start()
    setTimeout(() => layout.stop(), 3000) // 3초 후 레이아웃 고정

    // 이벤트 핸들러
    sigma.on('clickNode', ({ node }) => setSelectedNode(node))
    sigma.on('clickStage', () => setSelectedNode(null))
    sigma.on('enterNode', ({ node }) => setHoveredNode(node))
    sigma.on('leaveNode', () => setHoveredNode(null))

    return () => {
      layout.stop()
      sigma.kill()
    }
  }, [graphData, minStrength, buildGraph])

  // 선택된 노드 변경 시 ref 업데이트 후 sigma 새로고침 (stale closure 방지)
  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId
    sigmaRef.current?.refresh()
  }, [selectedNodeId])

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ background: '#0A0E1A' }}
    />
  )
}
