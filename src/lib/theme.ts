import { useSyncExternalStore } from 'react'
export type ThemePreference = 'system' | 'light' | 'dark'
const media = matchMedia('(prefers-color-scheme: dark)')
function readPreference(): ThemePreference {
  const value = localStorage.getItem('ava-theme')
  return value === 'dark' || value === 'light' ? value : 'system'
}
let preference = readPreference()
const listeners = new Set<() => void>()
function apply() {
  const resolved = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference
  document.documentElement.classList.toggle('dark', resolved === 'dark')
  document.documentElement.style.colorScheme = resolved
  document.documentElement.dataset.theme = resolved
}
function update() { apply(); listeners.forEach(listener => listener()) }
media.addEventListener('change', update)
window.addEventListener('storage', event => { if (event.key === 'ava-theme' || event.key === null) { preference = readPreference(); update() } })
apply()
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
export function setThemePreference(value: string) {
  preference = value === 'dark' || value === 'light' ? value : 'system'
  localStorage.setItem('ava-theme', preference)
  update()
}
export function useThemePreference() {
  return useSyncExternalStore(subscribe, () => preference)
}
