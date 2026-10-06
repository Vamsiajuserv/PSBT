// Mirrors the server's plan_terms() (backend/app/helpers.py) so the validity shown
// on screen always matches the dates printed on the ticket.

export const addDaysISO = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + n)
  return d.toLocaleDateString('en-CA')
}

// Last valid date (YYYY-MM-DD) of a plan booked from `startISO`, or null for lifetime plans.
export function planValidUntil(plan, startISO) {
  const name = (plan?.plan_name || '').trim().toLowerCase()
  const vtype = (plan?.validity_type || '').trim().toLowerCase()
  const vval = Number(plan?.validity_value) || 1
  const dur = Number(plan?.duration_days) || 0
  if (name.includes('life') || vtype.includes('life')) return null
  if (vtype.includes('year') || name.includes('yearly')) return addDaysISO(startISO, 365 * vval)
  if (vtype.includes('month') || name.includes('month')) return addDaysISO(startISO, (dur || 30) - 1)
  if (dur > 1) return addDaysISO(startISO, dur - 1)
  if (vtype.includes('day') && vval > 1) return addDaysISO(startISO, vval - 1)
  return startISO
}

// How long a plan lasts, for plan lists: { lifetime } | { years } | { days }
export function planSpan(plan) {
  const name = (plan?.plan_name || '').trim().toLowerCase()
  const vtype = (plan?.validity_type || '').trim().toLowerCase()
  if (name.includes('life') || vtype.includes('life')) return { lifetime: true }
  if (vtype.includes('year') || name.includes('yearly')) return { years: Number(plan?.validity_value) || 1 }
  const ref = '2000-01-01'
  const end = planValidUntil(plan, ref)
  return { days: Math.round((new Date(`${end}T00:00:00`) - new Date(`${ref}T00:00:00`)) / 86400000) + 1 }
}
