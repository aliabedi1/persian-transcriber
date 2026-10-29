import { Download, Check, CircleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Progress, ProgressLabel, ProgressValue } from '@/components/ui/progress'

export type ModelList = { selectedId: string | null; models: {
  id: string; name: string; description: string; descriptionFa?: string; size: number;
  status: 'missing' | 'downloading' | 'ready' | 'error'; percent: number; error?: string;
}[] }

export function ModelsSettings({ data, locale, onDownload, onSelect }: {
  data: ModelList | null; locale: string; onDownload: (id: string) => void; onSelect: (id: string) => void;
}) {
  const fa = locale === 'fa'
  return <Card id="models-settings"><CardHeader><CardTitle role="heading" aria-level={2}>{fa ? 'مدل‌ها' : 'Models'}</CardTitle><CardDescription>{fa ? 'برای تبدیل، یک مدل دانلود و انتخاب کنید. پس از دانلود، بدون اینترنت کار می‌کند. تغییر مدل روی تبدیل بعدی اعمال می‌شود.' : 'Download and select a model to transcribe. Downloaded models work offline. A selection change applies to the next transcription.'}</CardDescription></CardHeader>
    <CardContent className="flex flex-col gap-5">
      {!data ? <p role="status">{fa ? 'در حال بررسی مدل‌ها…' : 'Checking models…'}</p> : data.models.map(model => <section key={model.id} aria-label={model.name} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3"><h3>{model.name}</h3><Badge variant={model.status === 'ready' ? 'default' : 'secondary'}>{model.status === 'ready' ? (fa ? 'آماده' : 'Downloaded') : model.status === 'downloading' ? (fa ? 'در حال دانلود' : 'Downloading') : model.status === 'error' ? (fa ? 'دانلود ناموفق' : 'Download failed') : (fa ? 'دانلود نشده' : 'Not downloaded')}</Badge></div>
        <p className="text-sm text-muted-foreground">{fa ? model.descriptionFa || model.description : model.description}</p>
        <p className="text-sm text-muted-foreground">{(model.size / 1048576).toFixed(1)} MB · {fa ? 'حجم دانلود همراه با تشخیص گفتار؛ فایل مشترک دوباره دانلود نمی‌شود.' : 'Download including speech detection; shared files are downloaded once.'}</p>
        {model.status === 'downloading' ? <Progress value={model.percent}><ProgressLabel>{fa ? 'دانلود و بررسی فایل‌ها' : 'Downloading and verifying'}</ProgressLabel><ProgressValue /></Progress> : null}
        {model.error ? <Alert variant="destructive"><CircleAlert /><AlertTitle>{fa ? 'دانلود کامل نشد' : 'Download did not finish'}</AlertTitle><AlertDescription><p>{fa ? 'اتصال اینترنت و فضای دیسک را بررسی کنید و دوباره تلاش کنید.' : 'Check your connection and free disk space, then retry.'}</p><p dir="auto" className="error-detail">{model.error}</p></AlertDescription></Alert> : null}
        <div>{model.status === 'ready' ? <Button variant={data.selectedId === model.id ? 'secondary' : 'outline'} disabled={data.selectedId === model.id} onClick={() => onSelect(model.id)}>{data.selectedId === model.id ? <Check data-icon="inline-start" /> : null}{data.selectedId === model.id ? (fa ? 'انتخاب شده' : 'Selected') : (fa ? 'استفاده از مدل' : 'Use model')}</Button> : <Button variant="outline" disabled={model.status === 'downloading'} onClick={() => onDownload(model.id)}><Download data-icon="inline-start" />{model.status === 'downloading' ? (fa ? 'در حال دانلود…' : 'Downloading…') : model.status === 'error' ? (fa ? 'تلاش دوباره' : 'Retry download') : (fa ? 'دانلود مدل' : 'Download model')}</Button>}</div>
      </section>)}
      <p className="text-sm text-muted-foreground">{fa ? 'دانلود قطع‌شده یا فایل نامعتبر قابل استفاده نیست. برای بازیابی، دوباره «دانلود مدل» را بزنید؛ فایل‌های تأییدشده نگه داشته می‌شوند.' : 'Interrupted or invalid downloads cannot be used. Download again to recover; verified files are kept.'}</p>
    </CardContent></Card>
}
