import React, { useEffect, useState, useCallback } from 'react'
import {
  IndianRupee, ListChecks, ClipboardCheck, Lock, RefreshCw,
  Wallet, Scale, CreditCard, Info, CheckCircle2, Unlock, ChevronDown, ChevronUp, Tags,
} from 'lucide-react'
import { inr, num, fmtStamp, KpiGrid } from '../../components/admin/ui.jsx'
import FitText from '../../components/common/FitText.jsx'
import { LoadingBlock, ErrorBlock } from '../../components/common/states.jsx'
import { DailyClosingAPI, RefundsAPI } from '../../api/client.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { DateField } from '../../components/common/Field.jsx'
import { Link } from 'react-router-dom'
import { confirmDialog } from '../../components/common/Dialog.jsx'
import { T, tr, personName, useLang, stamp, teText, gramUnit } from '../../i18n/LanguageContext.jsx'

// Today in IST (toISOString is UTC, which is still "yesterday" before 5:30 AM IST)
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const dash = (n) => (n ? inr(n) : '-')

// Drawer count — notes and coins in circulation (₹2000 withdrawn, not listed).
// Keys match backend schemas.CASH_DENOMINATIONS.
const DENOMS = [
  { k: '500', v: 500, label: '₹500' }, { k: '200', v: 200, label: '₹200' }, { k: '100', v: 100, label: '₹100' },
  { k: '50', v: 50, label: '₹50' }, { k: '20', v: 20, label: '₹20' }, { k: '10', v: 10, label: '₹10' },
  { k: 'c20', v: 20, label: '₹20', coin: true }, { k: 'c10', v: 10, label: '₹10', coin: true },
  { k: 'c5', v: 5, label: '₹5', coin: true }, { k: 'c2', v: 2, label: '₹2', coin: true }, { k: 'c1', v: 1, label: '₹1', coin: true },
]
const countOf = (counts, k) => parseInt(counts[k], 10) || 0
const countTotal = (counts) => DENOMS.reduce((t, d) => t + d.v * countOf(counts, d.k), 0)
const countPieces = (counts) => DENOMS.reduce((t, d) => t + countOf(counts, d.k), 0)
const countEntered = (counts) => DENOMS.some((d) => (counts[d.k] ?? '') !== '')
// Plain count or a dash — matches the un-padded count in the TOTAL row.
const dashN = (n) => (n ? String(n) : '-')

function KpiCard({ icon: Icon, title, value, sub, valueClass, subClass }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 flex items-center gap-4 h-full overflow-hidden">
      <div className="w-12 h-12 rounded-full bg-maroon-50 grid place-items-center shrink-0 ring-1 ring-maroon-100">
        <Icon size={22} className="text-maroon-700" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[0.71875rem] text-gray-500 leading-tight">{title}</div>
        <FitText className={`text-[1.375rem] font-bold leading-tight mt-0.5 tabular-nums ${valueClass || 'text-gray-800'}`}>{value}</FitText>
        <div className={`text-[0.6875rem] mt-0.5 ${subClass || 'text-gray-400'}`}>{sub}</div>
      </div>
    </div>
  )
}

function Donut({ cashPct, upiPct }) {
  const r = 52, c = 2 * Math.PI * r
  const cashLen = (cashPct / 100) * c
  // % labels at each slice's midpoint (chart starts at 12 o'clock).
  const mark = (startLen, len) => {
    const mid = ((startLen + len / 2) / c) * 2 * Math.PI - Math.PI / 2
    return { x: 70 + r * Math.cos(mid), y: 70 + r * Math.sin(mid) + 3.5 }
  }
  const pc = mark(0, cashLen)
  const pu = mark(cashLen, (upiPct / 100) * c)
  return (
    <svg viewBox="0 0 140 140" className="w-36 h-36">
      <circle cx="70" cy="70" r={r} fill="none" stroke="#e5e7eb" strokeWidth="20" />
      <circle cx="70" cy="70" r={r} fill="none" stroke="#7a1220" strokeWidth="20"
        strokeDasharray={`${cashLen} ${c}`} transform="rotate(-90 70 70)"><title>{`${tr('Cash')}: ${cashPct}%`}</title></circle>
      <circle cx="70" cy="70" r={r} fill="none" stroke="#c99a2e" strokeWidth="20"
        strokeDasharray={`${(upiPct / 100) * c} ${c}`} strokeDashoffset={`-${cashLen}`} transform="rotate(-90 70 70)"><title>{`${tr('Online')}: ${upiPct}%`}</title></circle>
      {cashPct >= 8 && <text x={pc.x} y={pc.y} textAnchor="middle" style={{ fontSize: 10, fontWeight: 700, fill: '#fff' }}>{Math.round(cashPct)}%</text>}
      {upiPct >= 8 && <text x={pu.x} y={pu.y} textAnchor="middle" style={{ fontSize: 10, fontWeight: 700, fill: '#fff' }}>{Math.round(upiPct)}%</text>}
    </svg>
  )
}

function CardHead({ icon: Icon, title }) {
  return (
    <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100">
      <Icon size={18} className="text-maroon-600" />
      <h3 className="font-serif text-[1.0625rem] font-bold text-maroon-800">{title}</h3>
    </div>
  )
}

export default function DailyClosing() {
  const { lang } = useLang()
  const { user } = useAuth()
  // Admin, Committee, and Accountant can close the day (requires Reports write permission)
  const canClose = ['Admin', 'Administrator', 'Committee', 'Accountant'].includes(user?.role)
  // Only Admin can reopen a closed day
  const isAdmin = ['Admin', 'Administrator'].includes(user?.role)
  // Only Admin, Committee, Accountant can see amounts in reports
  const canSeeAmounts = ['Admin', 'Administrator', 'Committee', 'Accountant'].includes(user?.role)
  const hideAmount = (val) => canSeeAmounts ? val : '—'
  const [day, setDay] = useState(today())
  const [sum, setSum] = useState(null)
  const [counts, setCounts] = useState({})   // drawer count: denomination key → count (string)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgErr, setMsgErr] = useState(false)
  const [loadErr, setLoadErr] = useState('')
  const [refunds, setRefunds] = useState([])

  const load = useCallback(async () => {
    setLoadErr('')
    try {
      const s = await DailyClosingAPI.summary(day)
      setSum(s)
      // Open day: left empty — staff count the drawer note by note. Closed day: the saved count.
      setCounts(s.denominations ? Object.fromEntries(Object.entries(s.denominations).map(([k, c]) => [k, String(c)])) : {})
      setNotes('')
      setMsg(''); setMsgErr(false)
      RefundsAPI.list({ start: day, end: day }).then((r) => setRefunds(r.items || [])).catch(() => setRefunds([]))
    } catch (ex) {
      setSum(null)
      setLoadErr(ex?.detail || tr("Couldn't load the daily closing — check your connection and retry."))
    }
  }, [day])
  useEffect(() => { load() }, [load])

  async function closeDay() {
    if (!countEntered(counts)) {
      setMsgErr(true); setMsg(tr('Count the cash in the drawer (number of each note / coin) before closing the day.'))
      return
    }
    if (Math.round((countTotal(counts) - (sum.expected_cash || 0)) * 100) !== 0 && !notes.trim()) {
      setMsgErr(true); setMsg(tr('The counted cash does not match the expected cash. Enter a closing note explaining the difference.'))
      return
    }
    if (!(await confirmDialog({ title: `${tr('Close the day')} — ${sum?.date}?`, message: tr('Once finalised, no further transactions can be recorded for this date.'), tone: 'danger', confirmLabel: tr('Close the Day') }))) return
    setBusy(true); setMsg('')
    try {
      const denominations = Object.fromEntries(DENOMS.map((d) => [d.k, countOf(counts, d.k)]).filter(([, c]) => c > 0))
      await DailyClosingAPI.close({ date: day, actual_cash: countTotal(counts), denominations, notes })
      await load(); setMsgErr(false); setMsg(tr('Day closed and finalised successfully.'))
    } catch (ex) { setMsgErr(true); setMsg(ex.detail || tr('Failed to close the day.')) } finally { setBusy(false) }
  }

  async function reopenDay() {
    if (!(await confirmDialog({ title: `${tr('Reopen Day')} — ${sum?.date}?`, message: tr('This will allow new transactions for this date. Only reopen if corrections are needed.'), tone: 'warning', confirmLabel: tr('Yes, Reopen') }))) return
    setBusy(true); setMsg('')
    try {
      await DailyClosingAPI.reopen({ date: day })
      await load(); setMsgErr(false); setMsg(tr('Day reopened successfully.'))
    } catch (ex) { setMsgErr(true); setMsg(ex.detail || tr('Failed to reopen the day.')) } finally { setBusy(false) }
  }

  if (loadErr) return <ErrorBlock message={loadErr} onRetry={load} />
  if (!sum) return <LoadingBlock />

  const modules = sum.modules || []
  const t = sum.total || { cash: 0, upi: 0, total: 0, count: 0 }
  // Closed day: the saved actual cash (older closings have no note count). Open day: the live count.
  const actualEntered = sum.closed ? sum.actual_cash != null : countEntered(counts)
  const actualNum = sum.closed ? Number(sum.actual_cash || 0) : countTotal(counts)
  const closingDiff = Math.round((actualNum - (sum.expected_cash || 0)) * 100) / 100
  const diffLabel = closingDiff > 0 ? tr('Excess') : closingDiff < 0 ? tr('Short') : tr('Matched')
  const diffNeedsNote = actualEntered && closingDiff !== 0
  const closed = sum.closed
  // Today: any closing role. A missed past day: view-only except for Admin.
  const isPastDay = sum.date < today()
  const canCloseThis = canClose && (!isPastDay || isAdmin)
  const dateLabel = stamp(new Date(sum.date + 'T00:00:00').toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }))

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="font-serif text-2xl font-bold text-maroon-700 leading-tight"><T>Daily Closing</T></h1>
          <div className="text-[0.8125rem] text-gray-400 mt-0.5"><T>Dashboard</T>{' '}<span className="mx-1">›</span>{' '}<T>Daily Closing</T></div>
        </div>
        <div className="flex items-center gap-3">
          <DateField value={day} max={today()} onChange={(e) => setDay(e.target.value > today() ? today() : e.target.value)}
            className="!w-52 !py-2.5 text-[0.8125rem] font-medium" />
          <button onClick={() => load()} className="inline-flex items-center gap-2 border border-gray-200 bg-white rounded-lg px-4 py-2.5 text-[0.8125rem] font-medium text-gray-600 hover:bg-gray-50">
            <RefreshCw size={15} />{' '}<T>Refresh</T>{' '}</button>
        </div>
      </div>

      {/* ── KPI row ── */}
      <KpiGrid>
        <KpiCard icon={IndianRupee} title={tr("Total Collections (₹)")} value={hideAmount(inr(t.total))} sub={`${modules.length} ${tr('Modules')}`} valueClass="text-maroon-800" />
        <KpiCard icon={Wallet} title={tr("Cash Collections (₹)")} value={hideAmount(inr(t.cash))} sub={canSeeAmounts ? `${sum.cash_pct}% ${tr('of Total')}` : ''} />
        <KpiCard icon={CreditCard} title={tr("Online Collections (₹)")} value={hideAmount(inr(t.upi))} sub={canSeeAmounts ? `${sum.upi_pct}% ${tr('of Total')}` : ''} />
        <KpiCard icon={ListChecks} title={tr("Total Transactions")} value={num(t.count)} sub={tr("All Payment Modes")} />
        <KpiCard icon={ClipboardCheck} title={tr("Closing Status")}
          value={closed ? tr('Closed') : tr('Open')} valueClass={closed ? 'text-rose-600' : 'text-emerald-600'}
          sub={closed ? `${tr('By')} ${personName({ name: sum.closed_by }, lang)}` : tr('Not Closed For The Day')} />
      </KpiGrid>

      {/* Stores & Inventory reminder — a warning only; the day can still be closed */}
      {sum.untagged_material?.length > 0 && (
        <div className="mb-5 flex flex-wrap items-start gap-x-3 gap-y-1 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-[0.8125rem] text-amber-900">
          <Tags size={16} className="mt-0.5 shrink-0 text-amber-700" />
          <div className="flex-1 min-w-0">
            <b>{sum.untagged_material.length} {tr('material donation(s) on this day are not tagged yet')}</b>
            <div className="text-[0.75rem] mt-0.5">{sum.untagged_material.map((d) => `${d.receipt_no} · ${personName({ name: d.donor_name }, lang)} · ${tr(d.item_name)} (${d.mode === 'weight' ? `${num(d.tagged)}/${num(d.quantity)} ${gramUnit()}` : `${d.tagged}/${num(d.quantity)}`})`).join('  ·  ')}</div>
          </div>
          <Link to="/admin/stores/pending" className="shrink-0 font-semibold text-maroon-700 hover:underline">{tr('Tag them now')} →</Link>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* ── Left: collections + charts ── */}
        <div className="xl:col-span-2 space-y-6">
          {/* Collections by Module */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <CardHead icon={IndianRupee} title={tr("Collections by Module")} />
            <div className="overflow-x-auto">
              <table className="w-full text-[0.84375rem]">
                <thead>
                  <tr className="bg-gray-50/70 text-gray-500 text-[0.71875rem] uppercase tracking-wide">
                    <th className="px-4 py-3 text-left font-semibold w-10">#</th>
                    <th className="px-2 py-3 text-left font-semibold"><T>Module</T></th>
                    <th className="px-4 py-3 text-right font-semibold"><T>Cash (₹)</T></th>
                    <th className="px-4 py-3 text-right font-semibold"><T>Online (₹)</T></th>
                    <th className="px-4 py-3 text-right font-semibold"><T>Total Amount (₹)</T></th>
                    <th className="px-4 py-3 text-right font-semibold"><T>Transactions</T></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {modules.map((m, i) => (
                    <tr key={m.name} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-gray-400 tabular-nums">{i + 1}</td>
                      <td className="px-2 py-3 font-medium text-gray-800">{tr(m.name)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">{canSeeAmounts ? dash(m.cash) : '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">{canSeeAmounts ? dash(m.upi) : '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-800">{canSeeAmounts ? dash(m.total) : '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-600">{dashN(m.count)}</td>
                    </tr>
                  ))}
                  <tr className="bg-amber-50/70 font-bold text-maroon-800 text-[0.875rem]">
                    <td className="px-4 py-3.5" colSpan={2}><T>TOTAL</T></td>
                    <td className="px-4 py-3.5 text-right tabular-nums">{hideAmount(inr(t.cash))}</td>
                    <td className="px-4 py-3.5 text-right tabular-nums">{hideAmount(inr(t.upi))}</td>
                    <td className="px-4 py-3.5 text-right tabular-nums">{hideAmount(inr(t.total))}</td>
                    <td className="px-4 py-3.5 text-right tabular-nums">{num(t.count)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Payment Mode Summary */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <CardHead icon={CreditCard} title={tr("Payment Mode Summary")} />
              {/* Donut on top, table below: side by side they overlapped in this half-width card */}
              <div className="p-5 flex flex-col items-center gap-4">
                {canSeeAmounts && <div className="shrink-0"><Donut cashPct={sum.cash_pct} upiPct={sum.upi_pct} /></div>}
                <div className="w-full text-[0.8125rem]">
                  <div className="flex gap-2 text-[0.6875rem] uppercase tracking-wide text-gray-700 font-semibold pb-2 border-b border-gray-100">
                    <span className="flex-1 min-w-0 truncate"><T>Payment Mode</T></span><span className="shrink-0 text-right whitespace-nowrap min-w-[6rem]"><T>Amount (₹)</T></span><span className="w-12 shrink-0 text-right">%</span>
                  </div>
                  <div className="flex items-center gap-2 py-2.5 border-b border-gray-50">
                    <span className="flex-1 min-w-0 flex items-center gap-2 text-gray-700"><span className="w-2.5 h-2.5 shrink-0 rounded-full" style={{ background: '#7a1220' }} /><span className="truncate"><T>Cash</T></span></span>
                    <span className="shrink-0 min-w-[6rem] text-right tabular-nums whitespace-nowrap text-gray-700">{hideAmount(inr(t.cash))}</span>
                    <span className="w-12 shrink-0 text-right tabular-nums text-gray-500">{canSeeAmounts ? `${sum.cash_pct}%` : '—'}</span>
                  </div>
                  <div className="flex items-center gap-2 py-2.5 border-b border-gray-50">
                    <span className="flex-1 min-w-0 flex items-center gap-2 text-gray-700"><span className="w-2.5 h-2.5 shrink-0 rounded-full" style={{ background: '#c99a2e' }} /><span className="truncate"><T>Online</T></span></span>
                    <span className="shrink-0 min-w-[6rem] text-right tabular-nums whitespace-nowrap text-gray-700">{hideAmount(inr(t.upi))}</span>
                    <span className="w-12 shrink-0 text-right tabular-nums text-gray-500">{canSeeAmounts ? `${sum.upi_pct}%` : '—'}</span>
                  </div>
                  <div className="flex items-center gap-2 pt-2.5 font-bold text-maroon-800">
                    <span className="flex-1 min-w-0"><T>Total</T></span>
                    <span className="shrink-0 min-w-[6rem] text-right tabular-nums whitespace-nowrap">{hideAmount(inr(t.total))}</span>
                    <span className="w-12 shrink-0 text-right tabular-nums">{canSeeAmounts ? '100%' : '—'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Cash Reconciliation */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <CardHead icon={Scale} title={tr("Cash Reconciliation")} />
              <div className="p-5 text-[0.84375rem] space-y-3">
                <Row label={tr("Opening Cash (₹)")} value={hideAmount(inr(sum.opening_cash))} />
                <Row label={tr("(+) Cash Collections (₹)")} value={hideAmount(inr(t.cash))} />
                <Row label={tr("(-) Cash Refunds (₹)")} value={hideAmount(inr(sum.cash_refunds))} />
                <div className="border-t border-gray-100 pt-3 space-y-3">
                  <Row label={tr("Expected Cash in Hand (₹)")} value={hideAmount(inr(sum.expected_cash))} bold />
                  <Row label={tr("Actual Cash in Hand (₹)")} value={actualEntered ? hideAmount(inr(actualNum)) : tr('Not entered')} />
                </div>
                <div className={`flex items-center justify-between rounded-lg px-3 py-2.5 mt-1 font-bold ${!actualEntered ? 'bg-gray-50 text-gray-500' : closingDiff === 0 ? 'bg-emerald-50 text-emerald-700' : closingDiff > 0 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>
                  <span><T>Difference (₹)</T></span><span className="tabular-nums">{actualEntered ? <>{hideAmount(inr(closingDiff))} · {diffLabel}</> : '—'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right: closing summary ── */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <CardHead icon={ClipboardCheck} title={tr("Closing Summary")} />
            <div className="p-5 text-[0.84375rem] space-y-3">
              <Row label={tr("Total Collections (₹)")} value={hideAmount(inr(t.total))} valueClass="text-maroon-800 font-bold text-[0.9375rem]" />
              <Row label={tr("(-) Refunds (₹)")} value={hideAmount(inr(sum.refunds))} />
              <Row label={tr("Net Collections (₹)")} value={hideAmount(inr(sum.net_collections))} valueClass="text-emerald-600 font-bold text-[0.9375rem]" />
              <div className="border-t border-gray-100 pt-3 space-y-3">
                <Row label={tr("Total Transactions")} value={num(t.count)} />
                <Row label={tr("Cash Transactions")} value={num(sum.cash_txns)} />
                <Row label={tr("Online Transactions")} value={num(sum.upi_txns)} />
              </div>
            </div>
          </div>

          {/* Cash Count — its own step: count the drawer, compare with expected */}
          {canSeeAmounts && (
            <CashCountCard counts={counts} setCounts={setCounts} readOnly={closed || !canCloseThis}
              closed={closed} legacy={closed && !sum.denominations}
              counted={actualNum} expected={sum.expected_cash || 0} entered={actualEntered}
              diff={closingDiff} diffLabel={diffLabel} />
          )}

          {closed ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="inline-flex items-center gap-2 text-[0.8125rem] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5">
                <CheckCircle2 size={16} /> <T>Closed by</T> {personName({ name: sum.closed_by }, lang)} · {fmtStamp(sum.closed_at)}
              </div>
              {sum.closing_notes && (
                <div className="mt-3 text-[0.8125rem] text-gray-600"><span className="font-semibold text-gray-700"><T>Closing Notes</T>:</span> {sum.closing_notes}</div>
              )}
              {/* Admin-only Reopen button */}
              {isAdmin && (
                <button onClick={reopenDay} disabled={busy}
                  className="w-full mt-4 inline-flex items-center justify-center gap-2 bg-amber-50 border border-amber-300 text-amber-800 font-semibold rounded-lg py-2.5 hover:bg-amber-100 disabled:opacity-60">
                  <Unlock size={16} /> {busy ? tr('Reopening…') : tr('Reopen Day')}
                </button>
              )}
              {msg && <div className={`mt-3 text-[0.8125rem] ${msgErr ? 'text-rose-600' : 'text-emerald-700'}`}>{msg}</div>}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-baseline justify-between mb-2">
                <label className="font-serif text-[0.9375rem] font-bold text-maroon-800"><T>Closing Notes</T>{' '}
                  {diffNeedsNote
                    ? <span className="text-rose-600 font-sans font-semibold text-[0.75rem]"><T>(Required — explain the difference)</T></span>
                    : <span className="text-gray-400 font-sans font-normal text-[0.75rem]"><T>(Optional)</T></span>}
                </label>
              </div>
              <textarea rows={3} maxLength={500} value={notes} disabled={!canCloseThis} onChange={(e) => setNotes(e.target.value)}
                placeholder={diffNeedsNote ? tr('e.g. ₹160 given as change, receipt missing') : tr("Enter any closing notes / observations…")}
                className={`w-full border ${diffNeedsNote && !notes.trim() ? 'border-rose-300' : 'border-gray-200'} rounded-lg px-3 py-2.5 text-[0.8125rem] focus:ring-2 focus:ring-maroon-200 focus:border-maroon-400 resize-none`} />
              <div className="text-right text-[0.6875rem] text-gray-400 mt-1">{notes.length} / 500</div>

              {canClose && !canCloseThis && (
                <div className="mt-3 flex items-start gap-2.5 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-[0.75rem] text-gray-600">
                  <Lock size={14} className="text-gray-400 shrink-0 mt-0.5" /><T>Past day — view only. Only Admin can close a missed day.</T>
                </div>
              )}
              {canCloseThis && (
                <button onClick={closeDay} disabled={busy}
                  className="w-full mt-3 inline-flex items-center justify-center gap-2 bg-maroon-700 text-white font-semibold rounded-lg py-3 hover:bg-maroon-800">
                  <Lock size={16} /> {busy ? tr('Closing…') : tr('Close Day & Finalize')}
                </button>
              )}

              <div className="mt-3 flex items-start gap-2.5 bg-amber-50/70 border border-amber-100 rounded-lg px-4 py-3 text-[0.75rem] text-gray-600">
                <Info size={16} className="text-amber-500 shrink-0 mt-0.5" /><T>Once the day is closed, no further transactions can be recorded for the selected date.</T>{' '}</div>
              {msg && <div className={`mt-3 text-[0.8125rem] ${msgErr ? 'text-rose-600' : 'text-emerald-700'}`}>{msg}</div>}
            </div>
          )}

          {/* Refunds register for the day — money paid back out (feeds expected cash) */}
          {refunds.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="font-serif text-[0.9375rem] font-bold text-maroon-800 mb-3"><T>Refunds</T> ({refunds.length})</div>
              <div className="overflow-x-auto">
                <table className="w-full text-[0.8125rem]">
                  <thead><tr className="text-left text-[0.6875rem] uppercase tracking-wide text-gray-700 bg-gray-50/70">
                    {['Refund No.', 'Against', 'Reason', 'Mode', 'By', ...(canSeeAmounts ? ['Amount (₹)'] : [])].map((c) => <th key={c} className="px-3 py-2 font-semibold whitespace-nowrap">{tr(c)}</th>)}
                  </tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {refunds.map((r) => (
                      <tr key={r.id}>
                        <td className="px-3 py-2 font-mono text-[0.75rem] text-gray-500">{r.refund_code}</td>
                        <td className="px-3 py-2 text-gray-700">{tr(r.entity_type)} {r.entity_code || `#${r.entity_id || ''}`}</td>
                        <td className="px-3 py-2 text-gray-500">{r.reason || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{tr(r.mode || 'Cash')}</td>
                        <td className="px-3 py-2 text-gray-500">{r.created_by ? personName({ name: r.created_by }, lang) : '—'}</td>
                        {canSeeAmounts && <td className="px-3 py-2 text-right font-semibold text-rose-700">{inr(r.amount)}</td>}
                      </tr>
                    ))}
                    {canSeeAmounts && (
                      <tr className="bg-gray-50/60 font-bold">
                        <td className="px-3 py-2" colSpan={5}><T>Total refunds</T></td>
                        <td className="px-3 py-2 text-right text-rose-700">{inr(refunds.reduce((s, r) => s + Number(r.amount || 0), 0))}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Footer banner ── */}
      <div className="mt-6 flex items-center gap-2.5 bg-emerald-50/60 border border-emerald-100 rounded-xl px-5 py-3.5 text-[0.8125rem] text-gray-600">
        <CheckCircle2 size={17} className="text-emerald-500 shrink-0" />
        <T>All amounts are in INR (₹). Figures are auto-calculated based on recorded transactions for the selected date.</T>
      </div>
    </div>
  )
}

// Drawer count: staff enter how many of each note/coin; amounts and the total add up
// to the rupee and the total becomes the actual cash in hand. Open day: shown in full.
// Closed day: one summary line, with the saved note-by-note count behind "View count".
function CashCountCard({ counts, setCounts, readOnly, closed, legacy, counted, expected, entered, diff, diffLabel }) {
  const [showDetail, setShowDetail] = useState(false)
  const set = (k, v) => setCounts((c) => ({ ...c, [k]: v.replace(/\D/g, '').slice(0, 7) }))
  const pieces = countPieces(counts)
  const diffTone = !entered ? 'bg-gray-50 text-gray-500' : diff === 0 ? 'bg-emerald-50 text-emerald-700' : diff > 0 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'
  const diffText = entered ? <>{inr(diff)} · {diffLabel}{diff === 0 ? ' ✓' : ''}</> : '—'

  const line = (d) => {
    const amt = d.v * countOf(counts, d.k)
    return (
      <tr key={d.k}>
        <td className="py-1 pr-2 text-gray-700 whitespace-nowrap">{d.label}</td>
        <td className="py-1 px-1 text-center text-gray-400">×</td>
        <td className="py-1 px-1">
          {readOnly
            ? <span className="block text-right tabular-nums text-gray-800">{countOf(counts, d.k) || '-'}</span>
            : <input inputMode="numeric" value={counts[d.k] ?? ''} onChange={(e) => set(d.k, e.target.value)} placeholder="0"
                aria-label={`${d.label} ${d.coin ? tr('coins') : tr('notes')}`}
                className="w-full min-w-[3.5rem] border border-gray-200 rounded-md px-2 py-1 text-right tabular-nums focus:ring-2 focus:ring-maroon-200 focus:border-maroon-400" />}
        </td>
        <td className={`py-1 pl-2 text-right tabular-nums whitespace-nowrap ${amt ? 'text-gray-800' : 'text-gray-300'}`}>{amt ? inr(amt) : '-'}</td>
      </tr>
    )
  }
  const head = (t) => (
    <tr><td colSpan={4} className="pt-2 pb-1 text-[0.6875rem] uppercase tracking-wide font-semibold text-gray-500">{t}</td></tr>
  )
  const table = (
    <table className="w-full text-[0.8125rem]">
      <colgroup><col /><col className="w-5" /><col className="w-24" /><col /></colgroup>
      <tbody>
        {head(tr('Currency Notes') /* not 'Notes': that means remarks (గమనికలు) elsewhere */)}
        {DENOMS.filter((d) => !d.coin).map(line)}
        {head(tr('Coins'))}
        {DENOMS.filter((d) => d.coin).map(line)}
      </tbody>
    </table>
  )
  const totals = (
    <div className="space-y-2">
      <Row label={<>{tr('Counted')}{!legacy && <span className="text-gray-400"> ({pieces} {tr('pcs')})</span>}</>} value={entered ? inr(counted) : '—'} bold />
      <Row label={tr('Expected')} value={inr(expected)} />
      <div className={`flex items-center justify-between rounded-lg px-3 py-2.5 font-bold ${diffTone}`}>
        <span><T>Difference</T></span><span className="tabular-nums">{diffText}</span>
      </div>
    </div>
  )

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100">
        <Wallet size={18} className="text-maroon-600" />
        <h3 className="font-serif text-[1.0625rem] font-bold text-maroon-800 flex-1"><T>Cash Count</T></h3>
        {!readOnly && countEntered(counts) && (
          <button onClick={() => setCounts({})} className="text-[0.75rem] text-maroon-700 hover:underline"><T>Clear</T></button>
        )}
      </div>
      <div className="p-5 text-[0.84375rem] space-y-3">
        {closed ? (
          <>
            {totals}
            {!legacy && (
              <button onClick={() => setShowDetail((v) => !v)}
                className="w-full inline-flex items-center justify-center gap-1.5 text-[0.8125rem] font-semibold text-maroon-700 hover:underline">
                {showDetail ? tr('Hide count') : tr('View count')} {showDetail ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
            )}
            {showDetail && !legacy && <div className="border-t border-gray-100 pt-2">{table}</div>}
          </>
        ) : (
          <>
            {table}
            <div className="border-t border-gray-200 pt-3">{totals}</div>
          </>
        )}
      </div>
    </div>
  )
}

function Row({ label, value, bold, valueClass }) {
  value = typeof value === 'string' ? teText(value) : value

  return (
    <div className="flex items-center justify-between">
      <span className={`text-gray-600 ${bold ? 'font-semibold text-gray-800' : ''}`}>{label}</span>
      <span className={`tabular-nums ${valueClass || (bold ? 'font-bold text-gray-800' : 'text-gray-800')}`}>{value}</span>
    </div>
  )
}
