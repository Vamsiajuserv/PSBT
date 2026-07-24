import React, { useCallback, useEffect, useState } from 'react'
import {
  Clock, User, Phone, CheckCircle2, RotateCcw, Repeat, Flame, Loader2,
} from 'lucide-react'
import { PageHeader } from '../../components/common/UI.jsx'
import { LoadingBlock, ErrorBlock } from '../../components/common/states.jsx'
import { useAuth } from '../../auth/AuthContext.jsx'
import { PoojarisAPI, BookingsAPI, ApiError } from '../../api/client.js'
import { DateField } from '../../components/common/Field.jsx'
import { confirmDialog } from '../../components/common/Dialog.jsx'
import { T, tr } from '../../i18n/LanguageContext.jsx'

const todayISO = () => new Date().toISOString().slice(0, 10)
const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''

const STATUS_PILL = {
  Completed: 'bg-emerald-50 text-emerald-700',
  Confirmed: 'bg-amber-50 text-amber-700',
  Pending: 'bg-gray-100 text-gray-500',
}

export default function PoojariQueue() {
  const { user } = useAuth()
  const linked = !!user?.poojari_id            // only a linked Poojari can filter to "mine"
  const [day, setDay] = useState(todayISO())
  const [mine, setMine] = useState(false)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(() => {
    setLoading(true); setError('')
    PoojarisAPI.queue({ day, mine })
      .then((r) => setData(r))
      .catch((e) => setError(e instanceof ApiError ? e.detail : 'Could not load the pooja queue.'))
      .finally(() => setLoading(false))
  }, [day, mine])
  useEffect(() => { load() }, [load])

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
    if (!(await confirmDialog({ title: `Mark all ${due} due pooja(s) as performed?`, message: 'Each will be recorded as performed for today.', confirmLabel: 'Mark All' }))) return
    setError('')
    try {
      const r = await PoojarisAPI.completeDue({ mine })
      load()
      if (r.skipped?.length) setError(`${r.completed} performed · ${r.skipped.length} skipped (quota exhausted).`)
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Bulk action failed.')
    }
  }

  const items = data?.items || []
  const pending = items.filter((i) => !i.done_today && i.status === 'Confirmed' && (i.remaining === null || i.remaining > 0)).length
  const done = items.filter((i) => i.done_today || i.status === 'Completed').length

  return (
    <div>
      <PageHeader title={tr("My Poojas")} subtitle="Today's pooja queue — verify the ticket and mark each pooja performed" />

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div>
          <label className="label"><T>Date</T></label>
          <div className="relative mt-1">
            <DateField value={day} onChange={(e) => setDay(e.target.value)}
              className="" title={tr("Open a future day to prepare — performing is only possible for today")} />
          </div>
        </div>
        {linked && (
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {[['all', 'All poojas', false], ['mine', 'Assigned to me', true]].map(([k, lbl, val]) => (
              <button key={k} onClick={() => setMine(val)}
                className={`px-4 py-2 text-[0.8125rem] font-semibold transition ${mine === val ? 'bg-maroon-700 text-cream' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                {lbl}
              </button>
            ))}
          </div>
        )}
        <button onClick={load} className="btn-outline !py-2"><RotateCcw size={15} />{' '}<T>Refresh</T></button>
        {day === todayISO() && pending > 0 && (
          <button onClick={markAllDue} className="btn-maroon !py-2"><CheckCircle2 size={15} /> Mark all due ({pending})</button>
        )}
        <div className="ml-auto flex items-center gap-4 text-[0.8125rem]">
          <span className="text-amber-700 font-semibold">{pending} to perform</span>
          <span className="text-emerald-700 font-semibold">{done} done</span>
        </div>
      </div>

      {loading ? (
        <LoadingBlock label="Loading pooja queue…" />
      ) : error ? (
        <ErrorBlock message={error} onRetry={load} />
      ) : items.length === 0 ? (
        <div className="card p-10 text-center text-gray-500">
          <Flame size={32} className="mx-auto text-gold-300 mb-3" />
          No poojas {mine ? 'assigned to you ' : ''}for {fmtDate(day)}.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((b) => (
            <div key={b.id} className={`card p-4 flex flex-col sm:flex-row sm:items-center gap-4 ${b.done_today || b.status === 'Completed' || b.remaining === 0 ? 'opacity-75 bg-emerald-50/40 border-emerald-100' : ''}`}>
              {/* Time */}
              <div className="w-20 shrink-0 text-center">
                <div className="text-[0.6875rem] text-gray-400 flex items-center justify-center gap-1"><Clock size={11} />{' '}<T>Slot</T></div>
                <div className="text-sm font-bold text-maroon-700">{b.time_slot || '—'}</div>
              </div>
              {/* Pooja + devotee */}
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-800">{b.pooja}{b.plan ? <span className="text-gray-400 font-normal"> · {b.plan}</span> : null}</div>
                <div className="text-[0.8125rem] text-gray-500 flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                  <span className="flex items-center gap-1"><User size={12} /> {b.devotee_name}</span>
                  {b.mobile && <span className="flex items-center gap-1"><Phone size={12} /> {b.mobile}</span>}
                  <span className="text-gray-400">#{b.ticket_no || b.booking_code}</span>
                </div>
                {(b.gothram || b.nakshatram || b.beneficiary_name) && (
                  <div className="text-[0.6875rem] text-gray-500 mt-0.5">
                    {b.beneficiary_name ? `For ${b.beneficiary_name} · ` : ''}
                    {b.gothram ? `${b.gothram} gothram` : ''}{b.gothram && b.nakshatram ? ' · ' : ''}
                    {b.nakshatram ? `${b.nakshatram} nakshatram` : ''}
                  </div>
                )}
                {(b.remaining === null || (b.performances_allowed && b.performances_allowed > 1)) && (
                  <div className="text-[0.6875rem] text-amber-700 mt-0.5">
                    {b.remaining === null
                      ? 'Ongoing · Life Long'
                      : `${b.performances_done} of ${b.performances_allowed} performed · ${b.remaining} left`}
                    {b.valid_until ? ` · valid till ${fmtDate(b.valid_until)}` : ''}
                  </div>
                )}
                {b.repeat && (
                  <div className="mt-1.5 inline-flex items-center gap-1.5 text-[0.6875rem] font-semibold text-violet-700 bg-violet-50 rounded-full px-2 py-0.5">
                    <Repeat size={11} /> Repeat devotee · {b.visits} visit{b.visits === 1 ? '' : 's'}
                    {b.last_visit ? ` · last ${fmtDate(b.last_visit)}` : ''}
                  </div>
                )}
              </div>
              {/* Status + action */}
              <div className="flex items-center gap-3 shrink-0">
                {b.done_today ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 text-emerald-700 px-3 py-1.5 text-[0.8125rem] font-bold"><CheckCircle2 size={15} />{' '}<T>Performed today</T></span>
                ) : (b.status === 'Completed' || b.remaining === 0) ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 text-gray-500 px-3 py-1.5 text-[0.8125rem] font-bold"><CheckCircle2 size={15} />{' '}<T>All performances completed</T></span>
                ) : (
                  <button onClick={() => markPerformed(b.id)} disabled={busyId === b.id}
                    className="btn-maroon !py-2 disabled:opacity-60">
                    {busyId === b.id ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                    Mark Performed
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
