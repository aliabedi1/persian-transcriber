import { useEffect, useRef, useState } from 'react'
import { Cpu, Gauge, Sparkles, Zap, ScanLine, AudioLines, FolderOpen, FileAudio, Copy, Download, Check, CircleX, CircleAlert, FileText, Languages, Sun, Moon, Monitor, FolderCog, Save, ArrowLeft, RotateCcw, History, Settings, CircleHelp, House } from 'lucide-react'
import { Dashboard } from './components/dashboard'
import { UserTour } from './components/user-tour'
import { TranscriptionHistory } from './components/transcription-history'
import type { HistorySummary } from './components/transcription-history'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field'
import { AppSelect } from '@/components/ui/app-select'
import { DirectionProvider } from '@base-ui/react/direction-provider'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { Progress, ProgressLabel, ProgressValue } from '@/components/ui/progress'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Textarea } from '@/components/ui/textarea'
import { useThemePreference, setThemePreference } from './lib/theme'
import { formatDuration, estimateRemaining } from './lib/timing'
import { persian } from './i18n'
import avaIcon from './assets/ava-icon.png'
import './App.css'

type HistoryRecord = HistorySummary & { sourcePath: string; segments: Segment[]; quality: string; device: string; text: string }
type Segment = { start: number; end: number; text: string }
declare global { interface Window { transcriber: {
  historyList: (limit?: number, offset?: number) => Promise<HistorySummary[]>;
  historyGet: (id: string) => Promise<HistoryRecord>;
  historyUpdate: (id: string, segments: Segment[]) => Promise<HistoryRecord>;
  historyRetry: (id: string) => Promise<HistoryRecord>;
  saveFolder: () => Promise<string>;
  chooseSaveFolder: (locale?: string) => Promise<string>;
  openFolder: (id?: string) => Promise<void>;
  status: () => Promise<{ ready: boolean; gpu: { available: boolean; name: string } }>;
  choose: () => Promise<{ name: string; size: number } | null>;
  transcribe: (language: string, device: string, quality: string) => Promise<{ segments?: Segment[]; error?: string; device?: string; fallback?: boolean; historyId?: string; folder?: string; saveWarning?: string }>;
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
  const [view, setView] = useState<'home' | 'main' | 'history' | 'settings'>('home')
  const [tourStep, setTourStep] = useState<number | null>(() => localStorage.getItem('ava-tour-seen-v1') === 'true' ? null : 0)
  const guideButton = useRef<HTMLButtonElement>(null)
  function navigateTour(step: number) { setView(step === 0 ? 'home' : step === 5 ? 'settings' : 'main'); setTourStep(step) }
  function closeTour() { localStorage.setItem('ava-tour-seen-v1', 'true'); setTourStep(null); guideButton.current?.focus() }
  const [recent, setRecent] = useState<HistorySummary[]>([])
  const [historyItems, setHistoryItems] = useState<HistorySummary[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [saveFolder, setSaveFolder] = useState('')
  const [historyId, setHistoryId] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveWarning, setSaveWarning] = useState('')
  const [notice, setNotice] = useState('')
  const text = segments.map(s => s.text).join('\n')
  useEffect(() => {
    if (!window.transcriber) return
    Promise.all([window.transcriber.historyList(5), window.transcriber.saveFolder()]).then(([items, folder]) => { setRecent(items); setSaveFolder(folder) }).catch(e => setError(String(e)))
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
    try { const chosen = await window.transcriber.choose(); if (chosen) { setHistoryId(null); setDirty(false); setSaveWarning(''); setStartedAt(null); setEtaDeadline(null); setFile(chosen); setSegments([]); setError(''); setNotice('') } }
    catch (e) { setError(String(e)) }
  }
  async function start() {
    const now = performance.now()
    setStartedAt(now); setClockNow(now); setEtaDeadline(null); phase.current = { stage: '', started: now, percent: 0 }
    setHistoryId(null); setDirty(false); setSaveWarning('');
    setBusy(true); setSegments([]); setError(''); setNotice(''); setProgress({ stage: t("Preparing audio"), percent: 0 })
    try {
      const result = await window.transcriber.transcribe(language, device, quality)
      if (result.error) setError(result.error)
      else { setHistoryId(result.historyId || null); setSaveWarning(result.saveWarning || ''); setSegments(result.segments || []); setRecent(await window.transcriber.historyList(5)); setNotice(result.saveWarning ? (uiLanguage === 'fa' ? 'متن آماده است؛ ذخیرهٔ فایل کامل نشد.' : 'Transcript ready; file saving did not finish.') : result.segments?.length ? (uiLanguage === 'fa' ? 'متن و فایل‌ها ذخیره شدند.' : 'Transcript and files saved.') : (uiLanguage === 'fa' ? 'گفتاری تشخیص داده نشد؛ نتیجه در سوابق ذخیره شد.' : 'No speech detected; result saved to history.')) }
    } catch (e) { setError(String(e)) } finally { setClockNow(performance.now()); setBusy(false); setEtaDeadline(null) }
  }
  async function showHistory() {
    try { const items = await window.transcriber.historyList(50); setHistoryItems(items); setHasMore(items.length === 50); setView('history') } catch (e) { setError(String(e)) }
  }
  async function loadMore() {
    try { const items = await window.transcriber.historyList(50, historyItems.length); setHistoryItems(prev => [...prev, ...items]); setHasMore(items.length === 50) } catch (e) { setError(String(e)) }
  }
  async function openHistory(id: string) {
    try {
      const record = await window.transcriber.historyGet(id)
      setHistoryId(record.id); setFile({ name: record.name, size: 0 }); setLanguage(record.language); setQuality(record.quality); setSegments(record.segments); setDirty(false); setSaveWarning(record.saveError || ''); setError(''); setNotice(''); setStartedAt(null); setView('main')
    } catch (e) { setError(String(e)) }
  }
  async function saveEdits(retry = false) {
    if (!historyId) return
    setSaving(true)
    try {
      if (retry && dirty) await window.transcriber.historyUpdate(historyId, segments)
      const record = retry ? await window.transcriber.historyRetry(historyId) : await window.transcriber.historyUpdate(historyId, segments)
      setSaveWarning(record.saveError || ''); setDirty(false); setRecent(await window.transcriber.historyList(5)); setNotice(uiLanguage === 'fa' ? 'تغییرات در سوابق ذخیره شد.' : 'Changes saved to history.')
    } catch (e) { setError(String(e)) } finally { setSaving(false) }
  }
  async function changeFolder() { try { setSaveFolder(await window.transcriber.chooseSaveFolder(uiLanguage)) } catch (e) { setError(String(e)) } }
  async function revealFolder(id?: string) { try { await window.transcriber.openFolder(id) } catch (e) { setError(String(e)) } }
  async function save(format: string) {
    try { if (await window.transcriber.save({ format, text, segments })) setNotice(uiLanguage === 'fa' ? `فایل ${format.toUpperCase()} ذخیره شد.` : `${format.toUpperCase()} saved on your computer.`) }
    catch (e) { setError(String(e)) }
  }
  return <DirectionProvider direction={uiLanguage === 'fa' ? 'rtl' : 'ltr'}><div className="app-shell" data-tour-step={tourStep ?? undefined}>
    <header className="topbar"><div className="brand"><img className="brand-icon" src={avaIcon} alt="" /><div><strong>Ava <span lang="fa">آوا</span></strong></div></div><div className="flex items-center gap-2"><Button variant="ghost" aria-current={view === 'home' ? 'page' : undefined} onClick={() => setView('home')}><House aria-hidden="true" data-icon="inline-start" />{uiLanguage === 'fa' ? 'خانه' : 'Home'}</Button><Button ref={guideButton} variant="ghost" onClick={() => navigateTour(0)}><CircleHelp aria-hidden="true" data-icon="inline-start" />{uiLanguage === 'fa' ? 'راهنمای استفاده' : 'User guide'}</Button><Button variant="outline" aria-label="Settings / تنظیمات" aria-current={view === 'settings' ? 'page' : undefined} onClick={() => setView(view === 'settings' ? 'home' : 'settings')}><Settings aria-hidden="true" data-icon="inline-start" />{uiLanguage === 'fa' ? 'تنظیمات' : 'Settings'}</Button></div></header>
    <main>
      <div className="page-heading"><h1>{view === 'home' ? (uiLanguage === 'fa' ? 'خانه' : 'Home') : view === 'settings' ? (uiLanguage === 'fa' ? 'تنظیمات برنامه' : 'App settings') : view === 'history' ? (uiLanguage === 'fa' ? 'سوابق تبدیل' : 'Transcription history') : (uiLanguage === 'fa' ? 'تبدیل صدا و ویدیو به متن' : 'Audio and video transcription')}</h1>{view === 'main' ? <Button variant="outline" disabled={busy || saving} onClick={showHistory}><History aria-hidden="true" data-icon="inline-start" />{uiLanguage === 'fa' ? 'سوابق' : 'All history'}</Button> : view !== 'home' ? <Button variant="outline" onClick={() => setView(file || busy ? 'main' : 'home')}><ArrowLeft aria-hidden="true" data-icon="inline-start" />{uiLanguage === 'fa' ? 'بازگشت' : 'Back'}</Button> : null}</div>
      {tourStep !== null ? <UserTour step={tourStep} locale={uiLanguage} onStep={navigateTour} onClose={closeTour} /> : null}
      {ready === false ? <Alert variant="destructive"><CircleAlert /><AlertTitle>{t("Local engine needs setup")}</AlertTitle><AlertDescription>{t("Run setup.ps1 in the project folder while connected to the internet, then restart Ava. Transcription works offline after setup.")}</AlertDescription></Alert> : null}
      {error ? <Alert variant="destructive"><CircleAlert /><AlertTitle>{t("Could not complete the action")}</AlertTitle><AlertDescription className="error-detail">{t(error)}</AlertDescription></Alert> : null}
      {saveWarning ? <Alert variant="destructive"><CircleAlert /><AlertTitle>{uiLanguage === 'fa' ? 'ذخیرهٔ خودکار فایل کامل نشد' : 'Automatic file saving did not finish'}</AlertTitle><AlertDescription>{uiLanguage === 'fa' ? 'متن را از دست ندهید؛ پوشه را تغییر دهید و دوباره تلاش کنید.' : 'Keep the transcript open, choose another save folder, then retry.'}<p className="error-detail">{saveWarning}</p>{historyId ? <Button variant="outline" disabled={saving} onClick={() => saveEdits(true)}><RotateCcw aria-hidden="true" data-icon="inline-start" />{uiLanguage === 'fa' ? 'تلاش دوباره' : 'Retry saving'}</Button> : null}</AlertDescription></Alert> : null}
      {view === 'home' ? <Dashboard locale={uiLanguage} ready={ready} busy={busy} saving={saving} fileName={file?.name} saveFolder={saveFolder} recent={recent} onStart={() => setView('main')} onHistory={showHistory} onSettings={() => setView('settings')} onGuide={() => navigateTour(0)} onOpenFolder={() => revealFolder()} onOpen={openHistory} /> : view === 'settings' ? <div className="settings-page">
        <Card><CardHeader><CardTitle>{uiLanguage === 'fa' ? 'زبان و ظاهر' : 'Language and appearance'}</CardTitle></CardHeader><CardContent><FieldGroup>
          <Field><FieldLabel>{uiLanguage === 'fa' ? 'زبان برنامه' : 'Interface language'}</FieldLabel><AppSelect icon={Languages} aria-label="Interface language / زبان برنامه" value={uiLanguage} onValueChange={setUiLanguage} options={[{ value: 'fa', label: 'فارسی', description: 'Persian', icon: Languages }, { value: 'en', label: 'English', description: 'انگلیسی', icon: Languages }]} /></Field>
          <Field><FieldLabel>{uiLanguage === 'fa' ? 'ظاهر' : 'Appearance'}</FieldLabel><AppSelect icon={theme === 'system' ? Monitor : theme === 'dark' ? Moon : Sun} aria-label="Appearance / ظاهر" value={theme} onValueChange={setThemePreference} options={[{ value: 'system', label: uiLanguage === 'fa' ? 'پیروی از سیستم' : 'System', icon: Monitor }, { value: 'light', label: uiLanguage === 'fa' ? 'روشن' : 'Light', icon: Sun }, { value: 'dark', label: uiLanguage === 'fa' ? 'تیره' : 'Dark', icon: Moon }]} /></Field>
        </FieldGroup></CardContent></Card>
        <Card><CardHeader><CardTitle>{uiLanguage === 'fa' ? 'تبدیل به متن' : 'Transcription'}</CardTitle></CardHeader><CardContent className="flex flex-col gap-5"><FieldGroup><Field><FieldLabel htmlFor="quality">{uiLanguage === 'fa' ? 'دقت تبدیل' : 'Accuracy'}</FieldLabel><AppSelect id="quality" icon={Gauge} value={quality} disabled={busy} onValueChange={value => { setQuality(value); localStorage.setItem('ava-quality', value) }} className="w-full" options={[{ value: 'accurate', label: uiLanguage === 'fa' ? 'دقت بیشتر' : 'Higher accuracy', description: uiLanguage === 'fa' ? 'مدل بزرگ‌تر، پردازش کندتر' : 'Larger model, slower processing', icon: Sparkles }, { value: 'fast', label: uiLanguage === 'fa' ? 'سریع‌تر' : 'Faster', description: uiLanguage === 'fa' ? 'مدل سبک‌تر، پردازش سریع‌تر' : 'Smaller model, quicker processing', icon: Zap }]} /></Field></FieldGroup><FieldGroup><Field><FieldLabel htmlFor="processor">{t("Processor")}</FieldLabel><AppSelect id="processor" icon={Cpu} value={device} disabled={busy} onValueChange={value => { setDevice(value); localStorage.setItem('ava-device', value) }} className="w-full" options={[{ value: 'auto', label: uiLanguage === 'fa' ? 'خودکار' : 'Auto', description: gpu.available ? 'GPU · Vulkan' : t('CPU'), icon: ScanLine }, { value: 'gpu', label: t('GPU · Vulkan'), description: !gpu.available ? (uiLanguage === 'fa' ? 'در این دستگاه در دسترس نیست' : 'Unavailable on this device') : gpu.name, disabled: !gpu.available, icon: Zap }, { value: 'cpu', label: t('CPU'), icon: Cpu }]} /><FieldDescription>{t(gpu.name)}</FieldDescription></Field></FieldGroup></CardContent></Card>
        <Card><CardHeader><CardTitle>{uiLanguage === 'fa' ? 'ذخیرهٔ فایل‌ها' : 'File saving'}</CardTitle></CardHeader><CardContent><div className="save-folder"><label htmlFor="save-folder-path">{uiLanguage === 'fa' ? 'ذخیرهٔ خودکار TXT، SRT و VTT در:' : 'Automatically save TXT, SRT and VTT to:'}</label><input id="save-folder-path" className="save-folder-path" dir="ltr" readOnly value={saveFolder} title={saveFolder} /><Button variant="outline" onClick={changeFolder}><FolderCog aria-hidden="true" data-icon="inline-start" />{uiLanguage === 'fa' ? 'تغییر پوشه' : 'Change folder'}</Button><Button variant="ghost" onClick={() => revealFolder()}><FolderOpen aria-hidden="true" data-icon="inline-start" />{uiLanguage === 'fa' ? 'باز کردن پوشه' : 'Open folder'}</Button></div></CardContent></Card>
      </div> : view === 'history' ? <TranscriptionHistory full items={historyItems} locale={uiLanguage} onOpen={openHistory} onMore={hasMore ? loadMore : undefined} disabled={busy || saving} /> : <>

      <div className="workspace">
        <aside className="flex flex-col gap-5">
          <Card><CardHeader><CardTitle>{t("Your recording")}</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="file-well" data-tour="file"><FileAudio aria-hidden="true" /><p>{file ? file.name : t("Audio or video")}</p><span>{file ? `${(file.size / 1048576).toFixed(1)} MB` : t("MP3, M4A, MP4, WAV, OGG and more")}</span><Button variant="outline" onClick={choose} disabled={busy}><FolderOpen aria-hidden="true" data-icon="inline-start" />{file ? t("Change file") : t("Choose file")}</Button></div>
              <FieldGroup data-tour="language"><Field><FieldLabel htmlFor="language">{t("Spoken language")}</FieldLabel><AppSelect id="language" icon={Languages} value={language} onValueChange={setLanguage} disabled={busy} className="w-full" options={[{ value: 'fa', label: t('Persian · فارسی'), icon: Languages }, { value: 'auto', label: t('Detect automatically'), icon: ScanLine }, { value: 'en', label: t('English'), icon: Languages }, { value: 'ar', label: t('Arabic · العربية'), icon: Languages }]} /></Field></FieldGroup>

            </CardContent><CardFooter><Button className="w-full" size="lg" data-tour="start" onClick={start} disabled={!file || !ready || busy}><FileText aria-hidden="true" data-icon="inline-start" />{busy ? t("Transcribing…") : t("Transcribe recording")}</Button></CardFooter></Card>
        </aside>
        <Card className="transcript-card"><CardHeader><CardTitle>{t("Transcript")}</CardTitle>{segments.length ? <CardDescription>{uiLanguage === 'fa' ? 'متن را بررسی و ویرایش کنید، سپس خروجی بگیرید.' : 'Review and edit the text, then export.'}</CardDescription> : null}</CardHeader>
          <CardContent className="transcript-content">
            {busy ? <div className="working"><AudioLines className="working-icon" aria-hidden="true" /><h2>{t(progress.stage)}</h2><div className="job-timing"><span>{uiLanguage === 'fa' ? 'زمان سپری‌شده' : 'Elapsed'} <b dir="ltr" data-testid="elapsed">{formatDuration(clockNow - (startedAt ?? clockNow))}</b></span><span>{uiLanguage === 'fa' ? 'زمان باقی‌مانده (تقریبی)' : 'Estimated remaining'} <b dir="ltr" data-testid="remaining">{etaDeadline === null ? (uiLanguage === 'fa' ? 'در حال برآورد…' : 'Estimating…') : etaDeadline <= clockNow && progress.percent < 100 ? (uiLanguage === 'fa' ? 'در حال تکمیل…' : 'Finishing…') : formatDuration(Math.max(0, etaDeadline - clockNow))}</b></span></div><Progress value={progress.percent} className="w-full"><ProgressLabel>{t("Progress")}</ProgressLabel><ProgressValue /></Progress><Button variant="outline" onClick={() => window.transcriber.cancel().catch(e => setError(String(e)))}><CircleX aria-hidden="true" data-icon="inline-start" />{t("Cancel transcription")}</Button></div>
              : segments.length ? <div className="segment-list">{segments.map((s, i) => <div className="segment" key={`${s.start}-${i}`}><span className="timestamp">{time(s.start)}</span><Textarea aria-label={`${uiLanguage === 'fa' ? 'بخش' : 'Passage'} ${i + 1}`} dir={language === 'en' ? 'ltr' : 'auto'} lang={language === 'fa' ? 'fa' : undefined} value={s.text} onChange={e => { setDirty(true); setSegments(prev => prev.map((v, n) => n === i ? { ...v, text: e.target.value } : v)) }} /></div>)}</div>
              : <Empty className="h-full"><EmptyHeader><EmptyMedia variant="icon"><FileText /></EmptyMedia><EmptyTitle>{uiLanguage === 'fa' ? 'متنی برای نمایش نیست' : 'No transcript yet'}</EmptyTitle><EmptyDescription>{uiLanguage === 'fa' ? 'یک فایل انتخاب کنید و «تبدیل به متن» را بزنید.' : 'Choose a file and select Transcribe recording.'}</EmptyDescription></EmptyHeader></Empty>}
          </CardContent><CardFooter className="flex-wrap justify-between gap-3"><span className="text-sm text-muted-foreground">{startedAt !== null && !busy ? `${uiLanguage === 'fa' ? 'زمان پردازش' : 'Processing time'}: ${formatDuration(clockNow - startedAt)}` : segments.length ? `${text.split(/\s+/).filter(Boolean).length} ${uiLanguage === 'fa' ? 'واژه' : 'words'} · ${segments.length} ${uiLanguage === 'fa' ? 'بخش' : 'passages'}` : 'TXT · SRT · VTT'}</span><div className="flex flex-wrap gap-2">{historyId && dirty ? <Button disabled={saving || busy} onClick={() => saveEdits()}><Save aria-hidden="true" data-icon="inline-start" />{uiLanguage === 'fa' ? 'ذخیرهٔ تغییرات' : 'Save changes'}</Button> : null}<Button variant="ghost" disabled={!segments.length || busy} onClick={async () => { try { await window.transcriber.copy(text); setNotice(t("Text copied.")) } catch (e) { setError(String(e)) } }}><Copy aria-hidden="true" data-icon="inline-start" />{t("Copy")}</Button>{['txt','srt','vtt'].map(format => <Button variant="outline" key={format} disabled={!segments.length || busy} onClick={() => save(format)}><Download aria-hidden="true" data-icon="inline-start" />{format.toUpperCase()}</Button>)}</div></CardFooter></Card>
      </div>
      <TranscriptionHistory items={recent} locale={uiLanguage} onOpen={openHistory} disabled={busy || saving} />
      </>}
      <div className="statusbar" role="status" aria-live="polite">{notice ? <><Check aria-hidden="true" />{notice}</> : null}</div>
    </main>
  </div></DirectionProvider>
}
