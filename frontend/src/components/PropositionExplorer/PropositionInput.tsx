import { useState } from 'react'
import { Compass, Loader2, Sparkles } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { exploreApi } from '@/api/explore'
import type { ExploreResult } from '@/types'

const EXAMPLE_PROPOSITIONS = [
  '수면 부족은 창의성을 저하시킨다',
  'Transformer 아키텍처는 RNN의 한계를 극복한다',
  '사회적 고립은 인지 기능 저하를 가속화한다',
]

interface Props {
  workspaceId: string
  onResult: (result: ExploreResult) => void
}

export default function PropositionInput({ workspaceId, onResult }: Props) {
  const [proposition, setProposition] = useState('')
  const [mode, setMode] = useState<'focused' | 'balanced' | 'exploratory'>('balanced')

  const { mutate: explore, isPending, isError, error } = useMutation({
    mutationFn: (p: string) =>
      exploreApi.explore(workspaceId, {
        proposition: p,
        mode,
        maxBranches: 5,
        maxDepth: 3,
        includeContradictions: true,
      }),
    onSuccess: (res) => onResult(res.data.data),
  })

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Compass size={16} className="text-synapse-purple" />
        <h3 className="text-sm font-semibold">명제 탐색</h3>
      </div>

      <textarea
        value={proposition}
        onChange={(e) => setProposition(e.target.value)}
        placeholder="탐색할 명제나 질문을 입력하세요..."
        rows={3}
        className="input-field resize-none text-sm mb-3"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && proposition.trim()) {
            explore(proposition.trim())
          }
        }}
      />

      {/* 탐색 모드 */}
      <div className="flex gap-1 mb-3">
        {(['focused', 'balanced', 'exploratory'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 py-1 rounded text-xs transition-all ${
              mode === m
                ? 'bg-synapse-purple/20 text-synapse-purple border border-synapse-purple/30'
                : 'text-white/30 hover:text-white/60'
            }`}
          >
            {m === 'focused' ? '집중' : m === 'balanced' ? '균형' : '탐험'}
          </button>
        ))}
      </div>

      {/* 예시 명제 */}
      <div className="mb-3">
        <p className="text-[10px] text-white/25 mb-1.5">예시</p>
        <div className="space-y-1">
          {EXAMPLE_PROPOSITIONS.map((ex) => (
            <button
              key={ex}
              onClick={() => setProposition(ex)}
              className="w-full text-left text-xs text-white/35 hover:text-white/60 
                         py-1 px-2 rounded hover:bg-white/5 transition-colors truncate"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={() => proposition.trim() && explore(proposition.trim())}
        disabled={isPending || !proposition.trim()}
        className="w-full py-2 rounded-lg bg-gradient-to-r from-synapse-purple/20 to-pink-500/20
                   border border-synapse-purple/30 text-synapse-purple text-sm font-medium
                   hover:from-synapse-purple/30 hover:to-pink-500/30 disabled:opacity-40
                   transition-all flex items-center justify-center gap-2"
      >
        {isPending ? (
          <><Loader2 size={14} className="animate-spin" />탐색 중...</>
        ) : (
          <><Sparkles size={14} />탐색 시작</>
        )}
      </button>

      {isError && (
        <p className="mt-2 text-xs text-red-400/80">
          탐색에 실패했습니다. 잠시 후 다시 시도해주세요.
          {error instanceof Error && error.message.includes('timeout') && ' (응답 시간 초과)'}
        </p>
      )}
    </div>
  )
}
