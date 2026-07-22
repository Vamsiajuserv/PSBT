import React, { useRef, useState } from 'react'
import {
  ScanLine, Search, CheckCircle2, XCircle, User, Phone, CalendarDays, Clock,
  Repeat, Loader2, RotateCcw,
} from 'lucide-react'
import { PageHeader } from '../../components/common/UI.jsx'
import { BookingsAPI, ApiError } from '../../api/client.js'

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''

export default function VerifyTicket() {
  const [ticket, setTicket] = useState('')
  const [result, setResult] = useState(null)      // lookup response
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [marking, setMarking] = useState(false)
  const inputRef = useRef(null)

  async function verify(e) {
    e?.preventDefault()
    const code = ticket.trim()
    if (!code) { setError('Enter or scan a ticket / receipt number.'); return }
    setBusy(true); setError(''); setResult(null)
    try {
      setResult(await BookingsAPI.lookup(code))
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Verification failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function markPerformed() {
    if (!result) return
    setMarking(true); setError('')
    try {
      await BookingsAPI.complete(result.id)
      const done = (result.performances_done || 0) + 1
      const allowed = result.performances_allowed
      const remaining = allowed == null ? null : Math.max(0, allowed - done)
      const completed = allowed != null && remaining <= 0
      setResult({
        ...result, performances_done: done, remaining, valid: false,
        status: completed ? 'Completed' : result.status,
        verdict: completed ? 'All performances completed' : 'Performed — done for today',
      })
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Could not mark the pooja performed.')
    } finally {
      setMarking(false)
    }
  }

  function reset() {
    setTicket(''); setResult(null); setError(''); inputRef.current?.focus()
  }

  const ok = result?.valid

  return (
    <div className="max-w-2xl">
      <PageHeader title="Verify Ticket" subtitle="Scan or enter a devotee's ticket number to verify before performing the pooja" />

      {/* Entry */}
      <form onSubmit={verify} className="card p-5">
        <label className="label">Ticket / Receipt Number</label>
        <div className="flex gap-2 mt-1">
          <div className="relative flex-1">
            <ScanLine size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input ref={inputRef} autoFocus value={ticket}
              onChange={(e) => setTicket(e.target.value)}
              placeholder="e.g. RCPT2607210001"
              className="input !pl-10 font-mono" />
          </div>
          <button type="submit" disabled={busy} className="btn-maroon disabled:opacity-60">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Verify
          </button>
          {(result || error) && (
            <button type="button" onClick={reset} className="btn-outline" title="Clear"><RotateCcw size={16} /></button>
          )}
        </div>
        <p className="text-[0.75rem] text-gray-400 mt-2">Tip: a barcode/QR scanner types the number and submits automatically.</p>
      </form>

      {error && (
        <div className="mt-4 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          <XCircle size={18} className="shrink-0" /> {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="mt-4 card overflow-hidden">
          {/* Verdict banner */}
          <div className={`px-5 py-3 flex items-center gap-2 font-semibold ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
            {ok ? <CheckCircle2 size={20} /> : <XCircle size={20} />} {result.verdict}
          </div>

          <div className="p-5 space-y-4">
            <div>
              <div className="text-lg font-bold text-gray-800">{result.pooja}{result.plan ? <span className="text-gray-400 font-normal"> · {result.plan}</span> : null}</div>
              <div className="text-[0.75rem] text-gray-400 font-mono mt-0.5">#{result.ticket_no || result.booking_code}</div>
            </div>

            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-[0.8125rem]">
              <Field icon={User} label="Devotee" value={result.devotee_name} />
              {result.mobile && <Field icon={Phone} label="Mobile" value={result.mobile} />}
              <Field icon={CalendarDays} label="Scheduled" value={fmtDate(result.scheduled_date)} />
              <Field icon={Clock} label="Slot" value={result.time_slot || '—'} />
              <Field label="Status" value={result.status} />
              <Field label="Payment" value={result.payment_status} />
              {result.gothram && <Field label="Gothram" value={result.gothram} />}
              {result.nakshatram && <Field label="Nakshatram" value={result.nakshatram} />}
              {result.beneficiary_name && <Field label="In the name of" value={result.beneficiary_name} />}
              {result.vehicle_no && <Field label="Vehicle" value={result.vehicle_no} />}
              {result.poojari_name && <Field label="Assigned Poojari" value={result.poojari_name} />}
              <Field label="Amount" value={`₹ ${Number(result.amount || 0).toLocaleString('en-IN')}`} />
              {result.performances_allowed != null
                ? <Field label="Performances" value={`${result.performances_done} of ${result.performances_allowed} · ${result.remaining} left`} />
                : <Field label="Validity" value="Life Long · ongoing" />}
              {result.valid_until && <Field icon={CalendarDays} label="Valid until" value={fmtDate(result.valid_until)} />}
            </div>

            {result.repeat && (
              <div className="inline-flex items-center gap-1.5 text-[0.75rem] font-semibold text-violet-700 bg-violet-50 rounded-full px-3 py-1">
                <Repeat size={13} /> Repeat devotee · {result.visits} previous visit{result.visits === 1 ? '' : 's'}
                {result.last_visit ? ` · last ${fmtDate(result.last_visit)}` : ''}
              </div>
            )}

            {ok && (
              <button onClick={markPerformed} disabled={marking}
                className="btn-maroon w-full justify-center disabled:opacity-60">
                {marking ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Mark Pooja Performed
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2">
      {Icon && <Icon size={14} className="text-gray-400 shrink-0" />}
      <span className="text-gray-400">{label}:</span>
      <span className="font-semibold text-gray-700">{value}</span>
    </div>
  )
}
