import { useEffect, useState } from 'react'
import { Moon, Sun, AudioLines, ShieldCheck, FolderOpen, FileAudio, ArrowRight, Copy, Download, Check, Square, CircleAlert, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { Progress, ProgressLabel, ProgressValue } from '@/components/ui/progress'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { persian } from './i18n'
import './App.css'

type Segment = { start: number; end: number; text: string }
declare global { interface Window { transcriber: {
  status: () => Promise<{ ready: boolean; gpu: { available: boolean; name: string } }>;
  choose: () => Promise<{ name: string; size: number } | null>;
  transcribe: (language: string, device: string) => Promise<{ segments?: Segment[]; error?: string; device?: string; fallback?: boolean }>;
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
  const [theme, setTheme] = useState(() => localStorage.getItem('ava-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'))
  useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark'); document.documentElement.style.colorScheme = theme; localStorage.setItem('ava-theme', theme) }, [theme])
  const [ready, setReady] = useState<boolean | null>(null)
  const [file, setFile] = useState<{ name: string; size: number } | null>(null)
  const [device, setDevice] = useState(() => localStorage.getItem('ava-device') || 'auto')
  const [gpu, setGpu] = useState({ available: false, name: t("Checking GPU…") })
  const [language, setLanguage] = useState('fa')
  const [segments, setSegments] = useState<Segment[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState({ stage: t("Starting"), percent: 0 })
  const [error, setError] = useState(() => window.transcriber ? '' : 'Open Ava using the desktop launcher.')
  const [notice, setNotice] = useState('')
  const text = segments.map(s => s.text).join('\n')
  useEffect(() => {
    if (!window.transcriber) return
    window.transcriber.status().then(s => { setReady(s.ready); setGpu(s.gpu) }).catch(e => setError(String(e)))
    return window.transcriber.onProgress(setProgress)
  }, [])
  useEffect(() => { if (notice) { const id = setTimeout(() => setNotice(''), 4000); return () => clearTimeout(id) } }, [notice])
  async function choose() {
    try { const chosen = await window.transcriber.choose(); if (chosen) { setFile(chosen); setSegments([]); setError(''); setNotice('') } }
    catch (e) { setError(String(e)) }
  }
  async function start() {
    setBusy(true); setSegments([]); setError(''); setNotice(''); setProgress({ stage: t("Preparing audio"), percent: 0 })
    try {
      const result = await window.transcriber.transcribe(language, device)
      if (result.error) setError(result.error)
      else { setSegments(result.segments || []); setNotice(result.segments?.length ? `Transcription complete using ${result.device?.toUpperCase() || t("CPU")}${result.fallback ? ' (GPU fallback)' : ''}. Review and save your text.` : t("No speech was detected. Try a clearer recording.")) }
    } catch (e) { setError(String(e)) } finally { setBusy(false) }
  }
  async function save(format: string) {
    try { if (await window.transcriber.save({ format, text, segments })) setNotice(uiLanguage === 'fa' ? `فایل ${format.toUpperCase()} ذخیره شد.` : `${format.toUpperCase()} saved on your computer.`) }
    catch (e) { setError(String(e)) }
  }
  return <div className="app-shell">
    <header className="topbar"><div className="brand"><div className="brand-icon"><AudioLines aria-hidden="true" /></div><div><strong>Ava <span lang="fa">آوا</span></strong><p>{t("Persian transcriber")}</p></div></div><div className="flex items-center gap-3"><NativeSelect aria-label="Interface language / زبان برنامه" value={uiLanguage} onChange={e => setUiLanguage(e.target.value)}><NativeSelectOption value="fa">فارسی</NativeSelectOption><NativeSelectOption value="en">English</NativeSelectOption></NativeSelect><Button variant="outline" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? t("Switch to light mode") : t("Switch to dark mode")}>{theme === 'dark' ? <Sun data-icon="inline-start" /> : <Moon data-icon="inline-start" />}{theme === 'dark' ? t("Light mode") : t("Dark mode")}</Button><Badge variant="secondary"><ShieldCheck data-icon="inline-start" /> {t("Offline workspace")}</Badge></div></header>
    <main>
      <div className="intro"><div><p className="eyebrow">{t("YOUR WORDS, ON YOUR COMPUTER")}</p><h1>{t("Give your recordings a voice in text.")}</h1><p>{t("Persian audio and video → editable text. Private by design.")}</p></div><div className="persian-mark" lang="fa" aria-hidden="true">آوا</div></div>
      {ready === false ? <Alert variant="destructive"><CircleAlert /><AlertTitle>{t("Local engine needs setup")}</AlertTitle><AlertDescription>{t("Run setup.ps1 in the project folder while connected to the internet, then restart Ava. Transcription works offline after setup.")}</AlertDescription></Alert> : null}
      {error ? <Alert variant="destructive"><CircleAlert /><AlertTitle>{t("Could not complete the action")}</AlertTitle><AlertDescription className="error-detail">{t(error)}</AlertDescription></Alert> : null}
      <div className="workspace">
        <aside className="flex flex-col gap-5">
          <Card><CardHeader><CardTitle>{t("Your recording")}</CardTitle><CardDescription>{t("Start with a file from your computer.")}</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="file-well"><FileAudio aria-hidden="true" /><p>{file ? file.name : t("Audio or video")}</p><span>{file ? `${(file.size / 1048576).toFixed(1)} MB` : t("MP3, M4A, MP4, WAV, OGG and more")}</span><Button variant="outline" onClick={choose} disabled={busy}><FolderOpen data-icon="inline-start" />{file ? t("Change file") : t("Choose file")}</Button></div>
              <FieldGroup><Field><FieldLabel htmlFor="language">{t("Spoken language")}</FieldLabel><NativeSelect id="language" value={language} onChange={e => setLanguage(e.target.value)} disabled={busy} className="w-full"><NativeSelectOption value="fa">{t("Persian · فارسی")}</NativeSelectOption><NativeSelectOption value="auto">{t("Detect automatically")}</NativeSelectOption><NativeSelectOption value="en">{t("English")}</NativeSelectOption><NativeSelectOption value="ar">{t("Arabic · العربية")}</NativeSelectOption></NativeSelect><FieldDescription>{t("Choose Persian for Farsi recordings.")}</FieldDescription></Field></FieldGroup>
              <FieldGroup><Field><FieldLabel htmlFor="processor">{t("Processor")}</FieldLabel><NativeSelect id="processor" value={device} disabled={busy} onChange={e => { setDevice(e.target.value); localStorage.setItem('ava-device', e.target.value) }} className="w-full"><NativeSelectOption value="auto">{uiLanguage === 'fa' ? 'خودکار' : 'Auto'} · {gpu.available ? 'GPU' : t("CPU")}</NativeSelectOption><NativeSelectOption value="gpu" disabled={!gpu.available}>{t("GPU · Vulkan")}</NativeSelectOption><NativeSelectOption value="cpu">{t("CPU")}</NativeSelectOption></NativeSelect><FieldDescription>{t(gpu.name)}</FieldDescription></Field></FieldGroup><Separator /><div className="model-note"><AudioLines aria-hidden="true" /><div><strong>Whisper large-v3 turbo</strong><p>{device === 'cpu' || !gpu.available ? t("CPU processing") : t("GPU acceleration")}</p></div><Badge variant="outline">{ready ? t("Ready") : t("Checking")}</Badge></div>
            </CardContent><CardFooter><Button className="w-full" size="lg" onClick={start} disabled={!file || !ready || busy}>{busy ? t("Transcribing…") : t("Transcribe recording")}<ArrowRight data-icon="inline-end" /></Button></CardFooter></Card>
          <div className="privacy-note"><ShieldCheck aria-hidden="true" /><div><strong>{t("Your recordings stay yours.")}</strong><p>{t("No uploads, accounts or usage limits. Once set up, you can disconnect the internet.")}</p></div></div>
        </aside>
        <Card className="transcript-card"><CardHeader><CardTitle>{t("Transcript")}</CardTitle><CardDescription>{segments.length ? t("Edit any passage below. Exports include your edits.") : t("Your words will appear here.")}</CardDescription></CardHeader>
          <CardContent className="transcript-content">
            {busy ? <div className="working"><AudioLines className="working-icon" aria-hidden="true" /><h2>{t(progress.stage)}</h2><p>{t("You can keep the internet disconnected.")}</p><Progress value={progress.percent} className="w-full"><ProgressLabel>{t("Progress")}</ProgressLabel><ProgressValue /></Progress><Button variant="outline" onClick={() => window.transcriber.cancel().catch(e => setError(String(e)))}><Square data-icon="inline-start" />{t("Cancel transcription")}</Button></div>
              : segments.length ? <div className="segment-list">{segments.map((s, i) => <div className="segment" key={`${s.start}-${i}`}><span className="timestamp">{time(s.start)}</span><Textarea aria-label={`${uiLanguage === 'fa' ? 'بخش' : 'Passage'} ${i + 1}`} dir={language === 'en' ? 'ltr' : 'auto'} lang={language === 'fa' ? 'fa' : undefined} value={s.text} onChange={e => setSegments(prev => prev.map((v, n) => n === i ? { ...v, text: e.target.value } : v))} /></div>)}</div>
              : <Empty className="h-full"><EmptyHeader><EmptyMedia variant="icon"><FileText /></EmptyMedia><EmptyTitle>{t("Ready when you are")}</EmptyTitle><EmptyDescription>{t("Choose a recording, then select Transcribe recording. Persian text and timestamps will appear here.")}</EmptyDescription></EmptyHeader></Empty>}
          </CardContent><CardFooter className="flex-wrap justify-between gap-3"><span className="text-sm text-muted-foreground">{segments.length ? `${text.split(/\s+/).filter(Boolean).length} ${uiLanguage === 'fa' ? 'واژه' : 'words'} · ${segments.length} ${uiLanguage === 'fa' ? 'بخش' : 'passages'}` : 'TXT · SRT · VTT'}</span><div className="flex flex-wrap gap-2"><Button variant="ghost" disabled={!segments.length || busy} onClick={async () => { try { await window.transcriber.copy(text); setNotice(t("Text copied.")) } catch (e) { setError(String(e)) } }}><Copy data-icon="inline-start" />{t("Copy")}</Button>{['txt','srt','vtt'].map(format => <Button variant="outline" key={format} disabled={!segments.length || busy} onClick={() => save(format)}><Download data-icon="inline-start" />{format.toUpperCase()}</Button>)}</div></CardFooter></Card>
      </div>
      <div className="statusbar" role="status" aria-live="polite">{notice ? <><Check aria-hidden="true" />{notice}</> : <><ShieldCheck aria-hidden="true" />{busy ? t("Working locally. Longer recordings may take several minutes.") : t("Everything is processed locally. Review automatic transcripts for names and specialist terms.")}</>}</div>
    </main>
  </div>
}
