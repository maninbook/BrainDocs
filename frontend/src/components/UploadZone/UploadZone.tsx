import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Upload, X, FileText, Loader2, Star } from 'lucide-react'
import { papersApi } from '@/api/papers'
import { clsx } from 'clsx'

interface Props {
  workspaceId: string
  onClose: () => void
}

export default function UploadZone({ workspaceId, onClose }: Props) {
  const [isDragging, setIsDragging] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [isKeyPaper, setIsKeyPaper] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [doiInput, setDoiInput] = useState('')
  const [uploadMode, setUploadMode] = useState<'pdf' | 'doi'>('pdf')
  const queryClient = useQueryClient()

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const pdfs = Array.from(e.dataTransfer.files).filter(
      (f) => f.type === 'application/pdf'
    )
    setFiles((prev) => [...prev, ...pdfs])
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return
    setFiles((prev) => [...prev, ...Array.from(e.target.files!)])
  }

  const handleUpload = async () => {
    if (uploading) return
    setUploading(true)
    setError(null)
    try {
      if (uploadMode === 'pdf') {
        for (const file of files) {
          const formData = new FormData()
          formData.append('file', file)
          formData.append('is_key_paper', String(isKeyPaper))
          await papersApi.upload(workspaceId, formData)
        }
      } else if (doiInput.trim()) {
        const formData = new FormData()
        formData.append('doi', doiInput.trim())
        formData.append('is_key_paper', String(isKeyPaper))
        await papersApi.upload(workspaceId, formData)
      }
      queryClient.invalidateQueries({ queryKey: ['papers', workspaceId] })
      onClose()
    } catch (err: any) {
      console.error(err)
      const message = err.response?.data?.detail || err.message || '업로드 중 오류가 발생했습니다.'
      setError(message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="glass-panel w-full max-w-lg p-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold">논문 추가</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white/80">
            <X size={18} />
          </button>
        </div>

        {/* 모드 탭 */}
        <div className="flex gap-1 mb-5 p-1 bg-navy-700 rounded-lg">
          {(['pdf', 'doi'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setUploadMode(mode)}
              className={clsx(
                'flex-1 py-1.5 rounded-md text-sm font-medium transition-all',
                uploadMode === mode ? 'bg-synapse-blue/20 text-synapse-blue' : 'text-white/40'
              )}
            >
              {mode === 'pdf' ? 'PDF 업로드' : 'DOI / arXiv ID'}
            </button>
          ))}
        </div>

        {uploadMode === 'pdf' ? (
          <>
            {/* 드래그 앤 드롭 */}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              className={clsx(
                'border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer relative',
                isDragging
                  ? 'border-synapse-blue bg-synapse-blue/10 scale-[1.02]'
                  : 'border-white/10 hover:border-white/30 hover:bg-white/5'
              )}
              onClick={() => document.getElementById('file-input')?.click()}
            >
              <Upload size={32} className="mx-auto mb-3 text-white/20" />
              <p className="text-sm text-white/60 font-medium">PDF를 드래그하거나 클릭하여 업로드</p>
              <p className="text-xs text-white/30 mt-1">최대 50MB · PDF 형식만</p>
              <input
                id="file-input"
                type="file"
                multiple
                accept=".pdf"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {/* 선택된 파일 목록 */}
            {files.length > 0 && (
              <div className="mt-3 space-y-1.5 max-h-40 overflow-y-auto">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 bg-navy-700 rounded-lg">
                    <FileText size={14} className="text-synapse-blue flex-shrink-0" />
                    <span className="text-xs text-white/70 truncate flex-1">{f.name}</span>
                    <span className="text-xs text-white/30">{(f.size / 1024 / 1024).toFixed(1)}MB</span>
                    <button onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}>
                      <X size={12} className="text-white/30 hover:text-white/70" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <input
            type="text"
            placeholder="10.1234/example 또는 arxiv:2301.00001"
            value={doiInput}
            onChange={(e) => setDoiInput(e.target.value)}
            className="input-field"
          />
        )}

        {/* 에러 메시지 */}
        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
            {error}
          </div>
        )}

        {/* 키 논문 옵션 */}
        <label className="flex items-center gap-2 mt-4 cursor-pointer group">
          <div
            onClick={() => setIsKeyPaper(!isKeyPaper)}
            className={clsx(
              'w-4 h-4 rounded border transition-all',
              isKeyPaper ? 'bg-synapse-gold border-synapse-gold' : 'border-white/20'
            )}
          />
          <Star size={13} className={clsx(isKeyPaper ? 'text-synapse-gold' : 'text-white/30')} />
          <span className="text-sm text-white/60 group-hover:text-white/80">키 논문으로 지정</span>
        </label>

        {/* 업로드 버튼 */}
        <button
          onClick={handleUpload}
          disabled={uploading || (uploadMode === 'pdf' ? files.length === 0 : !doiInput.trim())}
          className={clsx(
            'w-full mt-5 py-2.5 rounded-lg text-sm font-medium transition-all relative overflow-hidden',
            (uploadMode === 'pdf' && files.length === 0) || (uploadMode === 'doi' && !doiInput.trim())
              ? 'bg-white/5 text-white/20 border border-white/5'
              : 'bg-synapse-blue/20 border border-synapse-blue/40 text-synapse-blue hover:bg-synapse-blue/30',
            'disabled:cursor-not-allowed'
          )}
        >
          {uploading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              처리 중...
            </span>
          ) : (
            `${uploadMode === 'pdf' ? `${files.length}개 논문` : 'DOI'} 추가`
          )}
        </button>
        {(uploadMode === 'pdf' && files.length === 0 && !uploading) && (
          <p className="text-[10px] text-white/20 text-center mt-2">논문 파일을 먼저 선택해주세요</p>
        )}
      </div>
    </div>
  )
}
