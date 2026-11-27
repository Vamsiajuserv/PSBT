// The devotee's running Monthly / N-Day / Yearly / Life Long plans (GET /bookings/active-plans), so the
// pooja pickers tag each pooja they already hold (client, 2026-11-26): with several poojas ticked, the
// blocked one stands out. Only a note — the server's duplicate rules decide.
import { useEffect, useState } from 'react'
import { BookingsAPI } from '../api/client.js'
import { tr } from '../i18n/LanguageContext.jsx'

export function useActivePlans(devoteeId, mobile) {
  const [items, setItems] = useState([])
  useEffect(() => {
    if (!devoteeId && !mobile) { setItems([]); return undefined }
    let cancelled = false
    BookingsAPI.activePlans({ devotee_id: devoteeId || undefined, mobile: mobile || undefined })
      .then((r) => { if (!cancelled) setItems(r.items || []) })
      .catch(() => { if (!cancelled) setItems([]) })
    return () => { cancelled = true }
  }, [devoteeId, mobile])
  return items
}

// "Active Monthly · till 25 Dec 2026" (several plans of one pooja are joined) — '' when none.
export function activeTag(items, poojaId, fmt) {
  return items.filter((p) => String(p.pooja_id) === String(poojaId))
    .map((p) => p.valid_until
      ? tr('Active {plan} · till {date}').replace('{plan}', tr(p.plan_name || '')).replace('{date}', fmt(p.valid_until))
      : tr('Active {plan}').replace('{plan}', tr(p.plan_name || '')))
    .join(' · ')
}
