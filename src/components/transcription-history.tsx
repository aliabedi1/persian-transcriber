import { FileText, History, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'

export type HistorySummary = {
  id: string; createdAt: string; name: string; language: string; preview: string;
  passageCount: number; folder: string | null; saveError: string | null
}
type Props = {
  items: HistorySummary[]; locale: string; full?: boolean; disabled?: boolean;
  onOpen: (id: string) => void; onShowAll?: () => void; onMore?: () => void
}
export function TranscriptionHistory({ items, locale, full, disabled, onOpen, onShowAll, onMore }: Props) {
  const fa = locale === 'fa'
  const groups = new Map<string, HistorySummary[]>()
  for (const item of items) {
    const date = new Date(item.createdAt)
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
    groups.set(key, [...(groups.get(key) || []), item])
  }
  const row = (item: HistorySummary) => <Button variant="ghost" className="history-row" key={item.id} disabled={disabled} onClick={() => onOpen(item.id)}>
    <FileText aria-hidden="true" data-icon="inline-start" />
    <span className="history-row-copy"><b dir="auto">{item.name}</b><span className="history-preview" dir="auto">{item.preview || (fa ? 'گفتاری تشخیص داده نشد' : 'No speech detected')}</span></span>
    <span className="history-meta">{new Intl.DateTimeFormat(fa ? 'fa-IR' : 'en', { ...(full ? {} : { month: 'short', day: 'numeric' }), hour: '2-digit', minute: '2-digit' }).format(new Date(item.createdAt))}{item.saveError ? <span>{fa ? 'خطا در ذخیرهٔ فایل' : 'File save failed'}</span> : null}</span>
  </Button>
  return <Card className="history-card">
    <CardHeader className="history-heading"><CardTitle>{full ? (fa ? 'سوابق تبدیل' : 'Transcription history') : (fa ? 'تبدیل‌های اخیر' : 'Recent transcriptions')}</CardTitle>{onShowAll ? <Button variant="outline" onClick={onShowAll} disabled={disabled}><History aria-hidden="true" data-icon="inline-start" />{fa ? 'همهٔ سوابق' : 'All history'}</Button> : null}</CardHeader>
    <CardContent>{items.length ? full ? [...groups].map(([key, values]) => <section className="history-day" key={key}><h2>{new Intl.DateTimeFormat(fa ? 'fa-IR' : 'en', { dateStyle: 'full' }).format(new Date(values[0].createdAt))}</h2>{values.map(row)}</section>) : items.map(row) : <Empty><EmptyHeader><EmptyTitle>{fa ? 'هنوز تبدیلی ذخیره نشده است' : 'No saved transcriptions yet'}</EmptyTitle></EmptyHeader></Empty>}</CardContent>
    {onMore ? <CardFooter><Button variant="outline" onClick={onMore}><ChevronDown aria-hidden="true" data-icon="inline-start" />{fa ? 'نمایش بیشتر' : 'Load more'}</Button></CardFooter> : null}
  </Card>
}
