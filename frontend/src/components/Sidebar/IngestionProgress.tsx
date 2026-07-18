import { Loader2 } from 'lucide-react'

interface Props {
  progress: { paperId: string; stage: string; progress: number; message: string }
}

const STAGE_LABELS: Record<string, string> = {
  parsing: '📄 PDF 파싱',
  embedding: '🧠 임베딩',
  extracting: '🔍 개념 추출',
  indexing: '🕸️ 그래프 인덱싱',
}

export default function IngestionProgress({ progress }: Props) {
  return (
    <div className="p-2.5 rounded-lg bg-synapse-blue/5 border border-synapse-blue/10">
      <div className="flex items-center gap-2 mb-1.5">
        <Loader2 size={11} className="animate-spin text-synapse-blue" />
        <span className="text-[11px] text-synapse-blue font-medium">
          {STAGE_LABELS[progress.stage] || progress.stage}
        </span>
        <span className="text-[11px] text-white/40 ml-auto">{progress.progress}%</span>
      </div>
      <div className="w-full bg-white/5 rounded-full h-1">
        <div
          className="h-full bg-synapse-blue rounded-full transition-all duration-500"
          style={{ width: `${progress.progress}%` }}
        />
      </div>
    </div>
  )
}
