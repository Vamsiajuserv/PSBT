import React, { useEffect, useMemo, useState } from 'react'
import { CalendarDays, CheckCircle2, CalendarClock } from 'lucide-react'
import MasterScreen from '../../components/admin/MasterScreen.jsx'
import { Pill, fmtDate } from '../../components/admin/ui.jsx'
import { FestivalsAPI, PoojasAPI } from '../../api/client.js'
import { NumberField } from '../../components/common/Field.jsx'

export default function FestivalMaster() {
  const [poojaOptions, setPoojaOptions] = useState([])
  const [poojaAll, setPoojaAll] = useState([])   // full poojas incl. plans (for committee pricing)
  useEffect(() => {
    PoojasAPI.admin().then((r) => {
      const items = r.items || []
      setPoojaAll(items)
      setPoojaOptions(items.map((p) => ({ value: p.id, label: p.name })))
    }).catch(() => {})
  }, [])

  const config = useMemo(() => ({
    title: 'Festival Master', subtitle: 'Configure temple festivals and their associated poojas.',
    api: FestivalsAPI, entity: 'festival', addLabel: 'Add New Festival', searchPlaceholder: 'Search by name or code…',
    statCards: [
      { key: 'total', icon: CalendarDays, color: '#8a1c1c', bg: 'bg-maroon-50', title: 'Total Festivals', sub: 'All festivals' },
      { key: 'active', icon: CheckCircle2, color: '#059669', bg: 'bg-emerald-50', title: 'Active', sub: 'Currently active' },
      { key: 'upcoming', icon: CalendarClock, color: '#d97706', bg: 'bg-amber-50', title: 'Upcoming', sub: 'Yet to start' },
    ],
    columns: [
      { key: 'code', label: 'Festival ID', mono: true },
      { key: 'name', label: 'Festival Name', strong: true },
      { key: 'start_date', label: 'Start Date', render: (r) => fmtDate(r.start_date) },
      { key: 'end_date', label: 'End Date', render: (r) => fmtDate(r.end_date) },
      { key: 'poojas', label: 'Associated Poojas', render: (r) => (r.poojas?.length ? <div className="flex flex-wrap gap-1">{r.poojas.slice(0, 3).map((p) => <Pill key={p.id} tone="maroon">{p.name}</Pill>)}{r.poojas.length > 3 && <span className="text-[0.6875rem] text-gray-400">+{r.poojas.length - 3}</span>}</div> : '—') },
    ],
    fields: [
      { k: 'name', label: 'Festival Name', required: true },
      { k: 'start_date', label: 'Start Date', type: 'date', required: true },
      { k: 'end_date', label: 'End Date', type: 'date' },
      { k: 'pooja_ids', label: 'Associated Poojas', type: 'multiselect', options: poojaOptions },
      {
        k: 'plan_fees', label: 'Committee Prices (set once for this festival)', type: 'custom', default: {},
        render: (data, setD) => {
          const selected = poojaAll.filter((p) => (data.pooja_ids || []).includes(p.id))
          const rows = selected.flatMap((p) => (p.plans || []).filter((pl) => pl.committee_decided).map((pl) => ({ p, pl })))
          if (!rows.length) return <div className="text-[0.75rem] text-gray-400">Select the festival's poojas above — their committee-decided plans appear here for pricing.</div>
          return (
            <div className="space-y-2">
              {rows.map(({ p, pl }) => (
                <div key={pl.id} className="flex items-center gap-2">
                  <span className="flex-1 text-[0.8125rem] text-gray-700">{p.name} · {pl.plan_name}</span>
                  <NumberField min="0" step="1" prefix="₹" className="!py-1.5 w-32" placeholder="Amount"
                    value={(data.plan_fees || {})[String(pl.id)] ?? ''}
                    onChange={(e) => {
                      const nf = { ...(data.plan_fees || {}) }
                      if (e.target.value === '') delete nf[String(pl.id)]
                      else nf[String(pl.id)] = Number(e.target.value)
                      setD({ plan_fees: nf })
                    }} />
                </div>
              ))}
              <div className="text-[0.6875rem] text-gray-400">Bookings automatically use these committee prices — no manual entry at the counter.</div>
            </div>
          )
        },
      },
      { k: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'], default: 'Active' },
      { k: 'description', label: 'Description', type: 'textarea' },
    ],
  }), [poojaOptions, poojaAll])

  return <MasterScreen key={poojaOptions.length} config={config} />
}
