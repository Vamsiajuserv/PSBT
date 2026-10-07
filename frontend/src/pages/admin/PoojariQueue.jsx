import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Clock, User, Phone, CheckCircle2, Repeat, Flame, Loader2, Download, Printer, X,
  ArrowUp, ArrowDown, ChevronsUpDown, Undo2, AlertTriangle, UserCheck, Users as UsersIcon, RefreshCw,
} from 'lucide-react'
import { PageHeader } from '../../components/common/UI.jsx'
import { LoadingBlock, ErrorBlock } from '../../components/common/states.jsx'
import { useSortableTable } from '../../components/common/SortableTable.jsx'
import { useAuth } from '../../auth/AuthContext.jsx'
import { isAdminRole } from '../../auth/access.js'
import { PoojarisAPI, BookingsAPI, ApiError, getErrorMessage } from '../../api/client.js'
import { DateField, Select } from '../../components/common/Field.jsx'
import { confirmDialog, toast } from '../../components/common/Dialog.jsx'
import { T, tr, clock12, personName, useLang, stamp } from '../../i18n/LanguageContext.jsx'
import { useFilterParams } from '../../hooks/useUrlState.js'

// Sortable fields for the cards (applied within each group)
const SORT_COLUMNS = [
  { key: 'time_slot', label: 'Time Slot', type: 'time' },
  { key: 'pooja', label: 'Pooja', type: 'text' },
  { key: 'devotee_name', label: 'Devotee', type: 'text' },
  { key: 'status', label: 'Status', type: 'text' },
  { key: 'performed_on', label: 'Performed On', type: 'date' },
]
const REFRESH_MS = 60000   // today's queue refreshes itself so new counter bookings appear

const ist = (d) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const todayISO = () => ist(new Date())
const shiftISO = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return ist(d) }
const weekStartISO = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return ist(d) }
const monthStartISO = () => { const d = new Date(); d.setDate(1); return ist(d) }

const fmtDate = (iso) =>
  iso ? stamp(new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })) : ''
const fmtTime = (iso) =>
  iso ? clock12(new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z').toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })) : ''

// Quick ranges. Today / a future day show the queue of what is due; any past day or
// multi-day range shows the performance history (who performed what, when).
const DATE_PRESETS = [
  { key: 'today', label: 'Today', range: () => [todayISO(), todayISO()] },
  { key: 'tomorrow', label: 'Tomorrow', range: () => [shiftISO(1), shiftISO(1)] },
  { key: 'yesterday', label: 'Yesterday', range: () => [shiftISO(-1), shiftISO(-1)] },
  { key: 'week', label: 'This Week', range: () => [weekStartISO(), todayISO()] },
  { key: 'month', label: 'This Month', range: () => [monthStartISO(), todayISO()] },
]

const isDue = (i) => !i.done_today && i.status === 'Confirmed' && (i.remaining === null || i.remaining > 0)

export default function PoojariQueue() {
  const { lang } = useLang()
  const { user } = useAuth()
  const isPoojari = user?.role === 'Poojari'
  const isAdmin = isAdminRole(user)
  const name = personName(user, lang) || tr('Administrator')
  const role = user?.role === 'Admin' ? 'Administrator' : (user?.role || '')

  // Dates + "show" choice persist in the URL so they survive navigation
  const { startDate, setStartDate, endDate, setEndDate, show, setShow, setFilters } = useFilterParams({
    startDate: todayISO(), endDate: todayISO(), show: 'mine',
  })
  const today = todayISO()
  const isQueueMode = startDate === endDate && startDate >= today   // else: performance history
  const isToday = isQueueMode && startDate === today
  const preset = DATE_PRESETS.find((p) => { const [s, e] = p.range(); return s === startDate && e === endDate })?.key || 'custom'
  const onlyMine = isPoojari && show === 'mine'

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [showPrintModal, setShowPrintModal] = useState(false)
  const [poojaris, setPoojaris] = useState([])

  const { sortedRows, sorts, handleColumnClick, clearSorts, getSortIndex, getSortDirection } = useSortableTable(data?.items || [], SORT_COLUMNS, [])

  const load = useCallback(({ silent = false } = {}) => {
    if (!silent) { setLoading(true); setError('') }
    // History is limited to the poojari's own performances when "Mine" is chosen; the
    // day queue always loads everything and is grouped below (mine / unassigned / others).
    const params = isQueueMode ? { day: startDate } : { start: startDate, end: endDate, mine: onlyMine || undefined }
    return PoojarisAPI.queue(params)
      .then((r) => { setData(r); setUpdatedAt(new Date()) })
      .catch((e) => { if (!silent) setError(e instanceof ApiError ? e.detail : tr('Could not load the pooja queue.')) })
      .finally(() => { if (!silent) setLoading(false) })
  }, [startDate, endDate, isQueueMode, onlyMine])
  useEffect(() => { load() }, [load])

  // Live refresh of today's queue while the tab is visible
  const busyRef = useRef(false)
  busyRef.current = busyId !== null
  useEffect(() => {
    if (!isToday) return undefined
    const t = setInterval(() => {
      if (document.visibilityState === 'visible' && !busyRef.current) load({ silent: true })
    }, REFRESH_MS)
    return () => clearInterval(t)
  }, [isToday, load])

  useEffect(() => {
    if (isAdmin) PoojarisAPI.list().then(setPoojaris).catch(() => {})
  }, [isAdmin])

  const items = data?.items || []
  const linked = !!data?.linked
  const meName = data?.poojari_name

  // ── Grouping (queue mode) ──
  const groups = useMemo(() => {
    if (!isQueueMode) return [{ key: 'all', rows: sortedRows }]
    if (isPoojari && linked) {
      const mine = sortedRows.filter((r) => r.assigned_to_me)
      const open = sortedRows.filter((r) => !r.poojari_id)
      const others = sortedRows.filter((r) => r.poojari_id && !r.assigned_to_me)
      return [
        { key: 'mine', title: tr('Assigned to you'), icon: UserCheck, rows: mine, empty: tr('Nothing assigned to you for this day.') },
        { key: 'open', title: tr('Unassigned'), hint: tr('Anyone can perform these — performing one assigns it to you.'), icon: AlertTriangle, rows: open },
        ...(show === 'all' ? [{ key: 'others', title: tr('Other poojaris'), icon: UsersIcon, rows: others }] : []),
      ].filter((g) => g.rows.length || g.key === 'mine')
    }
    if (isPoojari) return [{ key: 'all', rows: sortedRows }]
    // Administrator / other staff: the whole temple, grouped by poojari
    const byPoojari = new Map()
    for (const r of sortedRows) {
      const k = r.poojari_id ? String(r.poojari_id) : ''
      if (!byPoojari.has(k)) byPoojari.set(k, { key: k || 'open', poojariId: r.poojari_id, title: r.poojari_name || tr('Unassigned'), icon: r.poojari_id ? User : AlertTriangle, rows: [] })
      byPoojari.get(k).rows.push(r)
    }
    const open = byPoojari.get('')
    const named = [...byPoojari.values()].filter((g) => g.poojariId).sort((a, b) => a.title.localeCompare(b.title))
    return [...(open ? [open] : []), ...named]
  }, [sortedRows, isQueueMode, isPoojari, linked, show])

  const visible = groups.flatMap((g) => g.rows)
  const dueMine = items.filter((i) => isDue(i) && i.assigned_to_me).length
  const dueAll = items.filter(isDue).length
  const doneCount = isQueueMode ? visible.filter((i) => i.done_today || i.status === 'Completed').length : visible.length

  // ── Actions ──
  async function markPerformed(b) {
    if (b.poojari_id && isPoojari && !b.assigned_to_me) {
      const ok = await confirmDialog({
        title: tr('Perform a pooja assigned to someone else?'),
        message: `${tr(b.pooja)} · ${tr('Assigned to')} ${personName({ name: b.poojari_name }, lang)}. ${tr('It will be recorded as performed by you.')}`,
        confirmLabel: tr('Mark Performed'),
      })
      if (!ok) return
    }
    setBusyId(b.id)
    try {
      await BookingsAPI.complete(b.id)
      await load({ silent: true })
    } catch (e) {
      toast(getErrorMessage(e, tr('Could not mark the pooja performed.')), 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function undo(b) {
    const ok = await confirmDialog({
      title: tr("Undo today's performance?"),
      message: `${tr(b.pooja)} · ${personName({ name: b.devotee_name, name_te: b.devotee_name_te }, lang)} — ${tr('the performance is given back to the ticket.')}`,
      tone: 'danger', confirmLabel: tr('Undo'),
    })
    if (!ok) return
    setBusyId(b.id)
    try {
      await BookingsAPI.undoPerformed(b.id)
      toast(tr('Performance undone.'))
      await load({ silent: true })
    } catch (e) {
      toast(getErrorMessage(e, tr('Could not undo the performance.')), 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function reassign(b, poojariId) {
    setBusyId(b.id)
    try {
      await PoojarisAPI.assign(b.id, poojariId ? Number(poojariId) : null)
      await load({ silent: true })
    } catch (e) {
      toast(getErrorMessage(e, tr('Could not assign poojari.')), 'error')
    } finally {
      setBusyId(null)
    }
  }

  // Poojari: their own due poojas. Administrator: everything, or one poojari's group.
  async function markAllDue(poojariId) {
    const count = isPoojari ? dueMine
      : poojariId ? items.filter((i) => isDue(i) && i.poojari_id === poojariId).length : dueAll
    if (!count) return
    if (!(await confirmDialog({ title: `${tr('Mark all due poojas as performed?')} (${count})`, message: tr('Each will be recorded as performed for today.'), confirmLabel: tr('Mark All') }))) return
    try {
      const r = await PoojarisAPI.completeDue(poojariId ? { poojari_id: poojariId } : {})
      toast(`${r.completed} ${tr('performed')}${r.skipped?.length ? ` · ${r.skipped.length} ${tr('skipped (quota exhausted).')}` : ''}`)
      await load({ silent: true })
    } catch (e) {
      toast(getErrorMessage(e, tr('Bulk action failed.')), 'error')
    }
  }

  // ── Export ──
  const poojariOf = (r) => (isQueueMode ? (r.performed_by_poojari || r.poojari_name) : r.performed_by_poojari) || ''
  const statusOf = (r) => (r.performed_on ? 'Performed' : r.status === 'Completed' ? 'Completed' : 'Pending')
  const downloadCSV = () => {
    if (!visible.length) return
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const headers = ['Date', 'Time', 'Pooja', 'Plan', 'Devotee', 'Mobile', 'Ticket No', 'Poojari', 'Status']
    const lines = [headers.join(',')]
    for (const r of visible) {
      lines.push([r.performed_on || startDate, r.time_slot || '', q(r.pooja), r.plan || '', q(r.devotee_name), r.mobile || '',
        r.ticket_no || r.booking_code || '', q(poojariOf(r)), statusOf(r)].join(','))
    }
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `Pooja_Queue_${startDate}${startDate !== endDate ? `_to_${endDate}` : ''}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const setRange = (s, e) => { setFilters({ startDate: s, endDate: e }); clearSorts() }
  const dateLabel = startDate === endDate ? fmtDate(startDate) : `${fmtDate(startDate)} – ${fmtDate(endDate)}`

  return (
    <div>
      <PageHeader title={isPoojari ? tr('My Poojas') : tr('Pooja Queue')}
        subtitle={`${tr('Welcome back,')} ${name}${role && !name.includes(role) ? ` (${tr(role)})` : ''}`} />

      {isPoojari && data && !linked && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-[0.8125rem] text-amber-800 flex items-start gap-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span><T>Your login is not linked to a poojari record, so none of these poojas can be shown as yours. Ask the administrator to link it in User Management.</T></span>
        </div>
      )}

      {/* Date presets */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-[0.75rem] text-gray-500 font-medium"><T>Quick Select</T>:</span>
        {DATE_PRESETS.map((p) => (
          <button key={p.key} onClick={() => setRange(...p.range())}
            className={`px-3 py-1.5 rounded-full text-[0.75rem] font-semibold border transition ${preset === p.key ? 'bg-maroon-600 text-white border-maroon-600' : 'bg-white text-gray-600 border-gray-200 hover:border-maroon-300 hover:text-maroon-700'}`}>
            {tr(p.label)}
          </button>
        ))}
        {preset === 'custom' && <span className="px-3 py-1.5 rounded-full text-[0.75rem] font-semibold bg-maroon-600 text-white">{tr('Custom')}</span>}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div>
          <label className="label"><T>From</T></label>
          <DateField value={startDate} onChange={(e) => setRange(e.target.value, endDate && e.target.value > endDate ? e.target.value : endDate)} className="mt-1" />
        </div>
        <div>
          <label className="label"><T>To</T></label>
          <DateField value={endDate} onChange={(e) => setRange(startDate, e.target.value)} min={startDate} className="mt-1" />
        </div>
        {isPoojari && linked && (
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {[['mine', isQueueMode ? 'Mine + Unassigned' : 'Performed by me'], ['all', isQueueMode ? 'All poojas' : 'All poojaris']].map(([val, lbl]) => (
              <button key={val} onClick={() => setShow(val)}
                className={`px-4 py-2 text-[0.8125rem] font-semibold transition ${show === val ? 'bg-maroon-700 text-cream' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                {tr(lbl)}
              </button>
            ))}
          </div>
        )}
        {isToday && (isPoojari ? (linked && dueMine > 0) : dueAll > 0) && (
          <button onClick={() => markAllDue()} className="btn-maroon !py-2"><CheckCircle2 size={15} /> {isPoojari ? tr('Mark all mine due') : tr('Mark all due')} ({isPoojari ? dueMine : dueAll})</button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={downloadCSV} disabled={!visible.length} className="btn-outline !py-2 disabled:opacity-50" title={tr('Download CSV')}><Download size={15} /> <T>Download</T></button>
          <button onClick={() => setShowPrintModal(true)} disabled={!visible.length} className="btn-outline !py-2 disabled:opacity-50" title={tr('Print')}><Printer size={15} /> <T>Print</T></button>
        </div>
      </div>

      {/* Summary + sort */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.8125rem] mb-4">
        {isQueueMode ? (
          <>
            <span className="text-gray-600">{visible.length} {tr('total')}</span>
            <span className="text-amber-700 font-semibold">{visible.filter(isDue).length} {tr('to perform')}</span>
            <span className="text-emerald-700 font-semibold">{doneCount} {tr('done')}</span>
          </>
        ) : (
          <span className="text-emerald-700 font-semibold">{visible.length} {tr('performances')} · {dateLabel}</span>
        )}
        {isToday && updatedAt && (
          <button onClick={() => load({ silent: true })} className="inline-flex items-center gap-1 text-[0.75rem] text-gray-400 hover:text-maroon-700" title={tr('Refreshes every minute')}>
            <RefreshCw size={12} /> {tr('Updated')} {clock12(updatedAt.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }))}
          </button>
        )}
        {items.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
            <span className="text-[0.75rem] text-gray-500"><T>Sort by</T>:</span>
            {SORT_COLUMNS.filter((c) => isQueueMode ? c.key !== 'performed_on' : true).map((col) => {
              const idx = getSortIndex(col.key)
              const dir = getSortDirection(col.key)
              return (
                <button key={col.key} onClick={(e) => handleColumnClick(col.key, e)}
                  className={`group inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[0.75rem] font-medium border transition ${idx >= 0 ? 'bg-maroon-50 border-maroon-200 text-maroon-700' : 'bg-white border-gray-200 text-gray-600 hover:border-maroon-300'}`}
                  title={tr('Click to sort (↓→↑→clear). Shift+Click for multi-column sort.')}>
                  {tr(col.label)}
                  {idx >= 0
                    ? <span className="inline-flex items-center gap-0.5 text-maroon-600">{sorts.length > 1 && idx > 0 && <span className="text-[0.5625rem] font-bold">{idx + 1}</span>}{dir === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />}</span>
                    : <ChevronsUpDown size={12} className="text-gray-400 opacity-0 group-hover:opacity-100" />}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {loading ? (
        <LoadingBlock label={tr('Loading pooja queue…')} />
      ) : error ? (
        <ErrorBlock message={error} onRetry={() => load()} />
      ) : visible.length === 0 && !groups.some((g) => g.key === 'mine') ? (
        <div className="card p-10 text-center text-gray-500">
          <Flame size={32} className="mx-auto text-gold-300 mb-3" />
          {isQueueMode ? tr('No poojas for') : tr('No poojas performed in')} {dateLabel}.
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => {
            const groupDue = g.rows.filter(isDue).length
            return (
              <section key={g.key}>
                {g.title && (
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    {g.icon && <g.icon size={15} className={g.key === 'open' ? 'text-amber-600' : 'text-maroon-700'} />}
                    <h2 className="font-semibold text-gray-800">{g.poojariId ? personName({ name: g.title }, lang) : g.title}</h2>
                    <span className="text-[0.75rem] text-gray-500">{g.rows.length} · {groupDue} {tr('to perform')}</span>
                    {g.hint && <span className="text-[0.75rem] text-gray-500">— {g.hint}</span>}
                    {isAdmin && isToday && g.poojariId && groupDue > 0 && (
                      <button onClick={() => markAllDue(g.poojariId)} className="ml-auto text-[0.75rem] font-semibold text-maroon-700 hover:underline">{tr('Mark all due')} ({groupDue})</button>
                    )}
                  </div>
                )}
                {g.rows.length === 0 ? (
                  <div className="card px-4 py-5 text-center text-[0.8125rem] text-gray-500">{g.empty}</div>
                ) : (
                  <div className="space-y-3">
                    {g.rows.map((b) => (
                      <QueueCard key={b.key || b.id} b={b} lang={lang} user={user} isAdmin={isAdmin}
                        isQueueMode={isQueueMode} isToday={isToday} busy={busyId === b.id} poojaris={poojaris}
                        onPerform={markPerformed} onUndo={undo} onReassign={reassign} />
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      {/* Print Modal */}
      {showPrintModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto print-modal" onClick={() => setShowPrintModal(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl shadow-xl w-full max-w-4xl my-auto max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between no-print">
              <div>
                <h3 className="font-bold text-gray-900 text-lg"><T>Print Pooja Report</T></h3>
                <p className="text-sm text-gray-500">{dateLabel} · {visible.length} {tr('records')}</p>
              </div>
              <button onClick={() => setShowPrintModal(false)} className="text-gray-400 hover:text-maroon-700"><X size={20} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6" id="print-pooja-queue">
              <div className="text-center mb-6 print-header">
                <img src="/images/temple-logo.png" alt="Sri Shirdi Sai Baba" className="w-16 h-16 mx-auto mb-2 rounded-full object-cover" onError={(e) => { e.target.style.display = 'none' }} />
                <h1 className="font-serif text-xl font-bold text-maroon-800">Sri Shirdi Sai Baba Temple</h1>
                <p className="text-sm text-gray-600">శ్రీ షిర్డీ సాయిబాబా దేవస్థానం</p>
                <h2 className="text-lg font-semibold text-gray-800 mt-3">{isQueueMode ? tr('Pooja Queue Report') : tr('Pooja Performance Report')}</h2>
                <p className="text-sm text-gray-600">
                  <T>Date</T>: {dateLabel}
                  {isPoojari && meName && show === 'mine' && <span> · <T>Poojari</T>: {personName({ name: meName }, lang)}</span>}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-gray-800">{visible.length}</div>
                  <div className="text-xs text-gray-500"><T>Total Poojas</T></div>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-emerald-700">{doneCount}</div>
                  <div className="text-xs text-emerald-600"><T>Performed</T></div>
                </div>
              </div>

              <table className="w-full text-sm border border-gray-200">
                <thead>
                  <tr className="bg-gray-100 text-left text-xs uppercase text-gray-700">
                    {['Date', 'Time', 'Pooja', 'Devotee', 'Mobile', 'Ticket', 'Poojari', 'Status'].map((h) => <th key={h} className="px-3 py-2 border-b font-semibold">{tr(h)}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visible.map((r) => (
                    <tr key={r.key || r.id}>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{fmtDate(r.performed_on || startDate)}</td>
                      <td className="px-3 py-2 text-gray-600">{clock12(r.time_slot) || '—'}</td>
                      <td className="px-3 py-2 text-gray-800">{tr(r.pooja)}{r.plan ? ` · ${tr(r.plan)}` : ''}</td>
                      <td className="px-3 py-2 text-gray-700">{personName({ name: r.devotee_name, name_te: r.devotee_name_te }, lang)}</td>
                      <td className="px-3 py-2 text-gray-600">{r.mobile || '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs text-gray-600">{r.ticket_no || r.booking_code}</td>
                      <td className="px-3 py-2 text-gray-700">{poojariOf(r) ? personName({ name: poojariOf(r) }, lang) : '—'}</td>
                      <td className="px-3 py-2"><span className={`text-xs font-medium ${statusOf(r) === 'Pending' ? 'text-amber-600' : 'text-emerald-700'}`}>{tr(statusOf(r))}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-6 pt-4 border-t border-gray-200 text-center text-xs text-gray-500">
                <p><T>Generated on</T>: {stamp(new Date().toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }))}</p>
                <p className="mt-1">Sri Shirdi Sai Baba Temple · Pooja Report</p>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 no-print">
              <button onClick={() => setShowPrintModal(false)} className="btn-outline"><T>Close</T></button>
              <button onClick={() => window.print()} className="btn-maroon"><Printer size={15} /> <T>Print Report</T></button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function QueueCard({ b, lang, user, isAdmin, isQueueMode, isToday, busy, poojaris, onPerform, onUndo, onReassign }) {
  const performed = !!b.performed_on
  const finished = b.status === 'Completed' || b.remaining === 0
  const isDone = performed || finished
  const canUndo = isQueueMode && isToday && b.done_today && (isAdmin || b.performed_by === user?.username)
  const who = b.performed_by_poojari ? personName({ name: b.performed_by_poojari }, lang) : null

  return (
    <div className={`bg-white rounded-xl border shadow-sm p-4 flex flex-col sm:flex-row sm:items-center gap-4 ${isDone ? 'border-emerald-300 bg-gradient-to-r from-emerald-50/70 to-white' : 'border-gray-200'}`}>
      <div className={`w-24 shrink-0 rounded-lg p-2 text-center ${isDone ? 'bg-emerald-100' : 'bg-maroon-50'}`}>
        {!isQueueMode ? (
          <>
            <div className="text-[0.6875rem] text-emerald-600"><T>Performed</T></div>
            <div className="text-sm font-bold text-emerald-700">{fmtDate(b.performed_on)}</div>
          </>
        ) : (
          <>
            <div className="text-[0.6875rem] text-maroon-600 flex items-center justify-center gap-1"><Clock size={11} />{' '}<T>Slot</T></div>
            <div className="text-sm font-bold text-maroon-700">{b.time_slot ? clock12(b.time_slot) : tr('Any time')}</div>
          </>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="font-semibold text-gray-800">
          {tr(b.pooja)}
          {b.plan && <span className="text-maroon-600 font-normal"> · {tr(b.plan)}</span>}
        </div>
        <div className="text-[0.8125rem] text-gray-500 flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
          <span className="flex items-center gap-1"><User size={12} /> {personName({ name: b.devotee_name, name_te: b.devotee_name_te }, lang)}</span>
          {b.mobile && <span className="flex items-center gap-1"><Phone size={12} /> {b.mobile}</span>}
          <span className="text-maroon-600 font-mono text-[0.75rem] bg-maroon-50 px-1.5 py-0.5 rounded">#{b.ticket_no || b.booking_code}</span>
        </div>
        {(b.gothram || b.nakshatram || b.beneficiary_name) && (
          <div className="text-[0.6875rem] text-gray-500 mt-0.5">
            {b.beneficiary_name ? `${tr('For')} ${personName({ name: b.beneficiary_name }, lang)} · ` : ''}
            {b.gothram ? `${tr(b.gothram)} ${tr('gothram')}` : ''}{b.gothram && b.nakshatram ? ' · ' : ''}
            {b.nakshatram ? `${tr(b.nakshatram)} ${tr('nakshatram')}` : ''}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          {(b.remaining === null || (b.performances_allowed && b.performances_allowed > 1)) && (
            <span className="text-[0.6875rem] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
              {b.remaining === null ? tr('Ongoing · Life Long') : `${b.performances_done} / ${b.performances_allowed} ${tr('performed')} · ${b.remaining} ${tr('left')}`}
              {b.valid_until ? ` · ${tr('valid till')} ${fmtDate(b.valid_until)}` : ''}
            </span>
          )}
          {isQueueMode && !isAdmin && b.poojari_id && !b.assigned_to_me && (
            <span className="text-[0.6875rem] text-gray-600 bg-gray-100 rounded px-2 py-0.5">{tr('Assigned to')} {personName({ name: b.poojari_name }, lang)}</span>
          )}
          {b.repeat && (
            <span className="inline-flex items-center gap-1 text-[0.6875rem] font-semibold text-violet-700 bg-violet-50 border border-violet-200 rounded-full px-2 py-0.5">
              <Repeat size={11} /> {tr('Repeat devotee')} · {b.visits} {tr(b.visits === 1 ? 'visit' : 'visits')}{b.last_visit ? ` · ${tr('last')} ${fmtDate(b.last_visit)}` : ''}
            </span>
          )}
        </div>
        {performed && (who || b.performed_at) && (
          <div className="text-[0.6875rem] text-emerald-700 mt-1">
            {tr('Performed')}{who ? ` ${tr('by')} ${who}` : ''}{b.performed_at ? ` · ${fmtTime(b.performed_at)}` : ''}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {isAdmin && isQueueMode && !finished && (
          <div className="w-44" title={tr('Assign poojari')}>
            <Select className="input !py-1.5 text-[0.8125rem]" value={b.poojari_id ? String(b.poojari_id) : ''} disabled={busy}
              onChange={(e) => onReassign(b, e.target.value)}>
              <option value="">{tr('Unassigned')}</option>
              {poojaris.map((p) => <option key={p.id} value={String(p.id)}>{personName(p, lang)}</option>)}
            </Select>
          </div>
        )}
        {!isQueueMode || b.done_today ? (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 text-white px-3 py-1.5 text-[0.8125rem] font-bold shadow-sm">
              <CheckCircle2 size={15} /> {isQueueMode ? tr('Performed today') : tr('Performed')}
            </span>
            {canUndo && (
              <button onClick={() => onUndo(b)} disabled={busy} title={tr('Undo')} aria-label={tr('Undo')}
                className="w-9 h-9 grid place-items-center rounded-lg border border-gray-200 text-gray-600 hover:text-red-600 hover:border-red-300 disabled:opacity-50">
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Undo2 size={15} />}
              </button>
            )}
          </>
        ) : finished ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-400 text-white px-3 py-1.5 text-[0.8125rem] font-bold"><CheckCircle2 size={15} /> <T>Completed</T></span>
        ) : isToday ? (
          <button onClick={() => onPerform(b)} disabled={busy} className="btn-maroon !py-2 disabled:opacity-60">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
            {tr('Mark Performed')}
          </button>
        ) : (
          <span className="text-[0.75rem] text-gray-500"><T>Due on this day</T></span>
        )}
      </div>
    </div>
  )
}
