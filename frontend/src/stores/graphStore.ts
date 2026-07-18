import { create } from 'zustand'
import type { GraphData, GraphNode, GraphEdge } from '@/types'

type ViewMode = 'galaxy' | 'cluster' | 'timeline' | 'citation_tree' | 'proposition_map'

interface GraphStore {
  graphData: GraphData | null
  selectedNodeId: string | null
  hoveredNodeId: string | null
  viewMode: ViewMode
  minStrength: number
  showConceptNodes: boolean
  isLoading: boolean

  setGraphData: (data: GraphData) => void
  updateEdgeStrength: (edgeId: string, strength: number) => void
  addNodes: (nodes: GraphNode[]) => void
  addEdges: (edges: GraphEdge[]) => void
  setSelectedNode: (id: string | null) => void
  setHoveredNode: (id: string | null) => void
  setViewMode: (mode: ViewMode) => void
  setMinStrength: (val: number) => void
  setLoading: (v: boolean) => void
}

export const useGraphStore = create<GraphStore>((set) => ({
  graphData: null,
  selectedNodeId: null,
  hoveredNodeId: null,
  viewMode: 'galaxy',
  minStrength: 0,
  showConceptNodes: false,
  isLoading: false,

  setGraphData: (data) => set({ graphData: data }),

  updateEdgeStrength: (edgeId, strength) =>
    set((state) => {
      if (!state.graphData) return state
      return {
        graphData: {
          ...state.graphData,
          edges: state.graphData.edges.map((e) =>
            e.id === edgeId
              ? { ...e, size: strength * 5, attributes: { ...e.attributes, strength } }
              : e
          ),
        },
      }
    }),

  addNodes: (nodes) =>
    set((state) => ({
      graphData: state.graphData
        ? { ...state.graphData, nodes: [...state.graphData.nodes, ...nodes] }
        : null,
    })),

  addEdges: (edges) =>
    set((state) => ({
      graphData: state.graphData
        ? { ...state.graphData, edges: [...state.graphData.edges, ...edges] }
        : null,
    })),

  setSelectedNode: (id) => set({ selectedNodeId: id }),
  setHoveredNode: (id) => set({ hoveredNodeId: id }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setMinStrength: (val) => set({ minStrength: val }),
  setLoading: (v) => set({ isLoading: v }),
}))
