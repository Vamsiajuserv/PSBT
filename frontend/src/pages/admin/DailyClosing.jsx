import React, { useEffect, useState, useCallback } from 'react'
import {
  IndianRupee, Layers, ListChecks, ClipboardCheck, Lock, Filter,
  Wallet, Scale, CreditCard, Info, CheckCircle2,
} from 'lucide-react'
import { inr, num, fmtStamp } from '../../components/admin/ui.jsx'
import { LoadingBlock, ErrorBlock } from '../../components/common/states.jsx'
import { DailyClosingAPI, RefundsAPI } from '../../api/client.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { DateField, NumberField } from '../../components/common/Field.jsx'
import { confirmDialog } from '../../components/common/Dialog.jsx'
import { T, tr } from '../../i18n/LanguageContext.jsx'

const today = () => new Date().toISOString().slice(0, 10)
const dash = (n) => (n ? inr(n) : '-')
// Plain count or a dash — matches the un-padded count in the TOTAL row.
const dashN = (n) => (n ? String(n) : '-')

function KpiCard({ icon: Icon, title, value, sub, valueClass, subClass }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 flex items-center gap-4">
      <div className="w-12 h-12 rounded-full bg-maroon-50 grid place-items-center shrink-0 ring-1 ring-maroon-100">
        <Icon size={22} className="text-maroon-700" />
      </div>
      <div className="min-w-0">
        <div className="text-[0.71875rem] text-gray-500 leading-tight">{title}</div>
        <div className={`text-[1.375rem] font-bold leading-tight mt-0.5 ${valueClass || 'text-gray-800'}`}>{value}</div>
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
        strokeDasharray={`${cashLen} ${c}`} transform="rotate(-90 70 70)"><title>{`Cash: ${cashPct}%`}</title></circle>
      <circle cx="70" cy="70" r={r} fill="none" stroke="#c99a2e" strokeWidth="20"
        strokeDasharray={`${(upiPct / 100) * c} ${c}`} strokeDashoffset={`-${cashLen}`} transform="rotate(-90 70 70)"><title>{`UPI / QR: ${upiPct}%`}</title></circle>
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
  const { user } = useAuth()
  const canClose = user?.role !== 'Accountant' && user?.role !== 'Committee'
  const [day, setDay] = useState(today())
  const [sum, setSum] = useState(null)
  const [actual, setActual] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [loadErr, setLoadErr] = useState('')
  const [refunds, setRefunds] = useState([])

  const load = useCallback(async () => {
    setLoadErr('')
    try {
      const s = await DailyClosingAPI.summary(day)
      setSum(s)
      setActual(String(s.actual_cash ?? s.expected_cash ?? 0))
      setNotes('')
      setMsg('')
      RefundsAPI.list({ start: day, end: day }).then((r) => setRefunds(r.items || [])).catch(() => setRefunds([]))
    } catch (ex) {
      setSum(null)
      setLoadErr(ex?.detail || "Couldn't load the daily closing — check your connection and retry.")
    }
  }, [day])
  useEffect(() => { load() }, [load])

  async function closeDay() {
    if (!(await confirmDialog({ title: `Close ${sum?.date}?`, message: 'Once finalised, no further transactions can be recorded for this date.', tone: 'danger', confirmLabel: 'Close the Day' }))) return
    setBusy(true); setMsg('')
    try {
      await DailyClosingAPI.close({ date: day, actual_cash: Number(actual) || 0, notes })
      setMsg('Day closed and finalised successfully.'); load()
    } catch (ex) { setMsg(ex.detail || 'Failed to close the day.') } finally { setBusy(false) }
  }

  if (loadErr) return <ErrorBlock message={loadErr} onRetry={load} />
  if (!sum) return <LoadingBlock />

  const modules = sum.modules || []
  const t = sum.total || { cash: 0, upi: 0, total: 0, count: 0 }
  const actualNum = Number(actual) || 0
  const closingDiff = actualNum - (sum.expected_cash || 0)
  const closed = sum.closed
  const dateLabel = new Date(sum.date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-serif text-[1.75rem] font-bold text-maroon-800 leading-tight"><T>Daily Closing</T></h1>
          <div className="text-[0.8125rem] text-gray-400 mt-0.5"><T>Dashboard</T>{' '}<span className="mx-1">›</span>{' '}<T>Daily Closing</T></div>
        </div>
        <div className="flex items-center gap-3">
          <DateField value={day} onChange={(e) => setDay(e.target.value)}
            className="!w-52 !py-2.5 text-[0.8125rem] font-medium" />
          <button onClick={() => load()} className="inline-flex items-center gap-2 border border-gray-200 bg-white rounded-lg px-4 py-2.5 text-[0.8125rem] font-medium text-gray-600 hover:bg-gray-50">
            <Filter size={15} />{' '}<T>Filter</T>{' '}</button>
        </div>
      </div>

      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <KpiCard icon={IndianRupee} title={tr("Total Collections (₹)")} value={inr(t.total)} sub={`From ${modules.length} Modules`} valueClass="text-maroon-800" />
        <KpiCard icon={Wallet} title={tr("Cash Collections (₹)")} value={inr(t.cash)} sub={`${sum.cash_pct}% of Total`} />
        <KpiCard icon={CreditCard} title={tr("UPI / QR Collections (₹)")} value={inr(t.upi)} sub={`${sum.upi_pct}% of Total`} />
        <KpiCard icon={ListChecks} title={tr("Total Transactions")} value={num(t.count)} sub="All Payment Modes" />
        <KpiCard icon={ClipboardCheck} title={tr("Closing Status")}
          value={closed ? 'Closed' : 'Open'} valueClass={closed ? 'text-rose-600' : 'text-emerald-600'}
          sub={closed ? `By ${sum.closed_by}` : 'Not Closed For The Day'} />
      </div>

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
                    <th className="px-4 py-3 text-right font-semibold">Cash (₹)</th>
                    <th className="px-4 py-3 text-right font-semibold">UPI / QR (₹)</th>
                    <th className="px-4 py-3 text-right font-semibold">Total Amount (₹)</th>
                    <th className="px-4 py-3 text-right font-semibold"><T>Transactions</T></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {modules.map((m, i) => (
                    <tr key={m.name} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-gray-400 tabular-nums">{i + 1}</td>
                      <td className="px-2 py-3 font-medium text-gray-800">{m.name}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">{dash(m.cash)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">{dash(m.upi)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-800">{dash(m.total)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-600">{dashN(m.count)}</td>
                    </tr>
                  ))}
                  <tr className="bg-amber-50/70 font-bold text-maroon-800 text-[0.875rem]">
                    <td className="px-4 py-3.5" colSpan={2}><T>TOTAL</T></td>
                    <td className="px-4 py-3.5 text-right tabular-nums">{inr(t.cash)}</td>
                    <td className="px-4 py-3.5 text-right tabular-nums">{inr(t.upi)}</td>
                    <td className="px-4 py-3.5 text-right tabular-nums">{inr(t.total)}</td>
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
              <div className="p-5 flex items-center gap-5">
                <div className="shrink-0"><Donut cashPct={sum.cash_pct} upiPct={sum.upi_pct} /></div>
                <div className="flex-1 min-w-0 text-[0.8125rem]">
                  <div className="flex text-[0.6875rem] uppercase tracking-wide text-gray-400 font-semibold pb-2 border-b border-gray-100">
                    <span className="flex-1"><T>Payment Mode</T></span><span className="w-20 text-right">Amount (₹)</span><span className="w-12 text-right">%</span>
                  </div>
                  <div className="flex items-center py-2.5 border-b border-gray-50">
                    <span className="flex-1 flex items-center gap-2 text-gray-700"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#7a1220' }} />{' '}<T>Cash</T></span>
                    <span className="w-20 text-right tabular-nums text-gray-700">{inr(t.cash)}</span>
                    <span className="w-12 text-right tabular-nums text-gray-500">{sum.cash_pct}%</span>
                  </div>
                  <div className="flex items-center py-2.5 border-b border-gray-50">
                    <span className="flex-1 flex items-center gap-2 text-gray-700"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#c99a2e' }} />{' '}<T>UPI / QR Code</T></span>
                    <span className="w-20 text-right tabular-nums text-gray-700">{inr(t.upi)}</span>
                    <span className="w-12 text-right tabular-nums text-gray-500">{sum.upi_pct}%</span>
                  </div>
                  <div className="flex items-center pt-2.5 font-bold text-maroon-800">
                    <span className="flex-1"><T>Total</T></span>
                    <span className="w-20 text-right tabular-nums">{inr(t.total)}</span>
                    <span className="w-12 text-right tabular-nums">100%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Cash Reconciliation */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <CardHead icon={Scale} title={tr("Cash Reconciliation")} />
              <div className="p-5 text-[0.84375rem] space-y-3">
                <Row label="Opening Cash (₹)" value={inr(sum.opening_cash)} />
                <Row label="(+) Cash Collections (₹)" value={inr(t.cash)} />
                <Row label="(-) Cash Refunds (₹)" value={inr(sum.cash_refunds)} />
                <div className="border-t border-gray-100 pt-3 space-y-3">
                  <Row label="Expected Cash in Hand (₹)" value={inr(sum.expected_cash)} bold />
                  <Row label="Actual Cash in Hand (₹)" value={inr(actualNum)} />
                </div>
                <div className={`flex items-center justify-between rounded-lg px-3 py-2.5 mt-1 font-bold ${closingDiff === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                  <span>Difference (₹)</span><span className="tabular-nums">{inr(closingDiff)}</span>
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
              <Row label="Total Collections (₹)" value={inr(t.total)} valueClass="text-maroon-800 font-bold text-[0.9375rem]" />
              <Row label="(-) Refunds (₹)" value={inr(sum.refunds)} />
              <Row label="Net Collections (₹)" value={inr(sum.net_collections)} valueClass="text-emerald-600 font-bold text-[0.9375rem]" />
              <div className="border-t border-gray-100 pt-3 space-y-3">
                <Row label="Total Transactions" value={num(t.count)} />
                <Row label="Cash Transactions" value={num(sum.cash_txns)} />
                <Row label="UPI / QR Transactions" value={num(sum.upi_txns)} />
              </div>
              <div className="border-t border-gray-100 pt-3 space-y-3">
                <Row label="Cash in Hand (Expected) (₹)" value={inr(sum.expected_cash)} />
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Cash in Hand (Actual) (₹)</span>
                  <NumberField prefix="₹" value={actual} disabled={closed || !canClose}
                    title={!canClose ? 'Only the closing role enters the counted cash' : undefined}
                    onChange={(e) => setActual(e.target.value)}
                    className="!w-36 !py-1.5" inputClass="text-right tabular-nums" />
                </div>
                <Row label="Difference (₹)" value={inr(closingDiff)}
                  valueClass={`font-bold ${closingDiff === 0 ? 'text-emerald-600' : 'text-rose-600'}`} />
              </div>
            </div>
          </div>

          {/* Refunds register for the day — money paid back out (feeds expected cash) */}
          {refunds.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="font-serif text-[0.9375rem] font-bold text-maroon-800 mb-3">Refunds ({refunds.length})</div>
              <div className="overflow-x-auto">
                <table className="w-full text-[0.8125rem]">
                  <thead><tr className="text-left text-[0.6875rem] uppercase tracking-wide text-gray-500 bg-gray-50/70">
                    {['Refund No.', 'Against', 'Reason', 'Mode', 'By', 'Amount (₹)'].map((c) => <th key={c} className="px-3 py-2 font-semibold whitespace-nowrap">{c}</th>)}
                  </tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {refunds.map((r) => (
                      <tr key={r.id}>
                        <td className="px-3 py-2 font-mono text-[0.75rem] text-gray-500">{r.refund_code}</td>
                        <td className="px-3 py-2 text-gray-700">{r.entity_type} {r.entity_code || `#${r.entity_id || ''}`}</td>
                        <td className="px-3 py-2 text-gray-500">{r.reason || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{r.mode || 'Cash'}</td>
                        <td className="px-3 py-2 text-gray-500">{r.created_by || '—'}</td>
                        <td className="px-3 py-2 text-right font-semibold text-rose-700">{inr(r.amount)}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50/60 font-bold">
                      <td className="px-3 py-2" colSpan={5}><T>Total refunds</T></td>
                      <td className="px-3 py-2 text-right text-rose-700">{inr(refunds.reduce((s, r) => s + Number(r.amount || 0), 0))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {closed ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="inline-flex items-center gap-2 text-[0.8125rem] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5">
                <CheckCircle2 size={16} /> Closed by {sum.closed_by} · {fmtStamp(sum.closed_at)}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-baseline justify-between mb-2">
                <label className="font-serif text-[0.9375rem] font-bold text-maroon-800"><T>Closing Notes</T>{' '}<span className="text-gray-400 font-sans font-normal text-[0.75rem]">(Optional)</span></label>
              </div>
              <textarea rows={3} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder={tr("Enter any closing notes / observations…")}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-[0.8125rem] focus:ring-2 focus:ring-maroon-200 focus:border-maroon-400 resize-none" />
              <div className="text-right text-[0.6875rem] text-gray-400 mt-1">{notes.length} / 500</div>

              {canClose && (
                <button onClick={closeDay} disabled={busy}
                  className="w-full mt-3 inline-flex items-center justify-center gap-2 bg-gradient-to-b from-maroon-800 to-maroon-900 text-cream font-semibold rounded-lg py-3 hover:from-maroon-700 disabled:opacity-60">
                  <Lock size={16} /> {busy ? 'Closing…' : 'Close Day & Finalize'}
                </button>
              )}

              <div className="mt-3 flex items-start gap-2.5 bg-amber-50/70 border border-amber-100 rounded-lg px-4 py-3 text-[0.75rem] text-gray-600">
                <Info size={16} className="text-amber-500 shrink-0 mt-0.5" /><T>Once the day is closed, no further transactions can be recorded for the selected date.</T>{' '}</div>
              {msg && <div className="mt-3 text-[0.8125rem] text-emerald-700">{msg}</div>}
            </div>
          )}
        </div>
      </div>

      {/* ── Footer banner ── */}
      <div className="mt-6 flex items-center gap-2.5 bg-emerald-50/60 border border-emerald-100 rounded-xl px-5 py-3.5 text-[0.8125rem] text-gray-600">
        <CheckCircle2 size={17} className="text-emerald-500 shrink-0" />
        All amounts are in INR (₹). Figures are auto-calculated based on recorded transactions for the selected date.
      </div>
    </div>
  )
}

function Row({ label, value, bold, valueClass }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-gray-600 ${bold ? 'font-semibold text-gray-800' : ''}`}>{label}</span>
      <span className={`tabular-nums ${valueClass || (bold ? 'font-bold text-gray-800' : 'text-gray-800')}`}>{value}</span>
    </div>
  )
}
