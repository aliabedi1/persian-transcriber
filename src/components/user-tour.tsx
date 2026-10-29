import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'

const steps = [
  {
    en: ['Welcome to Ava', 'This is your home dashboard. Start transcription opens the recording workspace. You can also reopen recent transcripts, view history or change your settings here.'],
    fa: ['به آوا خوش آمدید', 'این صفحهٔ خانهٔ شماست. با «شروع تبدیل به متن» وارد فضای تبدیل شوید. از همین‌جا می‌توانید متن‌های اخیر، سوابق و تنظیمات را هم باز کنید.'],
  },
  {
    en: ['Choose a recording', 'Select Choose file to open an audio or video recording from your computer. MP3, M4A, MP4 and WAV are supported.'],
    fa: ['یک فایل انتخاب کنید', 'با «انتخاب فایل»، یک فایل صوتی یا ویدیویی از رایانه باز کنید. قالب‌های MP3، M4A، MP4 و WAV پشتیبانی می‌شوند.'],
  },
  {
    en: ['Set the spoken language', 'Choose the language spoken in your recording, or select Detect automatically if you are unsure. This is separate from the app’s interface language.'],
    fa: ['زبان گفتار را مشخص کنید', 'زبان صحبت‌شده در فایل را انتخاب کنید. اگر مطمئن نیستید، «تشخیص خودکار» را بزنید. این گزینه با زبان برنامه متفاوت است.'],
  },
  {
    en: ['Turn speech into text', 'Select Transcribe recording. You can follow the progress and estimated time, or cancel while it runs. After the local engine is set up, transcription works offline.'],
    fa: ['گفتار را به متن تبدیل کنید', '«تبدیل به متن» را بزنید. پیشرفت و زمان تقریبی نمایش داده می‌شود و می‌توانید تبدیل را لغو کنید. پس از آماده‌سازی موتور محلی، تبدیل بدون اینترنت انجام می‌شود.'],
  },
  {
    en: ['Review and keep your transcript', 'Edit the transcript, then select Save changes. Use Copy or export TXT for text and SRT or VTT for subtitles. Results are saved in history so you can reopen them later.'],
    fa: ['متن را بررسی و نگهداری کنید', 'متن را ویرایش کنید و «ذخیرهٔ تغییرات» را بزنید. با «کپی» متن را بردارید یا خروجی TXT برای متن و SRT یا VTT برای زیرنویس بگیرید. نتیجه در سوابق می‌ماند و بعداً قابل باز کردن است.'],
  },
  {
    en: ['Make Ava yours', 'Settings lets you change the interface language, appearance, downloaded model, processor and automatic save folder. Use Back to return to your recording. You can replay this tour from User guide anytime.'],
    fa: ['آوا را تنظیم کنید', 'در تنظیمات، زبان برنامه، ظاهر، مدل دانلودشده، پردازنده و پوشهٔ ذخیرهٔ خودکار را تغییر دهید. با «بازگشت» به فایل خود برگردید. «راهنمای استفاده» این راهنما را دوباره باز می‌کند.'],
  },
] as const

export function UserTour({ step, locale, onStep, onClose }: {
  step: number
  locale: string
  onStep: (step: number) => void
  onClose: () => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  const fa = locale === 'fa'
  const [title, description] = steps[step][fa ? 'fa' : 'en']

  useEffect(() => { heading.current?.focus() }, [step])
  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose()
    }
    window.addEventListener('keydown', dismiss)
    return () => window.removeEventListener('keydown', dismiss)
  }, [onClose])

  return <section className="user-tour" aria-label={fa ? 'راهنمای استفاده' : 'User guide'}>
    <div className="tour-heading">
      <h2 ref={heading} tabIndex={-1}>{title}</h2>
      <span>{fa ? `مرحلهٔ ${step + 1} از ${steps.length}` : `Step ${step + 1} of ${steps.length}`}</span>
    </div>
    <p>{description}</p>
    <div className="tour-actions">
      <Button variant="ghost" onClick={onClose}>{fa ? 'رد کردن راهنما' : 'Skip tour'}</Button>
      <div className="flex gap-2">
        {step > 0 ? <Button variant="outline" onClick={() => onStep(step - 1)}>{fa ? 'قبلی' : 'Previous'}</Button> : null}
        <Button onClick={() => step === steps.length - 1 ? onClose() : onStep(step + 1)}>{step === steps.length - 1 ? (fa ? 'پایان راهنما' : 'Finish tour') : (fa ? 'بعدی' : 'Next')}</Button>
      </div>
    </div>
  </section>
}
