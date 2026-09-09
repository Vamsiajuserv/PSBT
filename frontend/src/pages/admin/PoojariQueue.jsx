import React, { useCallback, useEffect, useState } from 'react'
import {
  Clock, User, Phone, CheckCircle2, RotateCcw, Repeat, Flame, Loader2, Download, Printer, X,
} from 'lucide-react'
import { PageHeader } from '../../components/common/UI.jsx'
import { LoadingBlock, ErrorBlock } from '../../components/common/states.jsx'
import { useAuth } from '../../auth/AuthContext.jsx'
import { PoojarisAPI, BookingsAPI, ApiError } from '../../api/client.js'
import { DateField } from '../../components/common/Field.jsx'
import { confirmDialog } from '../../components/common/Dialog.jsx'
import { T, tr, clock12, personName, useLang, stamp } from '../../i18n/LanguageContext.jsx'

const todayISO = () => new Date().toISOString().slice(0, 10)
const yesterdayISO = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10) }
const weekStartISO = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0, 10) }
const monthStartISO = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10) }

const fmtDate = (iso) =>
  iso ? stamp(new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })) : ''

// Date presets for quick selection
const DATE_PRESETS = [
  { key: 'today', label: 'Today', getRange: () => ({ start: todayISO(), end: todayISO(), isRange: false }) },
  { key: 'yesterday', label: 'Yesterday', getRange: () => ({ start: yesterdayISO(), end: yesterdayISO(), isRange: true }) },
  { key: 'week', label: 'This Week', getRange: () => ({ start: weekStartISO(), end: todayISO(), isRange: true }) },
  { key: 'month', label: 'This Month', getRange: () => ({ start: monthStartISO(), end: todayISO(), isRange: true }) },
  { key: 'custom', label: 'Custom', getRange: () => null },
]

const STATUS_PILL = {
  Completed: 'bg-emerald-50 text-emerald-700',
  Confirmed: 'bg-amber-50 text-amber-700',
  Pending: 'bg-gray-100 text-gray-500',
}

export default function PoojariQueue() {
  const { lang } = useLang()
  const { user } = useAuth()
  const linked = !!user?.poojari_id            // only a linked Poojari can filter to "mine"
  // "My Poojas" only reads right for the Poojari performing them; an
  // Administrator opening the same screen is looking at the temple's queue.
  const isPoojari = user?.role === 'Poojari'
  const name = personName(user, lang) || tr('Administrator')
  const role = user?.role === 'Admin' ? 'Administrator' : (user?.role || '')

  // Date state - supports both single day and range
  const [datePreset, setDatePreset] = useState('today')
  const [startDate, setStartDate] = useState(todayISO())
  const [endDate, setEndDate] = useState(todayISO())
  const [isRangeMode, setIsRangeMode] = useState(false)

  const [mine, setMine] = useState(false)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [showPrintModal, setShowPrintModal] = useState(false)

  // Handle preset selection
  const selectPreset = (preset) => {
    setDatePreset(preset.key)
    if (preset.key !== 'custom') {
      const range = preset.getRange()
      if (range) {
        setStartDate(range.start)
        setEndDate(range.end)
        setIsRangeMode(range.isRange)
      }
    }
  }

  // Handle manual date change - switch to custom
  const handleStartChange = (e) => {
    setStartDate(e.target.value)
    setDatePreset('custom')
    setIsRangeMode(true)
  }
  const handleEndChange = (e) => {
    setEndDate(e.target.value)
    setDatePreset('custom')
    setIsRangeMode(true)
  }

  const load = useCallback(() => {
    setLoading(true); setError('')
    const params = isRangeMode
      ? { start: startDate, end: endDate, mine }
      : { day: startDate, mine }
    PoojarisAPI.queue(params)
      .then((r) => setData(r))
      .catch((e) => setError(e instanceof ApiError ? e.detail : 'Could not load the pooja queue.'))
      .finally(() => setLoading(false))
  }, [startDate, endDate, isRangeMode, mine])
  useEffect(() => { load() }, [load])

  // Download CSV
  const downloadCSV = () => {
    const items = data?.items || []
    if (!items.length) return
    const headers = ['Date', 'Time', 'Pooja', 'Plan', 'Devotee', 'Mobile', 'Ticket No', 'Amount', 'Status']
    const csvRows = [headers.join(',')]
    for (const r of items) {
      const row = [
        r.performed_on || startDate,
        r.time_slot || '',
        `"${(r.pooja || '').replace(/"/g, '""')}"`,
        r.plan || '',
        `"${(r.devotee_name || '').replace(/"/g, '""')}"`,
        r.mobile || '',
        r.ticket_no || r.booking_code || '',
        r.amount || 0,
        r.done_today ? 'Performed' : r.status,
      ]
      csvRows.push(row.join(','))
    }
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Pooja_Queue_${startDate}${isRangeMode ? `_to_${endDate}` : ''}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function markPerformed(id) {
    setBusyId(id); setError('')
    try {
      await BookingsAPI.complete(id)
      load()
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Could not mark the pooja performed.')
    } finally {
      setBusyId(null)
    }
  }

  // Festival days / the daily nithya ritual: perform everything due in one action.
  async function markAllDue() {
    const due = (data?.items || []).filter((i) => !i.done_today && i.status === 'Confirmed' && (i.remaining === null || i.remaining > 0)).length
    if (!due) return
    if (!(await confirmDialog({ title: `${tr('Mark all due poojas as performed?')} (${due})`, message: tr('Each will be recorded as performed for today.'), confirmLabel: tr('Mark All') }))) return
    setError('')
    try {
      const r = await PoojarisAPI.completeDue({ mine })
      load()
      if (r.skipped?.length) setError(`${r.completed} ${tr('performed')} · ${r.skipped.length} ${tr('skipped (quota exhausted).')}`)
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Bulk action failed.')
    }
  }

  const items = data?.items || []
  const pending = items.filter((i) => !i.done_today && i.status === 'Confirmed' && (i.remaining === null || i.remaining > 0)).length
  const done = items.filter((i) => i.done_today || i.status === 'Completed').length

  return (
    <div>
      <PageHeader title={isPoojari ? tr("My Poojas") : tr("Pooja Queue")}
        subtitle={`${tr('Welcome back,')} ${name}${role && !name.includes(role) ? ` (${tr(role)})` : ''}`} />

      {/* Date Presets */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-[0.75rem] text-gray-500 font-medium"><T>Quick Select</T>:</span>
        {DATE_PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => selectPreset(p)}
            className={`px-3 py-1.5 rounded-full text-[0.75rem] font-semibold border transition ${
              datePreset === p.key
                ? 'bg-maroon-600 text-white border-maroon-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-maroon-300 hover:text-maroon-700'
            }`}
          >
            {tr(p.label)}
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div>
          <label className="label"><T>From</T></label>
          <DateField value={startDate} onChange={handleStartChange} className="mt-1" />
        </div>
        <div>
          <label className="label"><T>To</T></label>
          <DateField value={endDate} onChange={handleEndChange} className="mt-1" />
        </div>
        {linked && (
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {[['all', 'All poojas', false], ['mine', 'Assigned to me', true]].map(([k, lbl, val]) => (
              <button key={k} onClick={() => setMine(val)}
                className={`px-4 py-2 text-[0.8125rem] font-semibold transition ${mine === val ? 'bg-maroon-700 text-cream' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                {tr(lbl)}
              </button>
            ))}
          </div>
        )}
        <button onClick={load} className="btn-outline !py-2"><RotateCcw size={15} />{' '}<T>Refresh</T></button>
        {!isRangeMode && startDate === todayISO() && pending > 0 && (
          <button onClick={markAllDue} className="btn-maroon !py-2"><CheckCircle2 size={15} /> {tr('Mark all due')} ({pending})</button>
        )}

        {/* Action buttons */}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={downloadCSV} disabled={!items.length} className="btn-outline !py-2 disabled:opacity-50" title={tr("Download CSV")}>
            <Download size={15} /> <T>Download</T>
          </button>
          <button onClick={() => setShowPrintModal(true)} disabled={!items.length} className="btn-outline !py-2 disabled:opacity-50" title={tr("Print")}>
            <Printer size={15} /> <T>Print</T>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-[0.8125rem] mb-4">
        <span className="text-gray-600">{items.length} {tr('total')}</span>
        {!isRangeMode && <span className="text-amber-700 font-semibold">{pending} {tr('to perform')}</span>}
        <span className="text-emerald-700 font-semibold">{done} {tr('done')}</span>
      </div>

      {loading ? (
        <LoadingBlock label={tr("Loading pooja queue…")} />
      ) : error ? (
        <ErrorBlock message={error} onRetry={load} />
      ) : items.length === 0 ? (
        <div className="card p-10 text-center text-gray-500">
          <Flame size={32} className="mx-auto text-gold-300 mb-3" />
          {mine ? tr('No poojas assigned to you for') : tr('No poojas for')} {isRangeMode ? `${fmtDate(startDate)} - ${fmtDate(endDate)}` : fmtDate(startDate)}.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((b) => (
            <div key={b.id} className={`card p-4 flex flex-col sm:flex-row sm:items-center gap-4 ${b.done_today || b.status === 'Completed' || b.remaining === 0 || b.performed_on ? 'opacity-75 bg-emerald-50/40 border-emerald-100' : ''}`}>
              {/* Time / Date */}
              <div className="w-24 shrink-0 text-center">
                {isRangeMode && b.performed_on ? (
                  <>
                    <div className="text-[0.6875rem] text-gray-600"><T>Performed</T></div>
                    <div className="text-sm font-bold text-emerald-700">{fmtDate(b.performed_on)}</div>
                  </>
                ) : (
                  <>
                    <div className="text-[0.6875rem] text-gray-600 flex items-center justify-center gap-1"><Clock size={11} />{' '}<T>Slot</T></div>
                    <div className="text-sm font-bold text-maroon-700">{clock12(b.time_slot) || '—'}</div>
                  </>
                )}
              </div>
              {/* Pooja + devotee */}
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-800">{tr(b.pooja)}{b.plan ? <span className="text-gray-600 font-normal"> · {tr(b.plan)}</span> : null}</div>
                <div className="text-[0.8125rem] text-gray-500 flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                  <span className="flex items-center gap-1"><User size={12} /> {personName({ name: b.devotee_name, name_te: b.devotee_name_te }, lang)}</span>
                  {b.mobile && <span className="flex items-center gap-1"><Phone size={12} /> {b.mobile}</span>}
                  <span className="text-gray-600">#{b.ticket_no || b.booking_code}</span>
                </div>
                {(b.gothram || b.nakshatram || b.beneficiary_name) && (
                  <div className="text-[0.6875rem] text-gray-500 mt-0.5">
                    {b.beneficiary_name ? `${tr('For')} ${personName({ name: b.beneficiary_name }, lang)} · ` : ''}
                    {b.gothram ? `${tr(b.gothram)} ${tr('gothram')}` : ''}{b.gothram && b.nakshatram ? ' · ' : ''}
                    {b.nakshatram ? `${tr(b.nakshatram)} ${tr('nakshatram')}` : ''}
                  </div>
                )}
                {(b.remaining === null || (b.performances_allowed && b.performances_allowed > 1)) && (
                  <div className="text-[0.6875rem] text-amber-700 mt-0.5">
                    {b.remaining === null
                      ? tr('Ongoing · Life Long')
                      : `${b.performances_done} / ${b.performances_allowed} ${tr('performed')} · ${b.remaining} ${tr('left')}`}
                    {b.valid_until ? ` · ${tr('valid till')} ${fmtDate(b.valid_until)}` : ''}
                  </div>
                )}
                {b.repeat && (
                  <div className="mt-1.5 inline-flex items-center gap-1.5 text-[0.6875rem] font-semibold text-violet-700 bg-violet-50 rounded-full px-2 py-0.5">
                    <Repeat size={11} /> {tr('Repeat devotee')} · {b.visits} {tr(b.visits === 1 ? 'visit' : 'visits')}
                    {b.last_visit ? ` · ${tr('last')} ${fmtDate(b.last_visit)}` : ''}
                  </div>
                )}
              </div>
              {/* Status + action */}
              <div className="flex items-center gap-3 shrink-0">
                {isRangeMode && b.performed_on ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 text-emerald-700 px-3 py-1.5 text-[0.8125rem] font-bold">
                    <CheckCircle2 size={15} /> <T>Performed</T>
                  </span>
                ) : b.done_today ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 text-emerald-700 px-3 py-1.5 text-[0.8125rem] font-bold"><CheckCircle2 size={15} />{' '}<T>Performed today</T></span>
                ) : (b.status === 'Completed' || b.remaining === 0) ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 text-gray-500 px-3 py-1.5 text-[0.8125rem] font-bold"><CheckCircle2 size={15} />{' '}<T>All performances completed</T></span>
                ) : (
                  <button onClick={() => markPerformed(b.id)} disabled={busyId === b.id}
                    className="btn-maroon !py-2 disabled:opacity-60">
                    {busyId === b.id ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                    {tr('Mark Performed')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Print Modal */}
      {showPrintModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto print-modal" onClick={() => setShowPrintModal(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl shadow-xl w-full max-w-4xl my-auto max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between no-print">
              <div>
                <h3 className="font-bold text-gray-900 text-lg"><T>Print Pooja Report</T></h3>
                <p className="text-sm text-gray-500">
                  {isRangeMode ? `${fmtDate(startDate)} — ${fmtDate(endDate)}` : fmtDate(startDate)} · {items.length} {tr('records')}
                </p>
              </div>
              <button onClick={() => setShowPrintModal(false)} className="text-gray-400 hover:text-maroon-700"><X size={20} /></button>
            </div>

            {/* Printable Content */}
            <div className="flex-1 overflow-y-auto p-6" id="print-pooja-queue">
              {/* Header */}
              <div className="text-center mb-6 print-header">
                <h1 className="font-serif text-xl font-bold text-maroon-800">Sri Shirdi Sai Baba Temple</h1>
                <p className="text-sm text-gray-600">శ్రీ షిర్డీ సాయిబాబా దేవస్థానం</p>
                <h2 className="text-lg font-semibold text-gray-800 mt-3">
                  {isPoojari ? tr("Pooja Performance Report") : tr("Pooja Queue Report")}
                </h2>
                <p className="text-sm text-gray-600">
                  <T>Date</T>: {isRangeMode ? `${fmtDate(startDate)} — ${fmtDate(endDate)}` : fmtDate(startDate)}
                  {mine && user?.poojari_id && <span> · <T>Poojari</T>: {user?.name || user?.username}</span>}
                </p>
              </div>

              {/* Summary */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-gray-800">{items.length}</div>
                  <div className="text-xs text-gray-500"><T>Total Poojas</T></div>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-emerald-700">{done}</div>
                  <div className="text-xs text-emerald-600"><T>Performed</T></div>
                </div>
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-blue-700">₹{items.reduce((s, r) => s + (r.amount || 0), 0).toLocaleString('en-IN')}</div>
                  <div className="text-xs text-blue-600"><T>Total Amount</T></div>
                </div>
              </div>

              {/* Table */}
              <table className="w-full text-sm border border-gray-200">
                <thead>
                  <tr className="bg-gray-100 text-left text-xs uppercase text-gray-700">
                    <th className="px-3 py-2 border-b font-semibold">{tr('Date')}</th>
                    <th className="px-3 py-2 border-b font-semibold">{tr('Time')}</th>
                    <th className="px-3 py-2 border-b font-semibold">{tr('Pooja')}</th>
                    <th className="px-3 py-2 border-b font-semibold">{tr('Devotee')}</th>
                    <th className="px-3 py-2 border-b font-semibold">{tr('Mobile')}</th>
                    <th className="px-3 py-2 border-b font-semibold">{tr('Ticket')}</th>
                    <th className="px-3 py-2 border-b font-semibold text-right">{tr('Amount')}</th>
                    <th className="px-3 py-2 border-b font-semibold">{tr('Status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{fmtDate(r.performed_on || startDate)}</td>
                      <td className="px-3 py-2 text-gray-600">{clock12(r.time_slot) || '—'}</td>
                      <td className="px-3 py-2 text-gray-800">{r.pooja}{r.plan ? ` · ${r.plan}` : ''}</td>
                      <td className="px-3 py-2 text-gray-700">{r.devotee_name}</td>
                      <td className="px-3 py-2 text-gray-600">{r.mobile || '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs text-gray-600">{r.ticket_no || r.booking_code}</td>
                      <td className="px-3 py-2 text-gray-800 font-semibold text-right">₹{(r.amount || 0).toLocaleString('en-IN')}</td>
                      <td className="px-3 py-2">
                        <span className={`text-xs font-medium ${r.done_today || r.performed_on ? 'text-emerald-700' : 'text-amber-600'}`}>
                          {r.done_today || r.performed_on ? tr('Performed') : tr('Pending')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-semibold">
                    <td colSpan={6} className="px-3 py-2 text-right text-gray-700"><T>Total</T>:</td>
                    <td className="px-3 py-2 text-right text-maroon-700">₹{items.reduce((s, r) => s + (r.amount || 0), 0).toLocaleString('en-IN')}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>

              {/* Footer */}
              <div className="mt-6 pt-4 border-t border-gray-200 text-center text-xs text-gray-500">
                <p><T>Generated on</T>: {new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                <p className="mt-1">Sri Shirdi Sai Baba Temple · Pooja Report</p>
              </div>
            </div>

            {/* Actions */}
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
