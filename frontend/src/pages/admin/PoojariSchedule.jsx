import React, { useEffect, useState, useCallback } from 'react'
import {
  Plus, Pencil, X, Save, RotateCcw, Search, Clock, Info, CalendarDays, List,
  CalendarCheck, UserCheck, CalendarClock, UserX, ArrowUp, ArrowDown, ChevronsUpDown,
} from 'lucide-react'
import { PageTitle, Pill, num } from '../../components/admin/ui.jsx'
import { toast } from '../../components/common/Dialog.jsx'
import { useSortableTable, SortPanel } from '../../components/common/SortableTable.jsx'
import { SchedulesAPI, PoojasAPI, PoojarisAPI } from '../../api/client.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { Select, DateField, MultiSelect } from '../../components/common/Field.jsx'
import { T, tr, clock12, personName, useLang } from '../../i18n/LanguageContext.jsx'

const PLAN_TONE = { Daily: 'blue', Monthly: 'green', 'Life Long': 'amber', 'One-Time': 'violet' }
const STATUS_TONE = { Scheduled: 'green', 'In Progress': 'blue', Completed: 'gray', Cancelled: 'red' }
const planTone = (n) => PLAN_TONE[n] || (/\d+-Day/.test(n || '') ? 'violet' : 'gray')
const fmtDate = (s) => (s ? new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  .replace(/[A-Za-z]{3,}/g, (w) => tr(w)) : '—')
const weekday = (s) => (s ? tr(new Date(s).toLocaleDateString('en-US', { weekday: 'short' })) : '')

function StatTile({ icon: Icon, color, bg, title, value, sub }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-3">
        <div className={`w-11 h-11 rounded-full grid place-items-center shrink-0 ${bg}`} style={{ color }}><Icon size={20} /></div>
        <div><div className="text-[0.6875rem] uppercase tracking-wide text-gray-400 font-semibold">{title}</div>
          <div className="text-2xl font-extrabold text-gray-800 leading-none mt-0.5">{value}</div></div>
      </div>
      <div className="text-[0.75rem] text-gray-400 mt-3">{sub}</div>
    </div>
  )
}

const emptyForm = () => ({ pooja_ids: [], plan_id: '', poojari_id: '', schedule_type: 'One-Time', schedule_date: new Date().toISOString().slice(0, 10), start_time: '07:30 AM', end_time: '08:30 AM', notes: '', status: 'Scheduled' })

// Sortable columns configuration
const SORT_COLUMNS = [
  { key: 'schedule_date', label: 'Schedule Date', type: 'date' },
  { key: 'poojari_name', label: 'Poojari Name', type: 'text' },
  { key: 'pooja_name', label: 'Pooja Name', type: 'text' },
  { key: 'status', label: 'Status', type: 'text' },
]

export default function PoojariSchedule() {
  const { lang } = useLang()
  const { user } = useAuth()
  const canWrite = user?.role !== 'Accountant'
  const [tab, setTab] = useState('list')
  const [stats, setStats] = useState(null)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [poojas, setPoojas] = useState([])
  const [poojaris, setPoojaris] = useState([])
  const [q, setQ] = useState(''); const [pooja, setPooja] = useState(''); const [poojari, setPoojari] = useState('')
  const [status, setStatus] = useState(''); const [start, setStart] = useState(''); const [end, setEnd] = useState('')
  const [page, setPage] = useState(1)
  const [applied, setApplied] = useState({})
  const [drawer, setDrawer] = useState(null)
  const SIZE = 8

  // Sorting
  const { sortedRows, sorts, handleColumnClick, removeSort, clearSorts, getSortIndex, getSortDirection } = useSortableTable(rows, SORT_COLUMNS, [{ key: 'schedule_date', direction: 'desc' }])

  const loadStats = useCallback(() => SchedulesAPI.stats().then(setStats).catch(() => toast('Failed to load schedule stats', 'error')), [])
  const loadList = useCallback(async (f, pg) => {
    const d = await SchedulesAPI.list({ ...f, page: pg, size: SIZE })
    setRows(d.items); setTotal(d.total)
  }, [])
  useEffect(() => {
    loadStats()
    PoojasAPI.admin().then((d) => setPoojas(d.items)).catch(() => toast('Failed to load poojas', 'error'))
    PoojarisAPI.list().then(setPoojaris).catch(() => toast('Failed to load poojaris', 'error'))
  }, [loadStats])
  useEffect(() => { loadList(applied, page) }, [applied, page, loadList])

  const search = () => { setPage(1); setApplied({ q, pooja, poojari, status, start, end }) }
  const clear = () => { setQ(''); setPooja(''); setPoojari(''); setStatus(''); setStart(''); setEnd(''); setPage(1); setApplied({}) }
  const pageCount = Math.max(1, Math.ceil(total / SIZE))

  const [saveErr, setSaveErr] = useState('')

  async function save(e) {
    e.preventDefault()
    setSaveErr('')
    const d = drawer.data
    const poojaIds = d.pooja_ids || []

    // DEF-002: Validate that the selected time slot has not expired for today's date
    const today = new Date().toISOString().slice(0, 10)
    if (d.schedule_date === today && d.start_time) {
      // Parse the start time (e.g., "07:30 AM")
      const timeMatch = d.start_time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
      if (timeMatch) {
        let hours = parseInt(timeMatch[1], 10)
        const minutes = parseInt(timeMatch[2], 10)
        const period = timeMatch[3].toUpperCase()
        if (period === 'PM' && hours !== 12) hours += 12
        if (period === 'AM' && hours === 12) hours = 0
        const slotTime = new Date()
        slotTime.setHours(hours, minutes, 0, 0)
        if (slotTime < new Date()) {
          setSaveErr(tr('Cannot assign to an expired time slot. Please select a future time slot or date.'))
          return
        }
      }
    }

    // Create a schedule for each selected pooja
    for (const poojaId of poojaIds) {
      const pooja = poojas.find((p) => String(p.id) === String(poojaId))
      // Use selected plan if single pooja, otherwise use first plan of each pooja
      const planId = poojaIds.length === 1 && d.plan_id
        ? Number(d.plan_id)
        : (pooja?.plans?.[0]?.id || null)

      await SchedulesAPI.create({
        pooja_id: Number(poojaId),
        plan_id: planId,
        poojari_id: d.poojari_id ? Number(d.poojari_id) : null,
        schedule_type: d.schedule_type,
        schedule_date: d.schedule_date || null,
        start_time: d.start_time,
        end_time: d.end_time,
        notes: d.notes,
      })
    }
    setDrawer(null); loadList(applied, page); loadStats()
  }

  // For single pooja selection, show plan options
  const selectedPoojaIds = drawer?.data.pooja_ids || []
  const isSinglePooja = selectedPoojaIds.length === 1
  const selectedPooja = isSinglePooja ? poojas.find((p) => String(p.id) === String(selectedPoojaIds[0])) : null
  const planOptions = selectedPooja?.plans || []
  const uniquePoojaNames = [...new Set(poojas.map((p) => p.name))]

  return (
    <div>
      <PageTitle title={tr("Poojari Schedule")} subtitle={tr("Manage and view poojari assignments for scheduled temple poojas.")}
        actions={canWrite && <button onClick={() => setDrawer({ data: emptyForm() })} className="btn-maroon !py-2.5"><Plus size={16} />{' '}<T>Assign Schedule</T></button>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile icon={CalendarCheck} color="#ea580c" bg="bg-orange-50" title={tr("Today's Schedules")} value={stats ? num(stats.today) : '—'} sub={tr("Poojas scheduled today")} />
        <StatTile icon={UserCheck} color="#059669" bg="bg-emerald-50" title={tr("Assigned Poojaris")} value={stats ? num(stats.assigned_poojaris) : '—'} sub={tr("Poojaris with active schedules")} />
        <StatTile icon={CalendarClock} color="#d97706" bg="bg-amber-50" title={tr("Upcoming Schedules")} value={stats ? num(stats.upcoming) : '—'} sub={tr("Next 7 days schedules")} />
        <StatTile icon={UserX} color="#7c3aed" bg="bg-violet-50" title={tr("Unassigned Schedules")} value={stats ? num(stats.unassigned) : '—'} sub={tr("Require poojari assignment")} />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-6 px-5 border-b border-gray-100">
          {[['list', 'List View', List], ['calendar', 'Calendar View', CalendarDays]].map(([k, label, Icon]) => (
            <button key={k} onClick={() => setTab(k)} className={`flex items-center gap-2 py-3.5 text-[0.84375rem] font-semibold border-b-2 -mb-px ${tab === k ? 'border-maroon-600 text-maroon-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              <Icon size={15} /> {tr(label)}
            </button>
          ))}
        </div>

        {tab === 'list' ? (
          <>
            {/* Filters — one self-packing row: each control declares a flex basis
                so they fill the width instead of leaving empty grid cells behind. */}
            <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-end gap-3">
              <div className="flex-[2_1_12rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Search</T></label>
                <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder={tr("Poojari or Pooja name")} className="input !pl-9" /></div></div>
              <div className="flex-[1_1_8rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>From</T></label>
                <DateField value={start} onChange={(e) => { setStart(e.target.value); if (end && e.target.value > end) setEnd('') }} className="input" /></div>
              <div className="flex-[1_1_8rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>To</T></label>
                <DateField value={end} onChange={(e) => setEnd(e.target.value)} min={start} className="input" /></div>
              <div className="flex-[1_1_9rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Pooja</T></label>
                <Select value={pooja} onChange={(e) => setPooja(e.target.value)} className="input"><option value="">{tr("All Poojas")}</option>{uniquePoojaNames.map((n) => <option key={n}>{n}</option>)}</Select></div>
              <div className="flex-[1_1_9rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Poojari</T></label>
                <Select value={poojari} onChange={(e) => setPoojari(e.target.value)} className="input"><option value="">{tr("All Poojaris")}</option>{poojaris.map((p) => <option key={p.id}>{p.name}</option>)}</Select></div>
              <div className="flex-[1_1_9rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Status</T></label>
                <Select value={status} onChange={(e) => setStatus(e.target.value)} className="input"><option value="">{tr("All Status")}</option><option value="Scheduled">{tr("Scheduled")}</option><option value="In Progress">{tr("In Progress")}</option><option value="Completed">{tr("Completed")}</option></Select></div>
              <div className="flex-[1_1_6rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5">&nbsp;</label>
                <button onClick={clear} className="btn-outline !py-2.5 w-full justify-center"><RotateCcw size={14} />{' '}<T>Clear</T></button></div>
            </div>

            <SortPanel sorts={sorts} columns={SORT_COLUMNS} onToggle={handleColumnClick} onRemove={removeSort} onClear={clearSorts} />

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-700">
                  <th className="px-5 py-3 font-semibold whitespace-nowrap">{tr('Schedule ID')}</th>
                  {SORT_COLUMNS.filter(col => col.key === 'poojari_name' || col.key === 'pooja_name').map((col) => {
                    const sortIdx = getSortIndex(col.key)
                    const sortDir = getSortDirection(col.key)
                    const isSorted = sortIdx >= 0
                    return (
                      <th key={col.key} onClick={(e) => handleColumnClick(col.key, e)}
                        className={`group px-5 py-3 font-semibold whitespace-nowrap cursor-pointer select-none hover:bg-gray-100/80 transition-colors ${isSorted ? 'text-maroon-700 bg-maroon-50/50' : ''}`}
                        title={tr("Click to sort (↓→↑→clear). Shift+Click for multi-column sort.")}>
                        <span className="inline-flex items-center gap-0.5">
                          {tr(col.label)}
                          {isSorted ? (
                            <span className="inline-flex items-center gap-0.5 text-maroon-600 ml-1">
                              {sorts.length > 1 && sortIdx > 0 && <span className="text-[0.5625rem] font-bold">{sortIdx + 1}</span>}
                              {sortDir === 'desc' ? <ArrowDown size={13} strokeWidth={2.5} /> : <ArrowUp size={13} strokeWidth={2.5} />}
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-gray-400 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <ChevronsUpDown size={14} strokeWidth={2} />
                            </span>
                          )}
                        </span>
                      </th>
                    )
                  })}
                  <th className="px-5 py-3 font-semibold whitespace-nowrap">{tr('Plan')}</th>
                  {(() => {
                    const col = SORT_COLUMNS.find(c => c.key === 'schedule_date')
                    const sortIdx = getSortIndex(col.key)
                    const sortDir = getSortDirection(col.key)
                    const isSorted = sortIdx >= 0
                    return (
                      <th onClick={(e) => handleColumnClick(col.key, e)}
                        className={`group px-5 py-3 font-semibold whitespace-nowrap cursor-pointer select-none hover:bg-gray-100/80 transition-colors ${isSorted ? 'text-maroon-700 bg-maroon-50/50' : ''}`}
                        title={tr("Click to sort (↓→↑→clear). Shift+Click for multi-column sort.")}>
                        <span className="inline-flex items-center gap-0.5">
                          {tr(col.label)}
                          {isSorted ? (
                            <span className="inline-flex items-center gap-0.5 text-maroon-600 ml-1">
                              {sorts.length > 1 && sortIdx > 0 && <span className="text-[0.5625rem] font-bold">{sortIdx + 1}</span>}
                              {sortDir === 'desc' ? <ArrowDown size={13} strokeWidth={2.5} /> : <ArrowUp size={13} strokeWidth={2.5} />}
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-gray-400 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <ChevronsUpDown size={14} strokeWidth={2} />
                            </span>
                          )}
                        </span>
                      </th>
                    )
                  })()}
                  <th className="px-5 py-3 font-semibold whitespace-nowrap">{tr('Time')}</th>
                  <th className="px-5 py-3 font-semibold whitespace-nowrap">{tr('Execution Frequency')}</th>
                  {(() => {
                    const col = SORT_COLUMNS.find(c => c.key === 'status')
                    const sortIdx = getSortIndex(col.key)
                    const sortDir = getSortDirection(col.key)
                    const isSorted = sortIdx >= 0
                    return (
                      <th onClick={(e) => handleColumnClick(col.key, e)}
                        className={`group px-5 py-3 font-semibold whitespace-nowrap cursor-pointer select-none hover:bg-gray-100/80 transition-colors ${isSorted ? 'text-maroon-700 bg-maroon-50/50' : ''}`}
                        title={tr("Click to sort (↓→↑→clear). Shift+Click for multi-column sort.")}>
                        <span className="inline-flex items-center gap-0.5">
                          {tr(col.label)}
                          {isSorted ? (
                            <span className="inline-flex items-center gap-0.5 text-maroon-600 ml-1">
                              {sorts.length > 1 && sortIdx > 0 && <span className="text-[0.5625rem] font-bold">{sortIdx + 1}</span>}
                              {sortDir === 'desc' ? <ArrowDown size={13} strokeWidth={2.5} /> : <ArrowUp size={13} strokeWidth={2.5} />}
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-gray-400 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <ChevronsUpDown size={14} strokeWidth={2} />
                            </span>
                          )}
                        </span>
                      </th>
                    )
                  })()}
                  <th className="px-5 py-3 font-semibold whitespace-nowrap">{tr('Actions')}</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {sortedRows.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50/60">
                      <td className="px-5 py-3.5 font-mono text-[0.75rem] text-gray-500">{s.code}</td>
                      <td className="px-5 py-3.5 font-semibold text-gray-800">{s.poojari_name ? personName({ name: s.poojari_name, name_te: s.poojari_name_te }, lang) : <span className="text-amber-600 font-normal"><T>Unassigned</T></span>}</td>
                      <td className="px-5 py-3.5 text-gray-700">{tr(s.pooja_name)}</td>
                      <td className="px-5 py-3.5"><Pill tone={planTone(s.plan_name)}>{s.plan_name || '—'}</Pill></td>
                      <td className="px-5 py-3.5 text-[0.8125rem] text-gray-600 whitespace-nowrap">{fmtDate(s.schedule_date)}<span className="block text-[0.6875rem] text-gray-400">{weekday(s.schedule_date)}</span></td>
                      <td className="px-5 py-3.5 text-[0.8125rem] text-gray-600 whitespace-nowrap">{clock12(s.start_time)} –<span className="block">{clock12(s.end_time)}</span></td>
                      <td className="px-5 py-3.5 text-gray-600 text-[0.8125rem]">{tr(s.execution_frequency)}</td>
                      <td className="px-5 py-3.5"><Pill tone={STATUS_TONE[s.status] || 'gray'}>{s.status}</Pill></td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          {canWrite && <button onClick={() => setDrawer({ data: { ...emptyForm(), ...s, pooja_ids: s.pooja_id ? [String(s.pooja_id)] : [], plan_id: s.plan_id || '', poojari_id: s.poojari_id || '' }, id: s.id })} title={tr("Edit")} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-800 hover:text-maroon-700 hover:border-maroon-300"><Pencil size={15} /></button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {sortedRows.length === 0 && <tr><td colSpan={9} className="px-5 py-12 text-center text-gray-600"><T>No schedules found.</T></td></tr>}
                </tbody>
              </table>
            </div>

            <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between">
              <span className="text-[0.8125rem] text-gray-500">{tr('Showing')} {total === 0 ? 0 : (page - 1) * SIZE + 1} {tr('to')} {Math.min(page * SIZE, total)} {tr('of')} {total} {tr('schedules')}</span>
              <div className="flex items-center gap-1.5">
                <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 h-8 rounded-lg border border-gray-200 text-[0.8125rem] text-gray-500 disabled:opacity-40"><T>Previous</T></button>
                {Array.from({ length: Math.min(pageCount, 4) }, (_, i) => i + 1).map((n) => (
                  <button key={n} onClick={() => setPage(n)} className={`w-8 h-8 grid place-items-center rounded-lg text-[0.8125rem] font-semibold ${n === page ? 'bg-maroon-700 text-cream' : 'border border-gray-200 text-gray-600'}`}>{n}</button>
                ))}
                <button disabled={page >= pageCount} onClick={() => setPage(page + 1)} className="px-3 h-8 rounded-lg border border-gray-200 text-[0.8125rem] text-gray-500 disabled:opacity-40"><T>Next</T></button>
              </div>
            </div>
          </>
        ) : (
          <CalendarView rows={rows} />
        )}
      </div>

      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawer(null)} />
          <form onSubmit={save} className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
              <div><h3 className="font-serif text-xl font-bold text-maroon-800">{drawer.id ? tr('Edit Schedule') : tr('Assign Poojari Schedule')}</h3>
                <p className="text-[0.8125rem] text-gray-500 mt-0.5"><T>Assign poojari to a pooja for specific date and time.</T></p></div>
              <button type="button" onClick={() => setDrawer(null)} className="text-gray-400 hover:text-maroon-700"><X size={20} /></button>
            </div>

            <div className="px-6 py-5 space-y-5 flex-1">
              <div className="text-[0.8125rem] font-bold text-maroon-700"><T>1. Assignment Details</T></div>
              <div><label className="label"><T>Pooja(s) *</T></label>
                <MultiSelect
                  value={drawer.data.pooja_ids || []}
                  onChange={(e) => setDrawer({ ...drawer, data: { ...drawer.data, pooja_ids: e.target.value, plan_id: '' } })}
                  placeholder={tr("Select Pooja(s)")}
                  allLabel="Select All Poojas"
                  className="w-full"
                >
                  {poojas.map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
                </MultiSelect>
                {selectedPoojaIds.length > 1 && (
                  <div className="text-[0.75rem] text-amber-600 mt-1">{selectedPoojaIds.length} {tr('poojas selected — default plan will be used for each')}</div>
                )}
              </div>
              {isSinglePooja && (
                <div><label className="label"><T>Plan *</T></label>
                  <Select required className="input" value={drawer.data.plan_id} onChange={(e) => setDrawer({ ...drawer, data: { ...drawer.data, plan_id: e.target.value } })}>
                    <option value="">{tr("Select Plan")}</option>{planOptions.map((pl) => <option key={pl.id} value={pl.id}>{tr(pl.plan_name)} - {pl.committee_decided ? tr('Committee') : '₹' + num(pl.fee)}</option>)}</Select></div>
              )}
              <div><label className="label"><T>Poojari *</T></label>
                <Select required className="input" value={drawer.data.poojari_id} onChange={(e) => setDrawer({ ...drawer, data: { ...drawer.data, poojari_id: e.target.value } })}>
                  <option value="">{tr("Select Poojari")}</option>{poojaris.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>
              <div><label className="label"><T>Schedule Type *</T></label>
                <div className="flex gap-6 mt-1">
                  {['One-Time', 'Recurring'].map((t) => (
                    <label key={t} className="flex items-center gap-2 text-sm text-gray-700"><input type="radio" name="stype" className="accent-maroon-700" checked={drawer.data.schedule_type === t} onChange={() => setDrawer({ ...drawer, data: { ...drawer.data, schedule_type: t } })} /> {t}</label>
                  ))}
                </div></div>
              <div><label className="label"><T>Schedule Date *</T></label><DateField required className="input" value={drawer.data.schedule_date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDrawer({ ...drawer, data: { ...drawer.data, schedule_date: e.target.value } })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label"><T>Start Time *</T></label><div className="relative"><input required className="input !pr-8" value={drawer.data.start_time} onChange={(e) => setDrawer({ ...drawer, data: { ...drawer.data, start_time: e.target.value } })} /><Clock size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" /></div></div>
                <div><label className="label"><T>End Time *</T></label><div className="relative"><input required className="input !pr-8" value={drawer.data.end_time} onChange={(e) => setDrawer({ ...drawer, data: { ...drawer.data, end_time: e.target.value } })} /><Clock size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" /></div></div>
              </div>

              <div className="text-[0.8125rem] font-bold text-maroon-700 pt-1"><T>2. Additional Information</T></div>
              <div><label className="label"><T>Notes (Optional)</T></label><textarea className="input min-h-[4.5rem]" placeholder={tr("Enter any notes or special instructions…")} value={drawer.data.notes} onChange={(e) => setDrawer({ ...drawer, data: { ...drawer.data, notes: e.target.value } })} /></div>
              <div className="bg-amber-50/60 border border-amber-100 rounded-lg px-3 py-2.5 text-[0.75rem] text-gray-600 flex items-start gap-2"><Info size={15} className="text-amber-500 shrink-0 mt-0.5" />{' '}<T>Select multiple poojas to assign them all to the same poojari. Use "Select All Poojas" to assign all poojas at once.</T></div>
            </div>

            {saveErr && <div className="px-6 py-2 text-[0.8125rem] text-red-600 bg-red-50 border-t border-red-100">{saveErr}</div>}
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 sticky bottom-0 bg-white">
              <button type="button" onClick={() => { setDrawer(null); setSaveErr('') }} className="btn-outline flex-1 justify-center"><T>Cancel</T></button>
              <button disabled={selectedPoojaIds.length === 0} className="btn-maroon flex-1 justify-center disabled:opacity-50"><Save size={15} />{' '}{selectedPoojaIds.length > 1 ? tr('Save') + ` (${selectedPoojaIds.length})` : tr('Save Schedule')}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function CalendarView({ rows }) {
  const byDate = rows.reduce((acc, s) => { (acc[s.schedule_date] ||= []).push(s); return acc }, {})
  const dates = Object.keys(byDate).sort()
  return (
    <div className="p-5">
      {dates.length === 0 && <div className="text-center text-gray-600 py-12"><T>No schedules for the current filter.</T></div>}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {dates.map((d) => (
          <div key={d} className="border border-gray-100 rounded-xl p-4">
            <div className="font-semibold text-maroon-700 text-sm mb-3">{fmtDate(d)} <span className="text-gray-400 font-normal">· {weekday(d)}</span></div>
            <div className="space-y-2">
              {byDate[d].map((s) => (
                <div key={s.id} className="flex items-center gap-2 text-[0.8125rem] border-b border-dashed border-gray-100 pb-2">
                  <span className="text-gray-400 text-[0.6875rem] w-16">{s.start_time}</span>
                  <span className="flex-1"><span className="font-semibold text-gray-800">{tr(s.pooja_name)}</span><span className="block text-[0.6875rem] text-gray-400">{s.poojari_name || tr('Unassigned')}</span></span>
                  <Pill tone={STATUS_TONE[s.status] || 'gray'}>{s.status}</Pill>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
