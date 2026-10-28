import { useEffect, useRef, useState } from 'react'
import { AudioLines, FolderOpen, FileAudio, Copy, Download, Check, CircleX, CircleAlert, FileText, Languages, Sun, Moon, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { Progress, ProgressLabel, ProgressValue } from '@/components/ui/progress'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Textarea } from '@/components/ui/textarea'
import { useThemePreference, setThemePreference } from './lib/theme'
import { formatDuration, estimateRemaining } from './lib/timing'
import { persian } from './i18n'
import avaIcon from './assets/ava-icon.png'
import './App.css'

type Segment = { start: number; end: number; text: string }
declare global { interface Window { transcriber: {
  status: () => Promise<{ ready: boolean; gpu: { available: boolean; name: string } }>;
  choose: () => Promise<{ name: string; size: number } | null>;
  transcribe: (language: string, device: string, quality: string) => Promise<{ segments?: Segment[]; error?: string; device?: string; fallback?: boolean }>;
  cancel: () => Promise<void>;
  save: (data: { format: string; text: string; segments: Segment[] }) => Promise<boolean>;
  copy: (text: string) => Promise<void>;
  onProgress: (callback: (data: { stage: string; percent: number }) => void) => () => void;
} } }
const time = (ms: number) => `${Math.floor(ms / 60000).toString().padStart(2, '0')}:${Math.floor(ms / 1000 % 60).toString().padStart(2, '0')}`
export default function App() {
  const [uiLanguage, setUiLanguage] = useState(() => localStorage.getItem('ava-ui-language') === 'en' ? 'en' : 'fa')
  const t = (text: string) => uiLanguage === 'fa' ? persian[text] || text : text
  useEffect(() => {
    document.documentElement.lang = uiLanguage
    document.documentElement.dir = uiLanguage === 'fa' ? 'rtl' : 'ltr'
    localStorage.setItem('ava-ui-language', uiLanguage)
  }, [uiLanguage])
  const theme = useThemePreference()
  const [ready, setReady] = useState<boolean | null>(null)
  const [file, setFile] = useState<{ name: string; size: number } | null>(null)
  const [quality, setQuality] = useState(() => localStorage.getItem('ava-quality') || 'accurate')
  const [device, setDevice] = useState(() => localStorage.getItem('ava-device') || 'auto')
  const [gpu, setGpu] = useState({ available: false, name: t("Checking GPU…") })
  const [language, setLanguage] = useState('fa')
  const [segments, setSegments] = useState<Segment[]>([])
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [clockNow, setClockNow] = useState(0)
  const [etaDeadline, setEtaDeadline] = useState<number | null>(null)
  const phase = useRef({ stage: '', started: 0, percent: 0 })
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState({ stage: t("Starting"), percent: 0 })
  const [error, setError] = useState(() => window.transcriber ? '' : 'Open Ava using the desktop launcher.')
  const [notice, setNotice] = useState('')
  const text = segments.map(s => s.text).join('\n')
  useEffect(() => {
    if (!window.transcriber) return
    window.transcriber.status().then(s => { setReady(s.ready); setGpu(s.gpu) }).catch(e => setError(String(e)))
    return window.transcriber.onProgress(p => {
      const now = performance.now()
      if (p.stage !== phase.current.stage || p.percent < phase.current.percent || p.percent === 0) {
        phase.current = { stage: p.stage, started: now, percent: p.percent }
        setEtaDeadline(null)
      } else {
        const remaining = estimateRemaining(now - phase.current.started, p.percent)
        setEtaDeadline(remaining === null ? null : now + remaining)
        phase.current.percent = p.percent
      }
      setProgress(p)
    })
  }, [])
  useEffect(() => { if (notice) { const id = setTimeout(() => setNotice(''), 4000); return () => clearTimeout(id) } }, [notice])
  useEffect(() => {
    if (!busy) return
    const id = setInterval(() => setClockNow(performance.now()), 1000)
    return () => clearInterval(id)
  }, [busy])
  async function choose() {
    try { const chosen = await window.transcriber.choose(); if (chosen) { setStartedAt(null); setEtaDeadline(null); setFile(chosen); setSegments([]); setError(''); setNotice('') } }
    catch (e) { setError(String(e)) }
  }
  async function start() {
    const now = performance.now()
    setStartedAt(now); setClockNow(now); setEtaDeadline(null); phase.current = { stage: '', started: now, percent: 0 }
    setBusy(true); setSegments([]); setError(''); setNotice(''); setProgress({ stage: t("Preparing audio"), percent: 0 })
    try {
      const result = await window.transcriber.transcribe(language, device, quality)
      if (result.error) setError(result.error)
      else { setSegments(result.segments || []); setNotice(result.segments?.length ? `Transcription complete using ${result.device?.toUpperCase() || t("CPU")}${result.fallback ? ' (GPU fallback)' : ''}. Review and save your text.` : t("No speech was detected. Try a clearer recording.")) }
    } catch (e) { setError(String(e)) } finally { setClockNow(performance.now()); setBusy(false); setEtaDeadline(null) }
  }
  async function save(format: string) {
    try { if (await window.transcriber.save({ format, text, segments })) setNotice(uiLanguage === 'fa' ? `فایل ${format.toUpperCase()} ذخیره شد.` : `${format.toUpperCase()} saved on your computer.`) }
    catch (e) { setError(String(e)) }
  }
  return <div className="app-shell">
    <header className="topbar"><div className="brand"><img className="brand-icon" src={avaIcon} alt="" /><div><strong>Ava <span lang="fa">آوا</span></strong></div></div><div className="flex items-center gap-3"><NativeSelect icon={Languages} aria-label="Interface language / زبان برنامه" value={uiLanguage} onChange={e => setUiLanguage(e.target.value)}><NativeSelectOption value="fa">فارسی</NativeSelectOption><NativeSelectOption value="en">English</NativeSelectOption></NativeSelect><NativeSelect icon={theme === 'system' ? Monitor : theme === 'dark' ? Moon : Sun} aria-label="Appearance / ظاهر" value={theme} onChange={e => setThemePreference(e.target.value)}><NativeSelectOption value="system">{uiLanguage === 'fa' ? 'پیروی از سیستم' : 'System'}</NativeSelectOption><NativeSelectOption value="light">{uiLanguage === 'fa' ? 'روشن' : 'Light'}</NativeSelectOption><NativeSelectOption value="dark">{uiLanguage === 'fa' ? 'تیره' : 'Dark'}</NativeSelectOption></NativeSelect><Badge variant="secondary">{uiLanguage === 'fa' ? 'آفلاین' : 'Offline'}</Badge></div></header>
    <main>
      <h1>{uiLanguage === 'fa' ? 'تبدیل صدا و ویدیو به متن' : 'Audio and video transcription'}</h1>
      {ready === false ? <Alert variant="destructive"><CircleAlert /><AlertTitle>{t("Local engine needs setup")}</AlertTitle><AlertDescription>{t("Run setup.ps1 in the project folder while connected to the internet, then restart Ava. Transcription works offline after setup.")}</AlertDescription></Alert> : null}
      {error ? <Alert variant="destructive"><CircleAlert /><AlertTitle>{t("Could not complete the action")}</AlertTitle><AlertDescription className="error-detail">{t(error)}</AlertDescription></Alert> : null}
      <div className="workspace">
        <aside className="flex flex-col gap-5">
          <Card><CardHeader><CardTitle>{t("Your recording")}</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="file-well"><FileAudio aria-hidden="true" /><p>{file ? file.name : t("Audio or video")}</p><span>{file ? `${(file.size / 1048576).toFixed(1)} MB` : t("MP3, M4A, MP4, WAV, OGG and more")}</span><Button variant="outline" onClick={choose} disabled={busy}><FolderOpen aria-hidden="true" data-icon="inline-start" />{file ? t("Change file") : t("Choose file")}</Button></div>
              <FieldGroup><Field><FieldLabel htmlFor="language">{t("Spoken language")}</FieldLabel><NativeSelect id="language" value={language} onChange={e => setLanguage(e.target.value)} disabled={busy} className="w-full"><NativeSelectOption value="fa">{t("Persian · فارسی")}</NativeSelectOption><NativeSelectOption value="auto">{t("Detect automatically")}</NativeSelectOption><NativeSelectOption value="en">{t("English")}</NativeSelectOption><NativeSelectOption value="ar">{t("Arabic · العربية")}</NativeSelectOption></NativeSelect></Field></FieldGroup>
              <FieldGroup><Field><FieldLabel htmlFor="quality">{uiLanguage === 'fa' ? 'دقت تبدیل' : 'Accuracy'}</FieldLabel><NativeSelect id="quality" value={quality} disabled={busy} onChange={e => { setQuality(e.target.value); localStorage.setItem('ava-quality', e.target.value) }} className="w-full"><NativeSelectOption value="accurate">{uiLanguage === 'fa' ? 'دقت بیشتر (کندتر)' : 'Higher accuracy (slower)'}</NativeSelectOption><NativeSelectOption value="fast">{uiLanguage === 'fa' ? 'سریع‌تر' : 'Faster'}</NativeSelectOption></NativeSelect></Field></FieldGroup><FieldGroup><Field><FieldLabel htmlFor="processor">{t("Processor")}</FieldLabel><NativeSelect id="processor" value={device} disabled={busy} onChange={e => { setDevice(e.target.value); localStorage.setItem('ava-device', e.target.value) }} className="w-full"><NativeSelectOption value="auto">{uiLanguage === 'fa' ? 'خودکار' : 'Auto'} · {gpu.available ? 'GPU' : t("CPU")}</NativeSelectOption><NativeSelectOption value="gpu" disabled={!gpu.available}>{t("GPU · Vulkan")}</NativeSelectOption><NativeSelectOption value="cpu">{t("CPU")}</NativeSelectOption></NativeSelect><FieldDescription>{t(gpu.name)}</FieldDescription></Field></FieldGroup>
            </CardContent><CardFooter><Button className="w-full" size="lg" onClick={start} disabled={!file || !ready || busy}><FileText aria-hidden="true" data-icon="inline-start" />{busy ? t("Transcribing…") : t("Transcribe recording")}</Button></CardFooter></Card>
        </aside>
        <Card className="transcript-card"><CardHeader><CardTitle>{t("Transcript")}</CardTitle>{segments.length ? <CardDescription>{uiLanguage === 'fa' ? 'متن را بررسی و ویرایش کنید، سپس خروجی بگیرید.' : 'Review and edit the text, then export.'}</CardDescription> : null}</CardHeader>
          <CardContent className="transcript-content">
            {busy ? <div className="working"><AudioLines className="working-icon" aria-hidden="true" /><h2>{t(progress.stage)}</h2><div className="job-timing"><span>{uiLanguage === 'fa' ? 'زمان سپری‌شده' : 'Elapsed'} <b dir="ltr" data-testid="elapsed">{formatDuration(clockNow - (startedAt ?? clockNow))}</b></span><span>{uiLanguage === 'fa' ? 'زمان باقی‌مانده (تقریبی)' : 'Estimated remaining'} <b dir="ltr" data-testid="remaining">{etaDeadline === null ? (uiLanguage === 'fa' ? 'در حال برآورد…' : 'Estimating…') : etaDeadline <= clockNow && progress.percent < 100 ? (uiLanguage === 'fa' ? 'در حال تکمیل…' : 'Finishing…') : formatDuration(Math.max(0, etaDeadline - clockNow))}</b></span></div><Progress value={progress.percent} className="w-full"><ProgressLabel>{t("Progress")}</ProgressLabel><ProgressValue /></Progress><Button variant="outline" onClick={() => window.transcriber.cancel().catch(e => setError(String(e)))}><CircleX aria-hidden="true" data-icon="inline-start" />{t("Cancel transcription")}</Button></div>
              : segments.length ? <div className="segment-list">{segments.map((s, i) => <div className="segment" key={`${s.start}-${i}`}><span className="timestamp">{time(s.start)}</span><Textarea aria-label={`${uiLanguage === 'fa' ? 'بخش' : 'Passage'} ${i + 1}`} dir={language === 'en' ? 'ltr' : 'auto'} lang={language === 'fa' ? 'fa' : undefined} value={s.text} onChange={e => setSegments(prev => prev.map((v, n) => n === i ? { ...v, text: e.target.value } : v))} /></div>)}</div>
              : <Empty className="h-full"><EmptyHeader><EmptyMedia variant="icon"><FileText /></EmptyMedia><EmptyTitle>{uiLanguage === 'fa' ? 'متنی برای نمایش نیست' : 'No transcript yet'}</EmptyTitle><EmptyDescription>{uiLanguage === 'fa' ? 'یک فایل انتخاب کنید و «تبدیل به متن» را بزنید.' : 'Choose a file and select Transcribe recording.'}</EmptyDescription></EmptyHeader></Empty>}
          </CardContent><CardFooter className="flex-wrap justify-between gap-3"><span className="text-sm text-muted-foreground">{startedAt !== null && !busy ? `${uiLanguage === 'fa' ? 'زمان پردازش' : 'Processing time'}: ${formatDuration(clockNow - startedAt)}` : segments.length ? `${text.split(/\s+/).filter(Boolean).length} ${uiLanguage === 'fa' ? 'واژه' : 'words'} · ${segments.length} ${uiLanguage === 'fa' ? 'بخش' : 'passages'}` : 'TXT · SRT · VTT'}</span><div className="flex flex-wrap gap-2"><Button variant="ghost" disabled={!segments.length || busy} onClick={async () => { try { await window.transcriber.copy(text); setNotice(t("Text copied.")) } catch (e) { setError(String(e)) } }}><Copy aria-hidden="true" data-icon="inline-start" />{t("Copy")}</Button>{['txt','srt','vtt'].map(format => <Button variant="outline" key={format} disabled={!segments.length || busy} onClick={() => save(format)}><Download aria-hidden="true" data-icon="inline-start" />{format.toUpperCase()}</Button>)}</div></CardFooter></Card>
      </div>
      <div className="statusbar" role="status" aria-live="polite">{notice ? <><Check aria-hidden="true" />{notice}</> : null}</div>
    </main>
  </div>
}
