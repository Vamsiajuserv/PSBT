import React, { useEffect, useState, useCallback, useRef } from 'react'
import {
  Plus, Pencil, X, Save, RotateCcw, Search, Info, Repeat, CalendarCheck, UserCheck, AlertTriangle,
  ArrowUp, ArrowDown, ChevronsUpDown, Trash2, CirclePause, CirclePlay,
} from 'lucide-react'
import { PageTitle, StatTile, KpiGrid, Pill, Pager, num, fmtDate } from '../../components/admin/ui.jsx'
import { toast, confirmDialog } from '../../components/common/Dialog.jsx'
import { useSortableTable, SortPanel } from '../../components/common/SortableTable.jsx'
import { SchedulesAPI, PoojasAPI, PoojarisAPI, SettingsAPI, getErrorMessage } from '../../api/client.js'
import { Select, DateField, MultiSelect } from '../../components/common/Field.jsx'
import { T, tr, clock12, personName, useLang } from '../../i18n/LanguageContext.jsx'
import { useFilterParams } from '../../hooks/useUrlState.js'

const RECURRING = 'Recurring'
const ONE_TIME = 'One-Time'
const STATUS_TONE = { Active: 'green', Stopped: 'gray', Scheduled: 'blue', Completed: 'gray', Cancelled: 'red' }
const TYPE_TONE = { [RECURRING]: 'maroon', [ONE_TIME]: 'violet' }
const STATUSES = { [RECURRING]: ['Active', 'Stopped'], [ONE_TIME]: ['Scheduled', 'Completed', 'Cancelled'] }
const SIZE = 10

// Today in IST as YYYY-MM-DD (toISOString() would give the UTC date before 5:30 AM)
const todayISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const weekday = (s) => (s ? tr(new Date(s).toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' })) : '')
const slotLabel = (s) => (s.start_time && s.end_time ? `${clock12(s.start_time)} – ${clock12(s.end_time)}` : tr('Any time'))

const emptyForm = () => ({ poojari_id: '', schedule_type: RECURRING, pooja_ids: [], schedule_date: todayISO(), time_slot: '', notes: '', status: '' })

const SORT_COLUMNS = [
  { key: 'poojari_name', label: 'Poojari', type: 'text' },
  { key: 'pooja_name', label: 'Pooja', type: 'text' },
  { key: 'schedule_type', label: 'Type', type: 'text' },
  { key: 'schedule_date', label: 'Date', type: 'date' },
  { key: 'status', label: 'Status', type: 'text' },
]

function SortTh({ col, sorts, getSortIndex, getSortDirection, onSort }) {
  const idx = getSortIndex(col.key)
  const dir = getSortDirection(col.key)
  const sorted = idx >= 0
  return (
    <th onClick={(e) => onSort(col.key, e)}
      className={`group px-5 py-3 font-semibold whitespace-nowrap cursor-pointer select-none hover:bg-gray-100/80 transition-colors ${sorted ? 'text-maroon-700 bg-maroon-50/50' : ''}`}
      title={tr('Click to sort (↓→↑→clear). Shift+Click for multi-column sort.')}>
      <span className="inline-flex items-center gap-0.5">
        {tr(col.label)}
        {sorted ? (
          <span className="inline-flex items-center gap-0.5 text-maroon-600 ml-1">
            {sorts.length > 1 && idx > 0 && <span className="text-[0.5625rem] font-bold">{idx + 1}</span>}
            {dir === 'desc' ? <ArrowDown size={13} strokeWidth={2.5} /> : <ArrowUp size={13} strokeWidth={2.5} />}
          </span>
        ) : (
          <span className="inline-flex items-center text-gray-400 ml-1 opacity-0 group-hover:opacity-100 transition-opacity"><ChevronsUpDown size={14} strokeWidth={2} /></span>
        )}
      </span>
    </th>
  )
}

export default function PoojariSchedule() {
  const { lang } = useLang()
  const [stats, setStats] = useState(null)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [poojas, setPoojas] = useState([])
  const [poojaris, setPoojaris] = useState([])
  const [slots, setSlots] = useState([])
  const [showUncovered, setShowUncovered] = useState(false)
  // Filters persist in the URL so they survive navigation
  const {
    q, setQ, type, setType, pooja, setPooja, poojari, setPoojari,
    status, setStatus, start, setStart, end, setEnd, page, setPage, setFilters,
  } = useFilterParams({ q: '', type: '', pooja: '', poojari: '', status: '', start: '', end: '', page: 1 })
  const [drawer, setDrawer] = useState(null)
  const [reloadTrigger, setReloadTrigger] = useState(0)

  // Sorting runs on the server so it covers every row, not just the visible page
  const { sorts, handleColumnClick, removeSort, clearSorts, getSortIndex, getSortDirection } = useSortableTable(rows, SORT_COLUMNS, [], { manualSort: true })
  const prevSortsRef = useRef(sorts)
  useEffect(() => {
    if (prevSortsRef.current === sorts) return
    prevSortsRef.current = sorts
    if (page !== 1) setPage(1)
    else setReloadTrigger((t) => t + 1)
  }, [sorts]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadStats = useCallback(() => SchedulesAPI.stats().then(setStats).catch(() => toast(tr('Failed to load schedule stats'), 'error')), [])
  const loadList = useCallback(async () => {
    try {
      const d = await SchedulesAPI.list({
        q, schedule_type: type, pooja, poojari, status, start, end, page, size: SIZE,
        sort_by: sorts[0]?.key || '', sort_dir: sorts[0]?.direction || 'desc',
      })
      setRows(d.items); setTotal(d.total)
    } catch (ex) {
      toast(getErrorMessage(ex, tr('Failed to load schedules')), 'error')
    }
  }, [q, type, pooja, poojari, status, start, end, page, sorts])
  const reload = () => { loadList(); loadStats() }

  useEffect(() => {
    loadStats()
    PoojasAPI.admin().then((d) => setPoojas((d.items || []).filter((p) => p.active))).catch(() => toast(tr('Failed to load poojas'), 'error'))
    PoojarisAPI.list().then(setPoojaris).catch(() => toast(tr('Failed to load poojaris'), 'error'))
    SettingsAPI.config().then((c) => setSlots(c.time_slots || [])).catch(() => {})
  }, [loadStats])
  useEffect(() => { loadList() }, [page, reloadTrigger]) // eslint-disable-line react-hooks/exhaustive-deps

  const search = () => { if (page !== 1) setPage(1); else setReloadTrigger((t) => t + 1) }
  const applyFilters = (f) => { setFilters({ q: '', type: '', pooja: '', poojari: '', status: '', start: '', end: '', ...f, page: 1 }); setReloadTrigger((t) => t + 1) }
  const clear = () => applyFilters({})

  // ── Drawer ──
  const set = (patch) => setDrawer((d) => ({ ...d, data: { ...d.data, ...patch } }))
  const openNew = (patch = {}) => setDrawer({ data: { ...emptyForm(), ...patch }, err: '' })
  const openEdit = (s) => setDrawer({
    id: s.id, row: s, err: '',
    data: { ...emptyForm(), poojari_id: String(s.poojari_id || ''), schedule_type: s.schedule_type, pooja_ids: s.pooja_id ? [String(s.pooja_id)] : [],
      schedule_date: s.schedule_date || todayISO(), time_slot: s.time_slot || '', notes: s.notes || '', status: s.status },
  })

  // Existing holders of the chosen poojas — shown as a note, never a block
  const [overlaps, setOverlaps] = useState([])
  const d = drawer?.data
  const overlapKey = d ? [d.pooja_ids.join(','), d.schedule_type, d.schedule_type === ONE_TIME ? d.schedule_date : '', d.poojari_id, drawer.id || ''].join('|') : ''
  useEffect(() => {
    if (!drawer || !d.pooja_ids.length) { setOverlaps([]); return }
    let alive = true
    const t = setTimeout(() => {
      SchedulesAPI.overlaps({
        pooja_ids: d.pooja_ids.join(','), schedule_type: d.schedule_type,
        schedule_date: d.schedule_type === ONE_TIME ? d.schedule_date : undefined,
        poojari_id: d.poojari_id || undefined, exclude_id: drawer.id || undefined,
      }).then((r) => alive && setOverlaps(r.items || [])).catch(() => alive && setOverlaps([]))
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [overlapKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const others = overlaps.filter((o) => !o.same_poojari)
  // Mirrors the server's skip rule: same poojari, same type, and for one-time the same time
  const slotStart = (d?.time_slot || '').split('-')[0].trim()
  const repeats = drawer?.id ? [] : overlaps.filter((o) => o.same_poojari && o.schedule_type === d.schedule_type
    && (o.schedule_type === RECURRING || (o.start_time || '') === slotStart))

  const [saving, setSaving] = useState(false)
  async function save(e) {
    e.preventDefault()
    if (saving) return
    setDrawer((x) => ({ ...x, err: '' }))
    setSaving(true)
    try {
      if (drawer.id) {
        const body = { poojari_id: Number(d.poojari_id), notes: d.notes, status: d.status }
        if (d.schedule_type === ONE_TIME) Object.assign(body, { schedule_date: d.schedule_date, time_slot: d.time_slot })
        await SchedulesAPI.update(drawer.id, body)
        toast(tr('Schedule updated.'))
      } else {
        const r = await SchedulesAPI.create({
          pooja_ids: d.pooja_ids.map(Number), poojari_id: Number(d.poojari_id), schedule_type: d.schedule_type,
          schedule_date: d.schedule_type === ONE_TIME ? d.schedule_date : null,
          time_slot: d.schedule_type === ONE_TIME ? d.time_slot : null, notes: d.notes,
        })
        const made = r.created.length, skipped = r.skipped.length
        let msg = made === 1 ? tr('Schedule created.') : tr('${n} schedules created.').replace('${n}', made)
        if (skipped) msg += ' ' + tr('${n} skipped — already assigned to this poojari.').replace('${n}', skipped)
        toast(msg, made ? 'success' : 'error')
      }
      setDrawer(null)
      reload()
    } catch (ex) {
      setDrawer((x) => ({ ...x, err: getErrorMessage(ex, tr('Failed to save schedule.')) }))
    } finally {
      setSaving(false)
    }
  }

  async function setRecurringStatus(s, next) {
    const who = personName({ name: s.poojari_name, name_te: s.poojari_name_te }, lang)
    if (next === 'Stopped') {
      const ok = await confirmDialog({
        title: tr('Stop this assignment?'),
        message: `${tr(s.pooja_name)} · ${who} — ${tr('new bookings will no longer be assigned to this poojari.')}`,
        tone: 'danger', confirmLabel: tr('Stop'),
      })
      if (!ok) return
    }
    try {
      await SchedulesAPI.update(s.id, { status: next })
      toast(next === 'Stopped' ? tr('Assignment stopped.') : tr('Assignment resumed.'))
      reload()
    } catch (ex) {
      toast(getErrorMessage(ex, tr('Failed to update schedule.')), 'error')
    }
  }

  async function remove(s) {
    const ok = await confirmDialog({
      title: tr('Delete this schedule?'),
      message: `${s.code} · ${tr(s.pooja_name)} · ${s.schedule_type === RECURRING ? tr('Recurring') : fmtDate(s.schedule_date)}`,
      tone: 'danger', confirmLabel: tr('Delete'),
    })
    if (!ok) return
    try {
      await SchedulesAPI.remove(s.id)
      toast(tr('Schedule deleted.'))
      if (rows.length === 1 && page > 1) setPage(page - 1)
      else loadList()
      loadStats()
    } catch (ex) {
      toast(getErrorMessage(ex, tr('Failed to delete schedule.')), 'error')
    }
  }

  const uniquePoojaNames = [...new Set(poojas.map((p) => p.name))].sort()
  const uncovered = stats?.uncovered_poojas || []
  const isOneTime = d?.schedule_type === ONE_TIME
  const sortTh = (key) => <SortTh col={SORT_COLUMNS.find((c) => c.key === key)} sorts={sorts} getSortIndex={getSortIndex} getSortDirection={getSortDirection} onSort={handleColumnClick} />

  return (
    <div>
      <PageTitle title={tr('Poojari Schedule')} subtitle={tr('Assign poojas to poojaris. New bookings are given the scheduled poojari automatically.')}
        actions={<button onClick={() => openNew()} className="btn-maroon !py-2.5"><Plus size={16} />{' '}<T>Assign Schedule</T></button>} />

      <KpiGrid>
        <StatTile icon={Repeat} color="#8a1c1c" bg="bg-maroon-50" title={tr('Recurring Assignments')} value={stats ? num(stats.active_recurring) : '—'}
          sub={tr('Active until stopped')} onClick={() => applyFilters({ type: RECURRING, status: 'Active' })} />
        <StatTile icon={CalendarCheck} color="#7c3aed" bg="bg-violet-50" title={tr("Today's One-Time")} value={stats ? num(stats.today_one_time) : '—'}
          sub={tr('Assignments for today only')} onClick={() => applyFilters({ type: ONE_TIME, status: 'Scheduled', start: todayISO(), end: todayISO() })} />
        <StatTile icon={UserCheck} color="#059669" bg="bg-emerald-50" title={tr('Poojaris on Duty')} value={stats ? num(stats.poojaris_on_duty) : '—'}
          sub={tr('With an active assignment today')} />
        <StatTile icon={AlertTriangle} color="#d97706" bg="bg-amber-50" title={tr('Poojas without Poojari')} value={stats ? num(stats.uncovered_count) : '—'}
          sub={tr('No recurring assignment — click to view')} onClick={() => setShowUncovered((v) => !v)} />
      </KpiGrid>

      {showUncovered && (
        <div className="mb-6 bg-amber-50/60 border border-amber-200 rounded-xl px-5 py-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="font-semibold text-gray-800"><T>Poojas without a recurring poojari</T></div>
              <div className="text-[0.75rem] text-gray-600"><T>New bookings for these poojas stay unassigned unless a one-time assignment covers that date.</T></div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {uncovered.length > 0 && <button onClick={() => openNew({ schedule_type: RECURRING, pooja_ids: uncovered.map((p) => String(p.id)) })} className="btn-maroon !py-2"><Plus size={14} />{' '}<T>Assign these</T></button>}
              <button onClick={() => setShowUncovered(false)} aria-label={tr('Close')} className="text-gray-400 hover:text-maroon-700"><X size={18} /></button>
            </div>
          </div>
          {uncovered.length === 0
            ? <div className="text-sm text-emerald-700"><T>Every active pooja has a recurring poojari.</T></div>
            : <div className="flex flex-wrap gap-2">{uncovered.map((p) => <span key={p.id} className="px-2.5 py-1 rounded-full bg-white border border-amber-200 text-[0.75rem] text-gray-700">{personName(p, lang)}</span>)}</div>}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Filters — one self-packing row */}
        <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[12rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Search</T></label>
            <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder={tr('Poojari, pooja or ID')} className="input !pl-9" /></div></div>
          <div className="w-[8rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Type</T></label>
            <Select value={type} onChange={(e) => { setType(e.target.value); setStatus('') }} className="input"><option value="">{tr('All Types')}</option><option value={RECURRING}>{tr('Recurring')}</option><option value={ONE_TIME}>{tr('One-Time')}</option></Select></div>
          <div className="w-[8rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>From</T></label>
            <DateField value={start} onChange={(e) => { setStart(e.target.value); if (end && e.target.value > end) setEnd('') }} className="input" /></div>
          <div className="w-[8rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>To</T></label>
            <DateField value={end} onChange={(e) => setEnd(e.target.value)} min={start} className="input" /></div>
          <div className="w-[8rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Pooja</T></label>
            <Select value={pooja} onChange={(e) => setPooja(e.target.value)} className="input"><option value="">{tr('All Poojas')}</option>{uniquePoojaNames.map((n) => <option key={n} value={n}>{tr(n)}</option>)}</Select></div>
          <div className="w-[8rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Poojari</T></label>
            <Select value={poojari} onChange={(e) => setPoojari(e.target.value)} className="input"><option value="">{tr('All Poojaris')}</option>{poojaris.map((p) => <option key={p.id} value={p.name}>{personName(p, lang)}</option>)}</Select></div>
          <div className="w-[8rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Status</T></label>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="input"><option value="">{tr('All Status')}</option>
              {(type ? STATUSES[type] : [...STATUSES[RECURRING], ...STATUSES[ONE_TIME]]).map((st) => <option key={st} value={st}>{tr(st)}</option>)}</Select></div>
          <button onClick={search} className="btn-maroon !py-2.5 shrink-0"><Search size={14} />{' '}<T>Apply</T></button>
          <button onClick={clear} className="btn-outline !py-2.5 shrink-0"><RotateCcw size={14} />{' '}<T>Clear</T></button>
        </div>

        <SortPanel sorts={sorts} columns={SORT_COLUMNS} onToggle={handleColumnClick} onRemove={removeSort} onClear={clearSorts} />

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-700">
              <th className="px-5 py-3 font-semibold whitespace-nowrap">{tr('Schedule ID')}</th>
              {sortTh('poojari_name')}
              {sortTh('pooja_name')}
              {sortTh('schedule_type')}
              {sortTh('schedule_date')}
              <th className="px-5 py-3 font-semibold whitespace-nowrap">{tr('Time')}</th>
              {sortTh('status')}
              <th className="px-5 py-3 font-semibold whitespace-nowrap">{tr('Actions')}</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((s) => {
                const recurring = s.schedule_type === RECURRING
                return (
                  <tr key={s.id} className="hover:bg-gray-50/60">
                    <td className="px-5 py-3.5 font-mono text-[0.75rem] text-gray-500">{s.code}</td>
                    <td className="px-5 py-3.5 font-semibold text-gray-800">{s.poojari_name ? personName({ name: s.poojari_name, name_te: s.poojari_name_te }, lang) : <span className="text-amber-600 font-normal"><T>Unassigned</T></span>}</td>
                    <td className="px-5 py-3.5 text-gray-700">{tr(s.pooja_name)}</td>
                    <td className="px-5 py-3.5 whitespace-nowrap"><Pill tone={TYPE_TONE[s.schedule_type] || 'gray'}>{tr(s.schedule_type)}</Pill></td>
                    <td className="px-5 py-3.5 text-[0.8125rem] text-gray-600 whitespace-nowrap">
                      {recurring ? (
                        <>{tr('Since')} {fmtDate(s.schedule_date)}
                          <span className="block text-[0.6875rem] text-gray-400">{s.ended_on ? `${tr('Stopped')} ${fmtDate(s.ended_on)}` : tr('Ongoing')}</span></>
                      ) : (
                        <>{fmtDate(s.schedule_date)}<span className="block text-[0.6875rem] text-gray-400">{weekday(s.schedule_date)}</span></>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-[0.8125rem] text-gray-600 whitespace-nowrap">{recurring ? tr('Every day') : slotLabel(s)}</td>
                    <td className="px-5 py-3.5 whitespace-nowrap"><Pill tone={STATUS_TONE[s.status] || 'gray'}>{tr(s.status)}</Pill></td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEdit(s)} title={tr('Edit')} aria-label={tr('Edit')} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-800 hover:text-maroon-700 hover:border-maroon-300"><Pencil size={15} /></button>
                        {recurring && s.status === 'Active' && <button onClick={() => setRecurringStatus(s, 'Stopped')} title={tr('Stop')} aria-label={tr('Stop')} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-amber-600 hover:text-amber-700 hover:border-amber-300"><CirclePause size={15} /></button>}
                        {recurring && s.status === 'Stopped' && <button onClick={() => setRecurringStatus(s, 'Active')} title={tr('Resume')} aria-label={tr('Resume')} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-emerald-600 hover:text-emerald-700 hover:border-emerald-300"><CirclePlay size={15} /></button>}
                        <button onClick={() => remove(s)} title={tr('Delete')} aria-label={tr('Delete')} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-red-500 hover:text-red-700 hover:border-red-300"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && <tr><td colSpan={8} className="px-5 py-12 text-center text-gray-600"><T>No schedules found.</T></td></tr>}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between">
          <Pager page={page} size={SIZE} total={total} onPage={setPage} unit="schedules" />
        </div>
      </div>

      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawer(null)} />
          <form onSubmit={save} className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
              <div><h3 className="font-serif text-xl font-bold text-maroon-800">{drawer.id ? tr('Edit Schedule') : tr('Assign Poojari Schedule')}</h3>
                <p className="text-[0.8125rem] text-gray-500 mt-0.5">{drawer.id ? drawer.row.code : tr('Choose a poojari and the poojas they will cover.')}</p></div>
              <button type="button" onClick={() => setDrawer(null)} className="text-gray-400 hover:text-maroon-700"><X size={20} /></button>
            </div>

            <div className="px-6 py-5 space-y-5 flex-1">
              <div><label className="label"><T>Poojari *</T></label>
                <Select required className="input" value={d.poojari_id} onChange={(e) => set({ poojari_id: e.target.value })}>
                  <option value="">{tr('Select Poojari')}</option>{poojaris.map((p) => <option key={p.id} value={String(p.id)}>{personName(p, lang)}</option>)}</Select>
                {drawer.id && d.schedule_type === RECURRING && <div className="text-[0.75rem] text-gray-500 mt-1"><T>Changing the poojari reassigns this pooja from now on.</T></div>}
              </div>

              <div><label className="label"><T>Schedule Type *</T></label>
                {drawer.id ? (
                  <div className="mt-1"><Pill tone={TYPE_TONE[d.schedule_type]}>{tr(d.schedule_type)}</Pill></div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    {[[RECURRING, 'Every day until you stop it'], [ONE_TIME, 'A single date, e.g. covering leave']].map(([t, hint]) => (
                      <label key={t} className={`cursor-pointer rounded-lg border px-3 py-2.5 ${d.schedule_type === t ? 'border-maroon-500 bg-maroon-50/50' : 'border-gray-200 hover:border-gray-300'}`}>
                        <span className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                          <input type="radio" name="stype" className="accent-maroon-700" checked={d.schedule_type === t} onChange={() => set({ schedule_type: t })} />{tr(t)}
                        </span>
                        <span className="block text-[0.6875rem] text-gray-500 mt-0.5 ml-5">{tr(hint)}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div><label className="label"><T>Pooja(s) *</T></label>
                {drawer.id ? (
                  <div className="input bg-gray-50 text-gray-700">{tr(drawer.row.pooja_name)}</div>
                ) : (
                  <MultiSelect value={d.pooja_ids} onChange={(e) => set({ pooja_ids: e.target.value })}
                    placeholder={tr('Select Pooja(s)')} allLabel={tr('Select All Poojas')} className="w-full">
                    {poojas.map((p) => <option key={p.id} value={String(p.id)}>{personName(p, lang)}</option>)}
                  </MultiSelect>
                )}
                {!drawer.id && d.pooja_ids.length > 1 && <div className="text-[0.75rem] text-gray-500 mt-1">{d.pooja_ids.length} {tr('poojas selected')}</div>}
              </div>

              {isOneTime && (
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label"><T>Date *</T></label>
                    <DateField required className="input" value={d.schedule_date} min={todayISO()} onChange={(e) => set({ schedule_date: e.target.value })} /></div>
                  <div><label className="label"><T>Time (Optional)</T></label>
                    <Select className="input" value={d.time_slot} onChange={(e) => set({ time_slot: e.target.value })}>
                      <option value="">{tr('Any time')}</option>
                      {[...new Set([...slots, ...(d.time_slot ? [d.time_slot] : [])])].map((sl) => <option key={sl} value={sl}>{clock12(sl)}</option>)}
                    </Select></div>
                </div>
              )}

              {drawer.id && (
                <div><label className="label"><T>Status *</T></label>
                  <Select required className="input" value={d.status} onChange={(e) => set({ status: e.target.value })}>
                    {STATUSES[d.schedule_type].map((st) => <option key={st} value={st}>{tr(st)}</option>)}
                  </Select></div>
              )}

              <div><label className="label"><T>Notes (Optional)</T></label>
                <textarea className="input min-h-[4.5rem]" maxLength={1000} placeholder={tr('Enter any notes or special instructions…')} value={d.notes} onChange={(e) => set({ notes: e.target.value })} /></div>

              {others.length > 0 && (
                <div className="bg-amber-50/70 border border-amber-200 rounded-lg px-3 py-2.5 text-[0.75rem] text-gray-700">
                  <div className="flex items-center gap-1.5 font-semibold text-amber-800 mb-1"><Info size={14} />{' '}<T>Already assigned — both will be kept</T></div>
                  <ul className="space-y-0.5">
                    {others.map((o) => (
                      <li key={o.id}>{tr(o.pooja_name)} · <span className="font-semibold">{personName({ name: o.poojari_name, name_te: o.poojari_name_te }, lang)}</span>{' '}
                        <span className="text-gray-500">({o.schedule_type === RECURRING ? tr('Recurring') : `${fmtDate(o.schedule_date)}${o.start_time ? ' · ' + clock12(o.start_time) : ''}`}, {o.code})</span></li>
                    ))}
                  </ul>
                  <div className="text-gray-500 mt-1.5">{isOneTime ? tr('On this date, new bookings go to the one-time poojari.') : tr('New bookings go to the most recent assignment.')}</div>
                </div>
              )}
              {repeats.length > 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-[0.75rem] text-gray-600">
                  {tr('Already assigned to this poojari, will be skipped:')} {repeats.map((o) => tr(o.pooja_name)).join(', ')}
                </div>
              )}
            </div>

            {drawer.err && <div className="px-6 py-2 text-[0.8125rem] text-red-600 bg-red-50 border-t border-red-100">{drawer.err}</div>}
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 sticky bottom-0 bg-white">
              <button type="button" onClick={() => setDrawer(null)} className="btn-outline flex-1 justify-center"><T>Cancel</T></button>
              <button disabled={!d.pooja_ids.length || !d.poojari_id || saving} className="btn-maroon flex-1 justify-center disabled:opacity-50">
                <Save size={15} />{' '}{saving ? tr('Saving…') : !drawer.id && d.pooja_ids.length > 1 ? `${tr('Save')} (${d.pooja_ids.length})` : tr('Save Schedule')}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
