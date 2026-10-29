import { useEffect, useRef, useState } from 'react'
import { Mic, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatDuration } from '@/lib/timing'

type Props = {
  disabled: boolean
  locale: string
  selectedName?: string
  onActive: (active: boolean) => void
  onRecorded: (file: { name: string; size: number }) => void
  onError: (message: string) => void
}

export function MicrophoneRecorder({ disabled, locale, selectedName, onActive, onRecorded, onError }: Props) {
  const [state, setState] = useState<'idle' | 'requesting' | 'recording' | 'saving'>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [preview, setPreview] = useState('')
  const [previewName, setPreviewName] = useState('')
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const mounted = useRef(false)
  const pending = useRef(false)
  const fa = locale === 'fa'
  const label = (en: string, persian: string) => fa ? persian : en

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (recorder.current?.state === 'recording') recorder.current.stop()
      stream.current?.getTracks().forEach(track => track.stop())
    }
  }, [])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  useEffect(() => { if (preview && previewName !== selectedName) URL.revokeObjectURL(preview) }, [preview, previewName, selectedName])
  useEffect(() => {
    if (state !== 'recording') return
    const start = performance.now()
    const timer = setInterval(() => setElapsed(performance.now() - start), 1000)
    return () => clearInterval(timer)
  }, [state])

  async function record() {
    if (pending.current || disabled) return
    pending.current = true
    onError(''); onActive(true); setState('requesting')
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('unsupported')
      const input = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      if (!mounted.current) { input.getTracks().forEach(track => track.stop()); return }
      stream.current = input
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type))
      const capture = new MediaRecorder(input, mimeType ? { mimeType } : undefined)
      recorder.current = capture
      const chunks: Blob[] = []
      let failed = false
      const release = () => {
        input.getTracks().forEach(track => track.stop())
        stream.current = null; recorder.current = null; pending.current = false
        if (mounted.current) { setState('idle'); onActive(false) }
      }
      capture.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
      capture.onerror = () => {
        failed = true
        if (mounted.current) onError(label('Microphone recording failed. Please try again.', 'ضبط میکروفون ناموفق بود. دوباره تلاش کنید.'))
        release()
      }
      capture.onstop = async () => {
        input.getTracks().forEach(track => track.stop())
        if (failed) return
        if (!mounted.current) { release(); return }
        setState('saving')
        try {
          const blob = new Blob(chunks, { type: capture.mimeType })
          if (!blob.size) throw new Error('empty')
          if (blob.size > 256 * 1024 * 1024) throw new Error('large')
          const file = await window.transcriber.recording(await blob.arrayBuffer(), blob.type)
          if (mounted.current) { setPreview(URL.createObjectURL(blob)); setPreviewName(file.name); onRecorded(file) }
        } catch (error) {
          if (mounted.current) onError(error instanceof Error && error.message === 'empty'
            ? label('The recording is empty. Record your voice and try again.', 'صدایی ضبط نشد. دوباره صدای خود را ضبط کنید.')
            : error instanceof Error && error.message === 'large'
              ? label('Recording is too large. Try a shorter recording.', 'صدای ضبط‌شده بیش از حد بزرگ است. ضبط کوتاه‌تری را امتحان کنید.')
            : label('Could not prepare the recording. Please try again.', 'آماده‌سازی صدای ضبط‌شده ممکن نشد. دوباره تلاش کنید.'))
        } finally { release() }
      }
      capture.start(1000)
      setPreview(''); setElapsed(0); setState('recording')
    } catch (error) {
      stream.current?.getTracks().forEach(track => track.stop())
      stream.current = null; pending.current = false
      if (!mounted.current) return
      setState('idle'); onActive(false)
      const name = error instanceof Error ? error.name : ''
      onError(name === 'NotAllowedError' || name === 'SecurityError'
        ? label('Microphone access was denied. Allow microphone access in your system privacy settings, then try again.', 'دسترسی به میکروفون رد شد. در تنظیمات حریم خصوصی سیستم، دسترسی میکروفون را فعال و دوباره تلاش کنید.')
        : name === 'NotFoundError' || name === 'DevicesNotFoundError'
          ? label('No microphone was found. Connect a microphone and try again.', 'میکروفونی پیدا نشد. یک میکروفون وصل کنید و دوباره تلاش کنید.')
          : label('Microphone recording is unavailable. Check that your microphone is connected and not in use by another app.', 'ضبط میکروفون در دسترس نیست. اتصال میکروفون را بررسی کنید و برنامه‌های دیگرِ در حال استفاده از آن را ببندید.'))
    }
  }

  return <section className="flex flex-col gap-3" aria-label={label('Microphone recording', 'ضبط میکروفون')}>
    {state === 'recording' ? <>
      <div role="status"><Badge variant="destructive"><Mic aria-hidden="true" />{label('Recording', 'در حال ضبط')}</Badge> <span dir="ltr">{formatDuration(elapsed)}</span></div>
      <Button variant="destructive" onClick={() => { setState('saving'); recorder.current?.stop() }}><Square aria-hidden="true" data-icon="inline-start" />{label('Stop recording', 'توقف ضبط')}</Button>
    </> : <Button variant="outline" disabled={disabled || state !== 'idle'} onClick={record}><Mic aria-hidden="true" data-icon="inline-start" />{state === 'requesting' ? label('Waiting for microphone…', 'در انتظار میکروفون…') : state === 'saving' ? label('Preparing recording…', 'آماده‌سازی صدای ضبط‌شده…') : label('Record from microphone', 'ضبط با میکروفون')}</Button>}
    {preview && previewName === selectedName ? <><audio className="w-full" controls src={preview} aria-label={label('Recording preview', 'پیش‌نمایش صدای ضبط‌شده')} /><p className="text-sm text-muted-foreground" role="status">{label('Recording ready. Select Transcribe recording to continue.', 'صدا آماده است. برای ادامه «تبدیل به متن» را بزنید.')}</p></> : null}
  </section>
}
