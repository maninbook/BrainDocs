import { useState, useRef, useEffect } from 'react'
import { MessageCircle, Send, Loader2, X, BookOpen } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { chatApi, type ChatMessage } from '@/api/chat'

interface Props {
  workspaceId: string
  onClose: () => void
}

export default function ChatPanel({ workspaceId, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const { mutate: send, isPending } = useMutation({
    mutationFn: (history: ChatMessage[]) =>
      chatApi.send(
        workspaceId,
        history.map(({ role, content }) => ({ role, content }))
      ),
    onSuccess: (res) => {
      const { answer, sources } = res.data.data
      setMessages((prev) => [...prev, { role: 'assistant', content: answer, sources }])
    },
    onError: () => {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '답변 생성에 실패했습니다. 잠시 후 다시 시도해주세요.' },
      ])
    },
  })

  const handleSend = () => {
    const q = input.trim()
    if (!q || isPending) return
    const next: ChatMessage[] = [...messages, { role: 'user', content: q }]
    setMessages(next)
    setInput('')
    send(next)
  }

  // 새 메시지 시 스크롤 하단 고정
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, isPending])

  return (
    <div className="absolute bottom-6 right-4 z-30 w-96 h-[520px] max-h-[75vh] glass-panel flex flex-col overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 flex-shrink-0">
        <MessageCircle size={15} className="text-synapse-blue" />
        <h3 className="text-sm font-semibold text-white/80">논문에게 질문하기</h3>
        <button onClick={onClose} className="ml-auto text-white/40 hover:text-white/80 transition-colors">
          <X size={15} />
        </button>
      </div>

      {/* 메시지 목록 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-xs text-white/30 leading-relaxed mt-4">
            업로드된 논문을 근거로 답하는 AI입니다.
            <br />
            예: "GraphRAG의 커뮤니티 요약은 어떻게 동작해?"
          </p>
        )}

        {messages.map((m, i) => (
          <div key={i} className={clsx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={clsx(
                'max-w-[85%] rounded-xl px-3 py-2',
                m.role === 'user'
                  ? 'bg-synapse-blue/15 border border-synapse-blue/25'
                  : 'bg-navy-800 border border-white/5'
              )}
            >
              <p className="text-xs text-white/80 leading-relaxed whitespace-pre-wrap">{m.content}</p>

              {/* 출처 */}
              {m.sources && m.sources.length > 0 && (
                <div className="mt-2 pt-2 border-t border-white/5 space-y-1">
                  {m.sources.map((s, j) => (
                    <div key={j} className="flex items-start gap-1.5">
                      <span className="text-[9px] text-synapse-green font-mono flex-shrink-0 mt-0.5">[{j + 1}]</span>
                      <p className="text-[10px] text-white/40 leading-snug">
                        {s.title}
                        {s.authors[0] && <span className="text-white/25"> · {s.authors[0]} 외</span>}
                        {s.year && <span className="text-white/25"> · {s.year}</span>}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {isPending && (
          <div className="flex justify-start">
            <div className="bg-navy-800 border border-white/5 rounded-xl px-3 py-2 flex items-center gap-2">
              <Loader2 size={12} className="animate-spin text-synapse-blue" />
              <span className="text-xs text-white/40">논문을 찾아보는 중...</span>
            </div>
          </div>
        )}
      </div>

      {/* 입력 */}
      <div className="px-3 py-3 border-t border-white/5 flex-shrink-0 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && handleSend()}
          placeholder="논문 내용에 대해 질문하세요..."
          className="input-field flex-1 text-xs"
        />
        <button
          onClick={handleSend}
          disabled={isPending || !input.trim()}
          className="px-3 rounded-lg bg-synapse-blue/15 border border-synapse-blue/25 text-synapse-blue
                     hover:bg-synapse-blue/25 disabled:opacity-40 transition-all"
        >
          <Send size={13} />
        </button>
      </div>
    </div>
  )
}
