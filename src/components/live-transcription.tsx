import { useEffect, useRef, useState } from 'react'
import { AudioLines, Pause, Play, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { AppSelect } from '@/components/ui/app-select'
import { formatDuration } from '@/lib/timing'

export type LiveSegment = { start: number; end: number; text: string }
export type LiveResult = { segments: LiveSegment[]; historyId?: string; saveWarning?: string; error?: string }
type Props = {
  locale: string; language: string; device: string; disabled: boolean
  onActive: (active: boolean) => void; onBegin: () => void
  onUpdate: (segments: LiveSegment[]) => void; onComplete: (result: LiveResult) => void
  onError: (message: string) => void
}

export function LiveTranscription(props: Props) {
  const [state, setState] = useState<'idle' | 'starting' | 'recording' | 'paused' | 'stopping'>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [lag, setLag] = useState(0)
  const [level, setLevel] = useState(0)
  const [source, setSource] = useState('microphone')
  const [capabilities, setCapabilities] = useState<{ platform: string; system: boolean; reason?: string } | null>(null)
  const latest = useRef(props); latest.current = props
  const resources = useRef<{ context: AudioContext; node: AudioWorkletNode; stream: MediaStream } | null>(null)
  const active = useRef(false)
  const begun = useRef(false)
  const mounted = useRef(true)
  const stopping = useRef(false)
  const generation = useRef(0)
  const sending = useRef(Promise.resolve())
  const fa = props.locale === 'fa'
  const label = (en: string, persian: string) => fa ? persian : en
  function invalidateAttempt() { generation.current++ }

  async function release() {
    const capture = resources.current
    if (capture) {
      await window.transcriber.liveSystemStop().catch(() => {})
      resources.current = null
      // Flush the final partial packet before disconnecting the worklet.
      const flushed = new Promise<void>(resolve => {
        const listener = ({ data }: MessageEvent) => { if (data === 'flushed') { capture.node.port.removeEventListener('message', listener); resolve() } }
        capture.node.port.addEventListener('message', listener)
        setTimeout(() => { capture.node.port.removeEventListener('message', listener); resolve() }, 500)
      })
      capture.node.port.postMessage('flush')
      await flushed
      capture.stream.getTracks().forEach(track => track.stop())
      capture.node.disconnect(); await capture.context.close()
    }
  }
  async function stop() {
    if (stopping.current || !active.current) return
    generation.current++
    stopping.current = true; setState('stopping')
    try {
      await release(); await sending.current
      const result = await window.transcriber.liveStop({ discard: !begun.current })
      if (mounted.current && begun.current) latest.current.onComplete(result)
    } catch (error) { if (mounted.current) latest.current.onError(String(error)) }
    finally {
      active.current = false; stopping.current = false
      if (mounted.current) { setState('idle'); latest.current.onActive(false) }
    }
  }
  useEffect(() => {
    mounted.current = true
    window.transcriber.liveCapabilities().then(data => { if (mounted.current) setCapabilities(data) }).catch(error => latest.current.onError(String(error)))
    const unsubscribe = window.transcriber.onLiveUpdate(data => {
      if (!active.current) return
      if (data.segments) latest.current.onUpdate(data.segments)
      setLag(data.bufferedMs || 0)
      if (data.error) { latest.current.onError(data.error); void stop() }
    })
    const unsubscribeSystem = window.transcriber.onSystemAudio(bytes => resources.current?.node.port.postMessage(bytes, [bytes]))
    return () => {
      mounted.current = false; unsubscribe(); unsubscribeSystem()
      invalidateAttempt()
      if (active.current) {
        void release().then(() => sending.current).then(() => window.transcriber.liveStop({ discard: !begun.current })).catch(() => {})
        active.current = false
      }
    }
  }, [])
  useEffect(() => {
    if (state !== 'recording') return
    const start = performance.now()
    const timer = setInterval(() => setElapsed(elapsed + performance.now() - start), 1000)
    return () => clearInterval(timer)
    // Restart only when recording resumes; elapsed is the duration at that point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  async function start() {
    if (active.current || props.disabled) return
    active.current = true; begun.current = false; props.onActive(true); setState('starting'); props.onError('')
    const attempt = ++generation.current
    const check = () => { if (!mounted.current || attempt !== generation.current) throw new Error('Capture closed.') }
    let stream: MediaStream | undefined, context: AudioContext | undefined
    let requestedSource = source === 'system' ? 'system' : 'microphone'
    const inputs: MediaStream[] = []
    try {
      if (source !== 'system') inputs.push(await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false }))
      check()
      await window.transcriber.liveStart({ language: props.language, device: props.device, source, locale: props.locale })
      check()
      if (source !== 'microphone' && capabilities?.platform !== 'linux') {
        requestedSource = 'system'
        const desktop = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
        inputs.push(desktop)
        if (!desktop.getAudioTracks().length || desktop.getAudioTracks()[0].readyState !== 'live') throw new Error(label('System audio is unavailable. Check your output device and try again.', 'صدای سیستم در دسترس نیست. دستگاه خروجی صدا را بررسی کنید و دوباره تلاش کنید.'))
        check()
      }
      stream = new MediaStream(inputs.flatMap(input => input.getTracks()))
      context = new AudioContext()
      await context.audioWorklet.addModule(new URL('pcm-capture.js', window.location.href).href)
      check()
      const node = new AudioWorkletNode(context, 'pcm-capture')
      if (capabilities?.platform === 'linux' && source !== 'microphone') node.port.postMessage({ mode: source })
      const silence = context.createGain(); silence.gain.value = 0
      for (const input of inputs) {
        const gain = context.createGain(); gain.gain.value = 1 / inputs.length
        context.createMediaStreamSource(input).connect(gain); gain.connect(node)
      }
      node.connect(silence); silence.connect(context.destination)
      resources.current = { context, node, stream }
      node.port.onmessage = ({ data }: MessageEvent<ArrayBuffer | string | { error: string }>) => {
        if (!(data instanceof ArrayBuffer)) {
          if (typeof data === 'object' && data.error) { latest.current.onError(data.error); void stop() }
          return
        }
        const samples = new Int16Array(data)
        let power = 0
        for (const sample of samples) power += (sample / 32768) ** 2
        setLevel(Math.min(1, Math.sqrt(power / samples.length) * 4))
        sending.current = sending.current.then(() => window.transcriber.liveAudio(data)).catch(error => {
          latest.current.onError(String(error)); void stop()
        })
      }
      if (capabilities?.platform === 'linux' && source !== 'microphone') await window.transcriber.liveSystemStart()
      check()
      stream.getTracks().forEach(track => { track.onended = () => { if (attempt !== generation.current) return; latest.current.onError(label('The audio source disconnected. Your transcript will be saved.', 'منبع صدا قطع شد. متن شما ذخیره می‌شود.')); void stop() } })
      await context.resume()
      check()
      begun.current = true; props.onBegin(); setElapsed(0); setLag(0); setState('recording')
    } catch (error) {
      if (resources.current?.context === context) resources.current = null
      inputs.forEach(input => input.getTracks().forEach(track => track.stop())); await context?.close().catch(() => {})
      if (attempt !== generation.current) return
      await window.transcriber.liveStop({ discard: !begun.current }).catch(() => {})
      active.current = false
      if (mounted.current) {
        setState('idle'); props.onActive(false)
        props.onError(error instanceof DOMException && error.name === 'NotAllowedError'
          ? requestedSource === 'system'
            ? label('System audio capture was denied. Check screen and system-audio permissions, then retry.', 'دسترسی صدای سیستم رد شد. مجوزهای ضبط صفحه و صدای سیستم را بررسی کنید و دوباره تلاش کنید.')
            : label('Microphone access was denied. Allow it in system privacy settings, then retry.', 'دسترسی میکروفون رد شد. آن را در تنظیمات حریم خصوصی سیستم فعال کنید و دوباره تلاش کنید.')
          : error instanceof DOMException && error.name === 'NotFoundError'
            ? label('No audio input was found. Connect a microphone or output device, then retry.', 'ورودی صدا پیدا نشد. میکروفون یا دستگاه خروجی صدا را وصل کنید و دوباره تلاش کنید.')
            : String(error))
      }
    }
  }
  async function pause() {
    const next = state === 'paused' ? 'recording' : 'paused'
    resources.current?.node.port.postMessage(next === 'paused' ? 'pause' : 'resume')
    if (next === 'paused') setLevel(0)
    setState(next)
  }
  return <section className="flex flex-col gap-3" aria-label={label('Live transcription', 'تبدیل زنده')}>
    <FieldGroup><Field><FieldLabel htmlFor="live-source">{label('Live audio source', 'منبع صدای زنده')}</FieldLabel><AppSelect id="live-source" value={source} onValueChange={setSource} disabled={state !== 'idle' || props.disabled} options={[{ value: 'microphone', label: label('Microphone', 'میکروفون') }, { value: 'system', label: label('System / meeting audio', 'صدای سیستم / جلسه'), disabled: !capabilities?.system }, { value: 'both', label: label('Microphone + system audio', 'میکروفون + صدای سیستم'), disabled: !capabilities?.system }]} /></Field></FieldGroup>
    {state === 'idle' ? <Button variant="outline" disabled={props.disabled} onClick={start}><AudioLines aria-hidden="true" data-icon="inline-start" />{label('Start live transcription', 'شروع تبدیل زنده')}</Button> : <>
      <div className="flex flex-wrap items-center gap-2" role="status"><Badge variant="secondary">{state === 'starting' ? label('Loading live model…', 'بارگذاری مدل زنده…') : state === 'stopping' ? label('Finishing and saving…', 'تکمیل و ذخیره…') : state === 'paused' ? label('Paused', 'مکث') : source === 'both' ? label('Live · microphone + system', 'زنده · میکروفون + سیستم') : source === 'system' ? label('Live · system audio', 'زنده · صدای سیستم') : label('Live · microphone', 'زنده · میکروفون')}</Badge><span className="text-sm text-muted-foreground" dir="ltr">{formatDuration(elapsed)}</span></div>
      <meter className="w-full" min={0} max={1} value={state === 'recording' ? level : 0} aria-label={label('Audio input level', 'سطح صدای ورودی')} />
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={state === 'starting' || state === 'stopping'} onClick={pause}>{state === 'paused' ? <Play aria-hidden="true" data-icon="inline-start" /> : <Pause aria-hidden="true" data-icon="inline-start" />}{state === 'paused' ? label('Resume live', 'ادامهٔ تبدیل زنده') : label('Pause live', 'مکث تبدیل زنده')}</Button><Button variant="destructive" disabled={state === 'stopping'} onClick={stop}><Square aria-hidden="true" data-icon="inline-start" />{label('Stop and save', 'توقف و ذخیره')}</Button></div>
    </>}
    {source !== 'microphone' ? <p className="text-sm text-muted-foreground">{source === 'both' ? label('Use headphones to reduce echo and duplicate speech. All system playback is included.', 'برای کاهش پژواک و تکرار گفتار از هدفون استفاده کنید. همهٔ صداهای سیستم ضبط می‌شوند.') : label('Captures all system playback, including meetings. Only audio is processed; screen video is not saved.', 'همهٔ صداهای سیستم، از جمله جلسه‌ها، ضبط می‌شوند. فقط صدا پردازش می‌شود؛ تصویر صفحه ذخیره نمی‌شود.')}</p> : null}
    {capabilities?.reason ? <p className="text-sm text-muted-foreground">{label('System audio is unavailable. On Linux, install pulseaudio-utils and enable PulseAudio or PipeWire-Pulse.', 'صدای سیستم در دسترس نیست. در لینوکس pulseaudio-utils را نصب و PulseAudio یا PipeWire-Pulse را فعال کنید.')}<span className="sr-only">{capabilities.reason}</span></p> : null}
    <p className="text-sm text-muted-foreground">{lag > 15000 ? label('Transcription is catching up. You can pause capture while it finishes.', 'تبدیل از ضبط عقب افتاده است. می‌توانید ضبط را موقتاً متوقف کنید.') : label('Text appears as you speak, with a short delay. Processing stays on this computer.', 'متن با کمی تأخیر هنگام صحبت ظاهر می‌شود. پردازش روی همین رایانه انجام می‌شود.')}</p>
  </section>
}
