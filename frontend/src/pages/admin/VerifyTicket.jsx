import React, { useRef, useState } from 'react'
import {
  ScanLine, Search, CheckCircle2, XCircle, User, Phone, CalendarDays, Clock,
  Repeat, Loader2, RotateCcw, Undo2, AlertTriangle,
} from 'lucide-react'
import { PageHeader } from '../../components/common/UI.jsx'
import { BookingsAPI, ApiError, getErrorMessage } from '../../api/client.js'
import { confirmDialog } from '../../components/common/Dialog.jsx'
import { T, tr, clock12, personName, useLang, teText, stamp } from '../../i18n/LanguageContext.jsx'

const fmtDate = (iso) =>
  iso ? stamp(new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })) : ''
const fmtTime = (iso) =>
  iso ? clock12(new Date(/[Z+]/.test(iso.slice(19)) ? iso : iso + 'Z').toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })) : ''

// The server returns a verdict code (+ date); wording and translation happen here.
function verdictText(r) {
  const d = fmtDate(r.verdict_date)
  switch (r.verdict_code) {
    case 'valid': return tr('Valid — proceed with the pooja')
    case 'done_today': return tr('Already performed today')
    case 'completed': return tr('All performances completed')
    case 'cancelled': return tr('Cancelled — not valid')
    case 'unpaid': return tr('Payment pending — send to counter')
    case 'expired': return tr('Expired on ${date}').replace('${date}', d)
    case 'not_started': return tr('Not started — valid from ${date}').replace('${date}', d)
    default: return tr(r.verdict)
  }
}

export default function VerifyTicket() {
  const { lang } = useLang()
  const [ticket, setTicket] = useState('')
  const [result, setResult] = useState(null)      // lookup response
  const [justMarked, setJustMarked] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [marking, setMarking] = useState(false)
  const inputRef = useRef(null)

  const lookup = (code) => BookingsAPI.lookup(code)

  async function verify(e) {
    e?.preventDefault()
    const code = ticket.trim()
    if (!code) { setError(tr('Enter or scan a ticket / receipt number.')); return }
    setBusy(true); setError(''); setResult(null); setJustMarked(false)
    try {
      setResult(await lookup(code))
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : tr('Verification failed. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  // Re-read the ticket after a change so the screen always shows the server's view
  // (count, verdict, who performed it).
  async function refresh() {
    setResult(await lookup(result.booking_code))
  }

  async function markPerformed() {
    if (!result) return
    setMarking(true); setError('')
    try {
      await BookingsAPI.complete(result.id)
      await refresh()
      setJustMarked(true)
    } catch (err) {
      setError(getErrorMessage(err, tr('Could not mark the pooja performed.')))
    } finally {
      setMarking(false)
    }
  }

  async function undo() {
    const ok = await confirmDialog({
      title: tr("Undo today's performance?"),
      message: `${tr(result.pooja)} · ${personName({ name: result.devotee_name }, lang)} — ${tr('the performance is given back to the ticket.')}`,
      tone: 'danger', confirmLabel: tr('Undo'),
    })
    if (!ok) return
    setMarking(true); setError('')
    try {
      await BookingsAPI.undoPerformed(result.id)
      await refresh()
      setJustMarked(false)
    } catch (err) {
      setError(getErrorMessage(err, tr('Could not undo the performance.')))
    } finally {
      setMarking(false)
    }
  }

  function reset() {
    setTicket(''); setResult(null); setError(''); setJustMarked(false); inputRef.current?.focus()
  }

  const ok = result?.valid
  const done = result?.verdict_code === 'done_today'
  const perf = result?.performed_today
  const single = result?.performances_allowed === 1

  return (
    <div className="max-w-2xl">
      <PageHeader title={tr('Verify Ticket')} subtitle={tr("Scan or enter a devotee's ticket number to verify before performing the pooja")} />

      {/* Entry */}
      <form onSubmit={verify} className="card p-5">
        <label className="label"><T>Ticket / Receipt Number</T></label>
        <div className="flex gap-2 mt-1">
          <div className="relative flex-1">
            <ScanLine size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none" />
            <input ref={inputRef} autoFocus value={ticket}
              onChange={(e) => setTicket(e.target.value)}
              placeholder={tr('e.g. TKT-2026-001318')}
              autoCapitalize="characters" autoCorrect="off" spellCheck={false}
              className="input !pl-10 font-mono uppercase placeholder:normal-case" />
          </div>
          <button type="submit" disabled={busy} className="btn-maroon disabled:opacity-60">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}{' '}<T>Verify</T>
          </button>
          {(result || error) && (
            <button type="button" onClick={reset} className="btn-outline" title={tr('Clear')}><RotateCcw size={16} /></button>
          )}
        </div>
        <p className="text-[0.75rem] text-gray-600 mt-2"><T>Tip: a barcode/QR scanner types the number and submits automatically.</T></p>
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
          <div className={`px-5 py-3 flex items-center gap-2 font-semibold ${ok || (justMarked && done) ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
            {ok || (justMarked && done) ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
            {justMarked && done ? tr('Performed — done for today') : verdictText(result)}
          </div>
          {done && perf && (perf.poojari_name || perf.performed_at || perf.can_undo) && (
            <div className="px-5 py-2 border-b border-emerald-100 bg-emerald-50/40 flex items-center gap-3 text-[0.8125rem] text-emerald-800">
              <span className="flex-1">
                {tr('Performed today')}
                {perf.poojari_name ? ` ${tr('by')} ${personName({ name: perf.poojari_name }, lang)}` : ''}
                {perf.performed_at ? ` · ${fmtTime(perf.performed_at)}` : ''}
              </span>
              {perf.can_undo && (
                <button onClick={undo} disabled={marking} className="inline-flex items-center gap-1 text-[0.75rem] font-semibold text-gray-600 hover:text-red-600 disabled:opacity-50">
                  {marking ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={13} />} <T>Undo</T>
                </button>
              )}
            </div>
          )}
          {result.slot_passed && (
            <div className="px-5 py-2 border-b border-amber-100 bg-amber-50/60 flex items-start gap-2 text-[0.8125rem] text-amber-800">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              <span>{tr("This ticket's time slot (${slot}) is over for today. You can still perform the pooja.").replace('${slot}', clock12(result.time_slot))}</span>
            </div>
          )}

          <div className="p-5 space-y-4">
            <div>
              <div className="text-lg font-bold text-gray-800">{tr(result.pooja)}{result.plan ? <span className="text-gray-600 font-normal"> · {tr(result.plan)}</span> : null}</div>
              <div className="text-[0.75rem] text-gray-600 font-mono mt-0.5">#{result.ticket_no || result.booking_code}</div>
            </div>

            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-[0.8125rem]">
              <Field icon={User} label={tr('Devotee')} value={personName({ name: result.devotee_name, name_te: result.devotee_name_te }, lang)} />
              {result.mobile && <Field icon={Phone} label={tr('Mobile')} value={result.mobile} />}
              <Field icon={CalendarDays} label={single ? tr('Pooja date') : tr('Valid from')} value={fmtDate(result.scheduled_date)} />
              <Field icon={Clock} label={tr('Slot')} value={result.time_slot ? clock12(result.time_slot) : tr('Any time')} />
              <Field label={tr('Status')} value={tr(result.status)} />
              <Field label={tr('Payment')} value={tr(result.payment_status)} />
              {result.gothram && <Field label={tr('Gothram')} value={tr(result.gothram)} />}
              {result.nakshatram && <Field label={tr('Nakshatram')} value={tr(result.nakshatram)} />}
              {result.beneficiary_name && <Field label={tr('In the name of')} value={personName({ name: result.beneficiary_name }, lang)} />}
              {result.vehicle_no && <Field label={tr('Vehicle')} value={result.vehicle_no} />}
              {result.poojari_name && <Field label={tr('Assigned Poojari')} value={personName({ name: result.poojari_name }, lang)} />}
              <Field label={tr('Amount')} value={`₹ ${Number(result.amount || 0).toLocaleString('en-IN')}`} />
              {result.performances_allowed != null
                ? <Field label={tr('Performances')} value={`${result.performances_done} ${tr('of')} ${result.performances_allowed} · ${result.remaining} ${tr('left')}`} />
                : <Field label={tr('Validity')} value={tr('Life Long · ongoing')} />}
              {result.valid_until && <Field icon={CalendarDays} label={tr('Valid until')} value={fmtDate(result.valid_until)} />}
            </div>

            {result.repeat && (
              <div className="inline-flex items-center gap-1.5 text-[0.75rem] font-semibold text-violet-700 bg-violet-50 rounded-full px-3 py-1">
                <Repeat size={13} /> <T>Repeat devotee</T> · {result.visits} {result.visits === 1 ? tr('previous visit') : tr('previous visits')}
                {result.last_visit ? ` · ${tr('last')} ${fmtDate(result.last_visit)}` : ''}
              </div>
            )}

            {ok && (
              <button onClick={markPerformed} disabled={marking}
                className="btn-maroon w-full justify-center disabled:opacity-60">
                {marking ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} <T>Mark Pooja Performed</T>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ icon: Icon, label, value }) {
  value = typeof value === 'string' ? teText(value) : value

  return (
    <div className="flex items-center gap-2">
      {Icon && <Icon size={14} className="text-gray-600 shrink-0" />}
      <span className="text-gray-600">{label}:</span>
      <span className="font-semibold text-gray-700">{value}</span>
    </div>
  )
}
