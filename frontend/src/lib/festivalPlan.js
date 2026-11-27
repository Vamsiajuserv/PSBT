// A festival plan joined mid-festival (client, 2026-11-26): full plan fee, valid from the booked day to
// the festival's last day. These say so before booking and on the printed ticket.
import { tr } from '../i18n/LanguageContext.jsx'
import { planValidUntil } from './planTerms.js'

const dayCount = (fromISO, toISO) =>
  Math.round((new Date(`${toISO}T00:00:00`) - new Date(`${fromISO}T00:00:00`)) / 86400000) + 1

// Before booking: "Only 14 days left in Karthika Masam — valid 26 Nov – 09 Dec (14 poojas) at the full plan fee."
// Empty when the plan fits inside the festival (nothing is cut short).
export function festDaysLeftMsg(plan, fromISO, fest, fmt, festName) {
  if (!plan || !fromISO || !fest?.end_date) return ''
  const end = planValidUntil(plan, fromISO)
  if (!end || end <= fest.end_date) return ''
  const n = String(dayCount(fromISO, fest.end_date))
  return tr('Only {n} days left in {fest} — valid {from} – {to} ({n} poojas) at the full plan fee.')
    .replace(/\{n\}/g, n).replace('{fest}', festName || fest.name || '').replace('{from}', fmt(fromISO)).replace('{to}', fmt(fest.end_date))
}

// On the ticket of a booked festival plan: "14 days only — valid till 09 Dec 2026, when the festival ends."
export function festTicketNote(b, fmt) {
  if (!b?.festival_id || !b.scheduled_date || !b.valid_until) return ''
  const from = String(b.scheduled_date).slice(0, 10), to = String(b.valid_until).slice(0, 10)
  const n = dayCount(from, to)
  if (n < 2) return ''
  return tr('{n} days only — valid till {date}, when the festival ends.').replace('{n}', String(n)).replace('{date}', fmt(to))
}
