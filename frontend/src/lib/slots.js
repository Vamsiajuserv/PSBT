// Pooja time slots — fixed per plan in the Pooja Master ("08:15 AM" or
// "09:00 AM - 11:30 AM"), or the Settings list for plans without fixed timings.
// Same rules as the server (helpers.slot_is_over / bookings._check_date_and_slot).

export const TEMPLE_HOURS = '06:00 AM - 09:00 PM'

export const NOTE_FIXED_TIMINGS = 'Pooja timings are fixed and cannot be changed. The Pooja will be performed in the name of the concerned person, even if they are unable to attend in person.'
export const NOTE_VEHICLE = 'All vehicle Poojas are performed based on the availability and schedule of the Poojari.'

export const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const nowISTMinutes = () => {
  const [h, m] = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).split(':').map(Number)
  return h * 60 + m
}

const toMinutes = (h, m, ap) => (Number(h) % 12 + (ap.toUpperCase() === 'PM' ? 12 : 0)) * 60 + Number(m)

// [startMinutes, endMinutes]; a fixed time has start === end. null if malformed.
export function slotBounds(slot) {
  const s = String(slot || '').trim()
  let m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(s)
  if (m) { const t = toMinutes(m[1], m[2], m[3]); return [t, t] }
  m = /^(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(s)
  if (!m) return null
  const a = toMinutes(m[1], m[2], m[3]), b = toMinutes(m[4], m[5], m[6])
  return b > a ? [a, b] : null
}

const pad = (n) => String(n).padStart(2, '0')
const fmt = (mins) => { const h = Math.floor(mins / 60), ap = h >= 12 ? 'PM' : 'AM'; return `${pad(h % 12 || 12)}:${pad(mins % 60)} ${ap}` }

// Canonical spelling: "8:15 am" → "08:15 AM"; null if invalid.
export function normalizeSlot(slot) {
  const b = slotBounds(slot)
  if (!b) return null
  return b[0] === b[1] ? fmt(b[0]) : `${fmt(b[0])} - ${fmt(b[1])}`
}

// "HH:MM" from an <input type="time"> → "08:15 AM"
export const fromTimeInput = (v) => {
  const m = /^(\d{2}):(\d{2})$/.exec(v || '')
  return m ? fmt(Number(m[1]) * 60 + Number(m[2])) : ''
}

export const sortSlots = (list) => [...list].sort((a, b) => (slotBounds(a)?.[0] ?? 0) - (slotBounds(b)?.[0] ?? 0))

export const isRange = (slot) => { const b = slotBounds(slot); return !!b && b[0] !== b[1] }
export const isTempleHours = (slot) => normalizeSlot(slot) === TEMPLE_HOURS

// Morning = starts before 12 PM
export const slotPeriod = (slot) => ((slotBounds(slot)?.[0] ?? 0) < 12 * 60 ? 'Morning' : 'Evening')

// Today's slot has gone by: a fixed time once it has started, a range at its end.
export function slotIsOver(slot, date) {
  if (date !== todayIST()) return false
  const b = slotBounds(slot)
  if (!b) return false
  const now = nowISTMinutes()
  return b[0] === b[1] ? now > b[1] : now >= b[1]
}

export const planSlots = (plan) => (Array.isArray(plan?.time_slots) ? plan.time_slots : [])
