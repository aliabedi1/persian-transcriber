import { useEffect, useState } from 'react'
import { AudioLines, ShieldCheck, FolderOpen, FileAudio, ArrowRight, Copy, Download, Check, Square, CircleAlert, FileText } from 'lucide-react'
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
import './App.css'

type Segment = { start: number; end: number; text: string }
declare global { interface Window { transcriber: {
  status: () => Promise<{ ready: boolean }>;
  choose: () => Promise<{ name: string; size: number } | null>;
  transcribe: (language: string) => Promise<{ segments?: Segment[]; error?: string }>;
  cancel: () => Promise<void>;
  save: (data: { format: string; text: string; segments: Segment[] }) => Promise<boolean>;
  copy: (text: string) => Promise<void>;
  onProgress: (callback: (data: { stage: string; percent: number }) => void) => () => void;
} } }
const time = (ms: number) => `${Math.floor(ms / 60000).toString().padStart(2, '0')}:${Math.floor(ms / 1000 % 60).toString().padStart(2, '0')}`
export default function App() {
  const [ready, setReady] = useState<boolean | null>(null)
  const [file, setFile] = useState<{ name: string; size: number } | null>(null)
  const [language, setLanguage] = useState('fa')
  const [segments, setSegments] = useState<Segment[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState({ stage: 'Starting', percent: 0 })
  const [error, setError] = useState(() => window.transcriber ? '' : 'Open Ava using the desktop launcher.')
  const [notice, setNotice] = useState('')
  const text = segments.map(s => s.text).join('\n')
  useEffect(() => {
    if (!window.transcriber) return
    window.transcriber.status().then(s => setReady(s.ready)).catch(e => setError(String(e)))
    return window.transcriber.onProgress(setProgress)
  }, [])
  useEffect(() => { if (notice) { const id = setTimeout(() => setNotice(''), 4000); return () => clearTimeout(id) } }, [notice])
  async function choose() {
    try { const chosen = await window.transcriber.choose(); if (chosen) { setFile(chosen); setSegments([]); setError(''); setNotice('') } }
    catch (e) { setError(String(e)) }
  }
  async function start() {
    setBusy(true); setSegments([]); setError(''); setNotice(''); setProgress({ stage: 'Preparing audio', percent: 0 })
    try {
      const result = await window.transcriber.transcribe(language)
      if (result.error) setError(result.error)
      else { setSegments(result.segments || []); setNotice(result.segments?.length ? 'Transcription complete. Review and save your text.' : 'No speech was detected. Try a clearer recording.') }
    } catch (e) { setError(String(e)) } finally { setBusy(false) }
  }
  async function save(format: string) {
    try { if (await window.transcriber.save({ format, text, segments })) setNotice(`${format.toUpperCase()} saved on your computer.`) }
    catch (e) { setError(String(e)) }
  }
  return <div className="app-shell">
    <header className="topbar"><div className="brand"><div className="brand-icon"><AudioLines aria-hidden="true" /></div><div><strong>Ava <span lang="fa">آوا</span></strong><p>Persian transcriber</p></div></div><Badge variant="secondary"><ShieldCheck data-icon="inline-start" /> Offline workspace</Badge></header>
    <main>
      <div className="intro"><div><p className="eyebrow">YOUR WORDS, ON YOUR COMPUTER</p><h1>Give your recordings a voice in text.</h1><p>Persian audio and video → editable text. Private by design.</p></div><div className="persian-mark" lang="fa" aria-hidden="true">آوا</div></div>
      {ready === false ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Local engine needs setup</AlertTitle><AlertDescription>Run setup.ps1 in the project folder while connected to the internet, then restart Ava. Transcription works offline after setup.</AlertDescription></Alert> : null}
      {error ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Could not complete the action</AlertTitle><AlertDescription className="error-detail">{error}</AlertDescription></Alert> : null}
      <div className="workspace">
        <aside className="flex flex-col gap-5">
          <Card><CardHeader><CardTitle>Your recording</CardTitle><CardDescription>Start with a file from your computer.</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="file-well"><FileAudio aria-hidden="true" /><p>{file ? file.name : 'Audio or video'}</p><span>{file ? `${(file.size / 1048576).toFixed(1)} MB · stays on this computer` : 'MP3, M4A, MP4, WAV, OGG and more'}</span><Button variant="outline" onClick={choose} disabled={busy}><FolderOpen data-icon="inline-start" />{file ? 'Change file' : 'Choose file'}</Button></div>
              <FieldGroup><Field><FieldLabel htmlFor="language">Spoken language</FieldLabel><NativeSelect id="language" value={language} onChange={e => setLanguage(e.target.value)} disabled={busy} className="w-full"><NativeSelectOption value="fa">Persian · فارسی</NativeSelectOption><NativeSelectOption value="auto">Detect automatically</NativeSelectOption><NativeSelectOption value="en">English</NativeSelectOption><NativeSelectOption value="ar">Arabic · العربية</NativeSelectOption></NativeSelect><FieldDescription>Choose Persian for Farsi recordings.</FieldDescription></Field></FieldGroup>
              <Separator /><div className="model-note"><AudioLines aria-hidden="true" /><div><strong>Whisper large-v3 turbo</strong><p>Multilingual · runs on your CPU</p></div><Badge variant="outline">{ready ? 'Ready' : 'Checking'}</Badge></div>
            </CardContent><CardFooter><Button className="w-full" size="lg" onClick={start} disabled={!file || !ready || busy}>{busy ? 'Transcribing…' : 'Transcribe recording'}<ArrowRight data-icon="inline-end" /></Button></CardFooter></Card>
          <div className="privacy-note"><ShieldCheck aria-hidden="true" /><div><strong>Your recordings stay yours.</strong><p>No uploads, accounts or usage limits. Once set up, you can disconnect the internet.</p></div></div>
        </aside>
        <Card className="transcript-card"><CardHeader><CardTitle>Transcript</CardTitle><CardDescription>{segments.length ? 'Edit any passage below. Exports include your edits.' : 'Your words will appear here.'}</CardDescription></CardHeader>
          <CardContent className="transcript-content">
            {busy ? <div className="working"><AudioLines className="working-icon" aria-hidden="true" /><h2>{progress.stage}</h2><p>You can keep the internet disconnected.</p><Progress value={progress.percent} className="w-full"><ProgressLabel>Progress</ProgressLabel><ProgressValue /></Progress><Button variant="outline" onClick={() => window.transcriber.cancel().catch(e => setError(String(e)))}><Square data-icon="inline-start" />Cancel transcription</Button></div>
              : segments.length ? <div className="segment-list">{segments.map((s, i) => <div className="segment" key={`${s.start}-${i}`}><span className="timestamp">{time(s.start)}</span><Textarea aria-label={`Passage ${i + 1}`} dir={language === 'en' ? 'ltr' : 'auto'} lang={language === 'fa' ? 'fa' : undefined} value={s.text} onChange={e => setSegments(prev => prev.map((v, n) => n === i ? { ...v, text: e.target.value } : v))} /></div>)}</div>
              : <Empty className="h-full"><EmptyHeader><EmptyMedia variant="icon"><FileText /></EmptyMedia><EmptyTitle>Ready when you are</EmptyTitle><EmptyDescription>Choose a recording, then select Transcribe recording. Persian text and timestamps will appear here.</EmptyDescription></EmptyHeader></Empty>}
          </CardContent><CardFooter className="flex-wrap justify-between gap-3"><span className="text-sm text-muted-foreground">{segments.length ? `${text.split(/\s+/).filter(Boolean).length} words · ${segments.length} passages` : 'TXT · SRT · VTT'}</span><div className="flex flex-wrap gap-2"><Button variant="ghost" disabled={!segments.length || busy} onClick={async () => { try { await window.transcriber.copy(text); setNotice('Text copied.') } catch (e) { setError(String(e)) } }}><Copy data-icon="inline-start" />Copy</Button>{['txt','srt','vtt'].map(format => <Button variant="outline" key={format} disabled={!segments.length || busy} onClick={() => save(format)}><Download data-icon="inline-start" />{format.toUpperCase()}</Button>)}</div></CardFooter></Card>
      </div>
      <div className="statusbar" role="status" aria-live="polite">{notice ? <><Check aria-hidden="true" />{notice}</> : <><ShieldCheck aria-hidden="true" />{busy ? 'Working locally. Longer recordings may take several minutes.' : 'Everything is processed locally. Review automatic transcripts for names and specialist terms.'}</>}</div>
    </main>
  </div>
}
