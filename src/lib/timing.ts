export function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor(seconds / 60) % 60
  const s = seconds % 60
  return (h ? String(h).padStart(2, '0') + ':' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0')
}
export function estimateRemaining(elapsed: number, percent: number): number | null {
  if (!Number.isFinite(percent) || !Number.isFinite(elapsed) || percent <= 0 || percent > 100 || elapsed < 0) return null
  return elapsed * (100 - percent) / percent
}
