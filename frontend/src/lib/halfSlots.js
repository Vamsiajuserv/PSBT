// Half-hour pooja lists ("06:30" = 6:30–7:00 AM, the 24-hour start). Each booking is on one
// list (booking.batch_slot) — see backend/app/pooja_batches.py for the assignment rule.
import { tr, clock12 } from '../i18n/LanguageContext.jsx'
import { slotBounds, isRange } from './slots.js'

export const HALF = 30
export const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
export const nowMinutesIST = () => {
  const [h, m] = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour12: false }).split(':').map(Number)
  return h * 60 + m
}
export const toMin = (start) => { const [h, m] = String(start).split(':').map(Number); return h * 60 + m }
/** 390 → "6:30 AM" */
const clock = (mins) => { const h = Math.floor(mins / 60) % 24; return `${h % 12 || 12}:${String(mins % 60).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}` }
/** "06:30" → "6:30 AM – 7:00 AM" (Telugu: "ఉదయం 6:30 – 7:00"); none → "Any time". */
export const halfLabel = (start) => (start ? clock12(`${clock(toMin(start))} – ${clock(toMin(start) + HALF)}`) : tr('Any time'))
/** "09:30" → "9:30 – 10:00" (a compact chip; Morning / Evening is shown beside it). */
export const halfRange = (start) => {
  const c = (m) => `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, '0')}`
  return `${c(toMin(start))} – ${c(toMin(start) + HALF)}`
}
/** "20:40" (a sent-at clock) → "8:40 PM" */
export const clockOf = (hhmm) => (hhmm ? clock12(clock(toMin(hhmm))) : '')
/** Morning (before noon) / Afternoon (noon – 4 PM) / Evening, for grouping half-hours. */
export const PERIODS = ['Morning', 'Afternoon', 'Evening']
export const halfPeriod = (start) => (toMin(start) < 12 * 60 ? 'Morning' : toMin(start) < 16 * 60 ? 'Afternoon' : 'Evening')
/** Is this half-hour of `day` already over (IST)? */
export const halfIsOver = (start, day) => day < todayIST() || (day === todayIST() && toMin(start) + HALF <= nowMinutesIST())
/** Is "now" inside this half-hour? */
export const halfIsNow = (start, day) => day === todayIST() && toMin(start) <= nowMinutesIST() && nowMinutesIST() < toMin(start) + HALF

// A fixed pooja time closes only by the clock (client, 2026-11-20 — "Print & Send" was removed).
/** "10:45 AM" → "10:30" (the half-hour list it is on); null for a window / no time. */
export const halfOfFixed = (slot) => {
  const b = slotBounds(slot)
  if (!b || isRange(slot)) return null
  const m = Math.floor(b[0] / HALF) * HALF
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
