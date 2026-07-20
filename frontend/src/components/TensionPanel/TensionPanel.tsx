import { useState } from 'react'
import { Scale, Loader2, X, Quote, Search, CheckCircle2, CircleDashed } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { tensionsApi, type TensionResult, type Tension, type ConflictType, type TensionClaim } from '@/api/tensions'

// 충돌 원인별 색상 — 해소 가능한 것(방법론 차이)과 실질적 상충을 시각적으로 구분
const CONFLICT_STYLE: Record<ConflictType, { label: string; cls: string; hint: string }> = {
  measurement: { label: '측정 불일치', cls: 'text-synapse-blue border-synapse-blue/40 bg-synapse-blue/10',
                 hint: '같은 개념을 서로 다른 지표로 측정' },
  population:  { label: '표본 차이',   cls: 'text-synapse-green border-synapse-green/40 bg-synapse-green/10',
                 hint: '대상 집단·데이터셋이 다름' },
  design:      { label: '설계 차이',   cls: 'text-synapse-purple border-synapse-purple/40 bg-synapse-purple/10',
                 hint: '연구 설계가 다름' },
  analysis:    { label: '분석 차이',   cls: 'text-amber-400 border-amber-400/40 bg-amber-400/10',
                 hint: '통제변인·분석기법이 다름' },
  scale:       { label: '규모/조건',   cls: 'text-cyan-400 border-cyan-400/40 bg-cyan-400/10',
                 hint: '데이터 규모·세팅이 다름' },
  genuine:     { label: '실질적 상충', cls: 'text-synapse-coral border-synapse-coral/40 bg-synapse-coral/10',
                 hint: '방법이 비슷한데 결과가 반대 — 진짜 쟁점' },
}

const METHOD_FIELDS: Array<[keyof TensionClaim['method'], string]> = [
  ['population', '대상'],
  ['sampleSize', '표본'],
  ['measure', '측정'],
  ['design', '설계'],
]

function ClaimSide({ claim, side }: { claim: TensionClaim; side: 'A' | 'B' }) {
  const dir = claim.method?.direction
  return (
    <div className="flex-1 min-w-0 p-3 bg-navy-800 rounded-lg border border-white/5">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-white/40">{side}</span>
        {dir && (
          <span className={clsx('text-[9px] px-1.5 py-0.5 rounded',
            dir === 'positive' ? 'text-synapse-green bg-synapse-green/10' : 'text-synapse-coral bg-synapse-coral/10')}>
            {dir === 'positive' ? '긍정' : '부정'}
          </span>
        )}
      </div>

      <p className="text-[11px] text-white/80 leading-relaxed mb-2">{claim.statement}</p>

      {claim.quote && (
        <div className="flex gap-1.5 mb-2">
          <Quote size={8} className="text-white/20 flex-shrink-0 mt-1" />
          <p className="text-[10px] text-white/40 italic leading-snug line-clamp-3">"{claim.quote}"</p>
        </div>
      )}

      {/* 방법론 지문 — 이 서비스의 핵심. 없으면 '미보고'로 명시 */}
      <div className="space-y-1 pt-2 border-t border-white/5">
        {METHOD_FIELDS.map(([key, label]) => {
          const val = claim.method?.[key] as string | null | undefined
          return (
            <div key={key} className="flex gap-2 text-[9.5px] leading-snug">
              <span className="text-white/25 w-7 flex-shrink-0">{label}</span>
              <span className={val ? 'text-white/55' : 'text-white/20 italic'}>
                {val || '미보고'}
              </span>
            </div>
          )
        })}
      </div>

      {claim.paperTitle && (
        <p className="text-[9px] text-white/30 mt-2 pt-2 border-t border-white/5 truncate">
          {claim.paperTitle}{claim.year ? ` · ${claim.year}` : ''}
        </p>
      )}
    </div>
  )
}

function TensionCard({ t }: { t: Tension }) {
  const style = CONFLICT_STYLE[t.conflictType] || CONFLICT_STYLE.genuine
  return (
    <div className="border border-white/8 rounded-xl p-3.5 bg-navy-900/40">
      <p className="text-xs font-medium text-white/85 leading-snug mb-2.5">{t.issue}</p>

      <div className="flex gap-2 items-stretch">
        <ClaimSide claim={t.claimA} side="A" />
        <div className="flex items-center">
          <span className="text-[9px] font-mono text-white/25 rotate-90 md:rotate-0">vs</span>
        </div>
        <ClaimSide claim={t.claimB} side="B" />
      </div>

      {/* 왜 어긋나는가 — 차별화의 핵심 */}
      <div className="mt-2.5 p-2.5 rounded-lg bg-white/[0.03] border border-white/5">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <span className={clsx('text-[10px] font-medium px-2 py-0.5 rounded border', style.cls)}>
            {style.label}
          </span>
          <span className="text-[9px] text-white/25">{style.hint}</span>
          <span className={clsx('ml-auto text-[9px] px-1.5 py-0.5 rounded',
            t.resolvable ? 'text-synapse-green bg-synapse-green/10' : 'text-synapse-coral bg-synapse-coral/10')}>
            {t.resolvable ? '조건부 양립 가능' : '해소 어려움'}
          </span>
        </div>
        <p className="text-[10.5px] text-white/60 leading-relaxed">{t.reconciliation}</p>
      </div>
    </div>
  )
}

interface Props {
  workspaceId: string
  onClose: () => void
}

export default function TensionPanel({ workspaceId, onClose }: Props) {
  const [topic, setTopic] = useState('')
  const [result, setResult] = useState<TensionResult | null>(null)

  const { mutate: analyse, isPending, isError } = useMutation({
    mutationFn: (t: string) =>
      tensionsApi.find(workspaceId, { topic: t.trim() || undefined, maxTensions: 6 }),
    onSuccess: (res) => setResult(res.data.data),
  })

  return (
    <div className="absolute top-16 right-4 bottom-4 z-30 w-[440px] max-w-[calc(100vw-2rem)]
                    glass-panel flex flex-col overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 flex-shrink-0">
        <Scale size={15} className="text-synapse-gold" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-white/85">쟁점 재조정</h3>
          <p className="text-[10px] text-white/35">논문들이 어긋날 때, 왜 어긋나는지 규명합니다</p>
        </div>
        <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors">
          <X size={15} />
        </button>
      </div>

      {/* 입력 */}
      <div className="px-3 py-3 border-b border-white/5 flex-shrink-0 flex gap-2">
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && !isPending && analyse(topic)}
          placeholder="쟁점을 볼 주제 (비우면 전체 분석)"
          className="input-field flex-1 text-xs"
        />
        <button
          onClick={() => analyse(topic)}
          disabled={isPending}
          className="px-3 rounded-lg bg-synapse-gold/15 border border-synapse-gold/30 text-synapse-gold
                     hover:bg-synapse-gold/25 disabled:opacity-40 transition-all"
        >
          {isPending ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
        </button>
      </div>

      {/* 결과 */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {!result && !isPending && !isError && (
          <div className="text-[11px] text-white/35 leading-relaxed mt-2 space-y-2">
            <p>업로드한 논문들에서 <b className="text-white/60">서로 대립하는 주장</b>을 찾아,
               각 주장의 <b className="text-white/60">방법론</b>(대상·표본·측정·설계)을 뽑아 비교합니다.</p>
            <p>충돌이 단순한 <b className="text-white/60">측정 방식의 차이</b>인지,
               아니면 <b className="text-white/60">진짜 상충</b>인지 구분해줍니다.</p>
          </div>
        )}

        {isPending && (
          <div className="space-y-2 animate-pulse mt-1">
            <div className="h-3 bg-white/10 rounded w-3/4" />
            <div className="h-24 bg-white/5 rounded-xl" />
            <div className="h-24 bg-white/5 rounded-xl" />
            <p className="text-[10px] text-white/30 text-center pt-1">주장을 추출하고 충돌을 분류하는 중...</p>
          </div>
        )}

        {isError && (
          <p className="text-[11px] text-synapse-coral/80">분석에 실패했습니다. 잠시 후 다시 시도해주세요.</p>
        )}

        {result && (
          <>
            <p className="text-[11px] text-white/60 leading-relaxed">{result.summary}</p>

            {result.tensions.length === 0 && (
              <p className="text-[11px] text-white/35 italic">
                뚜렷한 쟁점을 찾지 못했습니다. 대립되는 관점의 논문을 더 추가해보세요.
              </p>
            )}

            {result.tensions.map((t) => <TensionCard key={t.id} t={t} />)}

            {result.consensus?.length > 0 && (
              <div className="pt-1">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <CheckCircle2 size={11} className="text-synapse-green" />
                  <p className="text-[10px] text-white/45 font-medium">합의 지점</p>
                </div>
                <ul className="space-y-1">
                  {result.consensus.map((c, i) => (
                    <li key={i} className="text-[10.5px] text-white/50 leading-snug pl-3 border-l border-synapse-green/30">{c}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.gaps?.length > 0 && (
              <div className="pt-1">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <CircleDashed size={11} className="text-white/35" />
                  <p className="text-[10px] text-white/45 font-medium">연구 공백</p>
                </div>
                <ul className="space-y-1">
                  {result.gaps.map((g, i) => (
                    <li key={i} className="text-[10.5px] text-white/40 leading-snug pl-3 border-l border-white/10">{g}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
