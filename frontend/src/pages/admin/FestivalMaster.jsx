import React, { useEffect, useMemo, useState } from 'react'
import { CalendarDays, CheckCircle2, CalendarClock } from 'lucide-react'
import MasterScreen from '../../components/admin/MasterScreen.jsx'
import { Pill, fmtDate } from '../../components/admin/ui.jsx'
import { FestivalsAPI, PoojasAPI } from '../../api/client.js'

export default function FestivalMaster() {
  const [poojaOptions, setPoojaOptions] = useState([])
  useEffect(() => { PoojasAPI.admin().then((r) => setPoojaOptions((r.items || []).map((p) => ({ value: p.id, label: p.name })))).catch(() => {}) }, [])

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
      { key: 'poojas', label: 'Associated Poojas', render: (r) => (r.poojas?.length ? <div className="flex flex-wrap gap-1">{r.poojas.slice(0, 3).map((p) => <Pill key={p.id} tone="maroon">{p.name}</Pill>)}{r.poojas.length > 3 && <span className="text-[11px] text-gray-400">+{r.poojas.length - 3}</span>}</div> : '—') },
    ],
    fields: [
      { k: 'name', label: 'Festival Name', required: true },
      { k: 'start_date', label: 'Start Date', type: 'date', required: true },
      { k: 'end_date', label: 'End Date', type: 'date' },
      { k: 'pooja_ids', label: 'Associated Poojas', type: 'multiselect', options: poojaOptions },
      { k: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'], default: 'Active' },
      { k: 'description', label: 'Description', type: 'textarea' },
    ],
  }), [poojaOptions])

  return <MasterScreen key={poojaOptions.length} config={config} />
}
