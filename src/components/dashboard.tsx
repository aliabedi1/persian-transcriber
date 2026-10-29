import { AudioLines, ArrowRight, CircleHelp, FolderOpen, History, Settings, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { TranscriptionHistory, type HistorySummary } from './transcription-history'

type Props = {
  locale: string
  ready: boolean | null
  busy: boolean
  saving: boolean
  fileName?: string
  saveFolder: string
  recent: HistorySummary[]
  onStart: () => void
  onHistory: () => void
  onSettings: () => void
  onGuide: () => void
  onOpenFolder: () => void
  onOpen: (id: string) => void
}

export function Dashboard({ locale, ready, busy, saving, fileName, saveFolder, recent, onStart, onHistory, onSettings, onGuide, onOpenFolder, onOpen }: Props) {
  const fa = locale === 'fa'
  return <div className="dashboard">
    <div className="dashboard-start">
      <Card className="dashboard-welcome">
        <CardHeader>
          <AudioLines className="dashboard-mark" aria-hidden="true" />
          <CardTitle role="heading" aria-level={2}>{fa ? 'از صدا به متن، با آوا' : 'From recording to words, with Ava'}</CardTitle>
          <CardDescription>{fa ? 'فایل صوتی یا ویدیویی خود را به متن قابل ویرایش و زیرنویس تبدیل کنید. همهٔ پردازش‌ها روی رایانهٔ شما انجام می‌شود.' : 'Turn your audio or video into editable text and subtitles. All processing happens on your computer.'}</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="dashboard-workflow">
            <li>{fa ? 'انتخاب فایل' : 'Choose a file'}</li>
            <li>{fa ? 'تبدیل گفتار به متن' : 'Transcribe speech'}</li>
            <li>{fa ? 'ویرایش و خروجی گرفتن' : 'Review and export'}</li>
          </ol>
          {fileName ? <p className="dashboard-current" dir="auto">{fa ? 'فایل باز: ' : 'Open recording: '}{fileName}</p> : null}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-3">
          <Button size="lg" data-tour="dashboard-start" onClick={onStart}><AudioLines aria-hidden="true" data-icon="inline-start" />{busy ? (fa ? 'نمایش پیشرفت تبدیل' : 'View transcription progress') : fileName ? (fa ? 'ادامهٔ کار روی فایل' : 'Continue recording') : (fa ? 'شروع تبدیل به متن' : 'Start transcription')}<ArrowRight aria-hidden="true" data-icon="inline-end" /></Button>
          <Button variant="outline" disabled={busy || saving} onClick={onHistory}><History aria-hidden="true" data-icon="inline-start" />{fa ? 'مشاهدهٔ سوابق' : 'View history'}</Button>
        </CardFooter>
      </Card>
      <section className="dashboard-details" aria-labelledby="workspace-details-title">
        <h2 id="workspace-details-title">{fa ? 'فضای کار شما' : 'Your workspace'}</h2>
        <dl>
          <div><dt>{fa ? 'موتور تبدیل' : 'Transcription engine'}</dt><dd role="status"><Badge variant={ready === false ? 'destructive' : 'secondary'}>{busy ? (fa ? 'در حال تبدیل' : 'Transcribing') : ready === null ? (fa ? 'در حال بررسی…' : 'Checking…') : ready ? (fa ? 'آمادهٔ کار' : 'Ready to transcribe') : (fa ? 'نیاز به آماده‌سازی' : 'Setup needed')}</Badge></dd></div>
          <div><dt>{fa ? 'قالب‌های خروجی' : 'Export formats'}</dt><dd>TXT · SRT · VTT</dd></div>
          <div><dt>{fa ? 'پوشهٔ ذخیرهٔ خودکار' : 'Automatic save folder'}</dt><dd className="dashboard-folder" dir="ltr">{saveFolder || (fa ? 'در حال بارگذاری…' : 'Loading…')}</dd></div>
        </dl>
        <p className="dashboard-privacy"><ShieldCheck aria-hidden="true" />{fa ? 'فایل‌ها روی رایانهٔ شما می‌مانند.' : 'Your files stay on your computer.'}</p>
        <Button variant="outline" disabled={!saveFolder} onClick={onOpenFolder}><FolderOpen aria-hidden="true" data-icon="inline-start" />{fa ? 'باز کردن پوشهٔ خروجی' : 'Open output folder'}</Button>
      </section>
    </div>
    <nav className="dashboard-shortcuts" aria-label={fa ? 'دسترسی سریع' : 'Quick access'}>
      <p>{fa ? 'برای شروع به کمک نیاز دارید؟' : 'Need a hand getting started?'}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={onGuide}><CircleHelp aria-hidden="true" data-icon="inline-start" />{fa ? 'نمایش راهنما' : 'Take a quick tour'}</Button>
        <Button variant="ghost" onClick={onSettings}><Settings aria-hidden="true" data-icon="inline-start" />{fa ? 'تنظیم فضای کار' : 'Workspace settings'}</Button>
      </div>
    </nav>
    <TranscriptionHistory items={recent} locale={locale} onOpen={onOpen} disabled={busy || saving} onShowAll={onHistory} />
  </div>
}
