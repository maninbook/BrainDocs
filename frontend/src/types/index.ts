// ─── 논문 ──────────────────────────────────────────────
export interface Paper {
  id: string
  title: string
  authors: string[]
  year: number
  journal?: string
  doi?: string
  arxivId?: string
  abstract: string
  keywords: string[]
  isKeyPaper: boolean
  status: 'pending' | 'parsing' | 'embedding' | 'extracting' | 'indexing' | 'completed' | 'failed'
  connectionCount: number
  avgStrength: number
  clusterId?: string
  createdAt: string
}

export interface GraphNode {
  id: string
  type: 'paper' | 'concept'
  label: string
  x: number
  y: number
  size: number
  color: string
  attributes: {
    year?: number
    authors?: string[]
    isKeyPaper?: boolean
    clusterId?: string
    connectionCount?: number
  }
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  size: number
  color: string
  attributes: {
    strength: number
    relationType: 'citation' | 'concept_share' | 'methodology' | 'contradiction'
    sharedConcepts?: string[]
    reinforcementCount: number
  }
}

export interface GraphCluster {
  id: string
  label: string
  color: string
  paperCount: number
  summary: string
  centroidX: number
  centroidY: number
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  clusters: GraphCluster[]
  meta: { totalNodes: number; totalEdges: number; lastUpdated: string }
}

export interface ExploreEvidence {
  paperId: string
  title: string
  authors: string[]
  year: number
  quote: string
  page: number
  relevance: number
}

export interface ExploreBranch {
  id: string
  concept: string
  type: 'supporting' | 'contradicting' | 'extending' | 'methodological'
  summary: string
  evidence: ExploreEvidence[]
  children: ExploreBranch[]
}

export interface ExploreResult {
  proposition: string
  summary: string
  confidence: number
  tree: ExploreBranch
  relatedPapers: Array<{ paperId: string; title: string; relevance: number }>
  exploreId: string
}

export interface Workspace {
  id: string
  name: string
  description?: string
  paperCount?: number
  createdAt: string
  thumbnailColor: string
}
