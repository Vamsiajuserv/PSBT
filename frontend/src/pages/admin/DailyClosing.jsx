import React, { useEffect, useState, useCallback } from 'react'
import {
  IndianRupee, Layers, ListChecks, ClipboardCheck, Lock, CalendarDays, Filter,
  ChevronDown, Wallet, Scale, CreditCard, Info, CheckCircle2,
} from 'lucide-react'
import { inr, num, fmtStamp } from '../../components/admin/ui.jsx'
import { DailyClosingAPI } from '../../api/client.js'
import { useAuth } from '../../auth/AuthContext.jsx'

const today = () => new Date().toISOString().slice(0, 10)
const dash = (n) => (n ? inr(n) : '-')
const dashN = (n) => (n ? String(n).padStart(2, '0') : '-')

function KpiCard({ icon: Icon, title, value, sub, valueClass, subClass }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 flex items-center gap-4">
      <div className="w-12 h-12 rounded-full bg-maroon-50 grid place-items-center shrink-0 ring-1 ring-maroon-100">
        <Icon size={22} className="text-maroon-700" />
      </div>
      <div className="min-w-0">
        <div className="text-[11.5px] text-gray-500 leading-tight">{title}</div>
        <div className={`text-[22px] font-bold leading-tight mt-0.5 ${valueClass || 'text-gray-800'}`}>{value}</div>
        <div className={`text-[11px] mt-0.5 ${subClass || 'text-gray-400'}`}>{sub}</div>
      </div>
    </div>
  )
}

function Donut({ cashPct, upiPct }) {
  const r = 52, c = 2 * Math.PI * r
  const cashLen = (cashPct / 100) * c
  return (
    <svg viewBox="0 0 140 140" className="w-36 h-36 -rotate-90">
      <circle cx="70" cy="70" r={r} fill="none" stroke="#e5e7eb" strokeWidth="20" />
      <circle cx="70" cy="70" r={r} fill="none" stroke="#7a1220" strokeWidth="20"
        strokeDasharray={`${cashLen} ${c}`} />
      <circle cx="70" cy="70" r={r} fill="none" stroke="#c99a2e" strokeWidth="20"
        strokeDasharray={`${(upiPct / 100) * c} ${c}`} strokeDashoffset={`-${cashLen}`} />
    </svg>
  )
}

function CardHead({ icon: Icon, title }) {
  return (
    <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100">
      <Icon size={18} className="text-maroon-600" />
      <h3 className="font-serif text-[17px] font-bold text-maroon-800">{title}</h3>
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

  const load = useCallback(async () => {
    const s = await DailyClosingAPI.summary(day)
    setSum(s)
    setActual(String(s.actual_cash ?? s.expected_cash ?? 0))
    setNotes('')
    setMsg('')
  }, [day])
  useEffect(() => { load() }, [load])

  async function closeDay() {
    if (!confirm(`Close ${sum?.date}? Once finalised, no further transactions can be recorded for this date.`)) return
    setBusy(true); setMsg('')
    try {
      await DailyClosingAPI.close({ date: day, actual_cash: Number(actual) || 0, notes })
      setMsg('Day closed and finalised successfully.'); load()
    } catch (ex) { setMsg(ex.detail || 'Failed to close the day.') } finally { setBusy(false) }
  }

  if (!sum) return <div className="py-20 text-center text-gray-400">Loading…</div>

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
          <h1 className="font-serif text-[28px] font-bold text-maroon-800 leading-tight">Daily Closing</h1>
          <div className="text-[13px] text-gray-400 mt-0.5">Dashboard <span className="mx-1">›</span> Daily Closing</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <CalendarDays size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-maroon-500 pointer-events-none" />
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)}
              className="input !pl-9 !pr-8 !w-52 !py-2.5 text-[13px] font-medium" />
            <ChevronDown size={15} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
          <button onClick={() => load()} className="inline-flex items-center gap-2 border border-gray-200 bg-white rounded-lg px-4 py-2.5 text-[13px] font-medium text-gray-600 hover:bg-gray-50">
            <Filter size={15} /> Filter
          </button>
        </div>
      </div>

      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <KpiCard icon={IndianRupee} title="Total Collections (₹)" value={inr(t.total)} sub={`From ${modules.length} Modules`} valueClass="text-maroon-800" />
        <KpiCard icon={Wallet} title="Cash Collections (₹)" value={inr(t.cash)} sub={`${sum.cash_pct}% of Total`} />
        <KpiCard icon={CreditCard} title="UPI / QR Collections (₹)" value={inr(t.upi)} sub={`${sum.upi_pct}% of Total`} />
        <KpiCard icon={ListChecks} title="Total Transactions" value={num(t.count)} sub="All Payment Modes" />
        <KpiCard icon={ClipboardCheck} title="Closing Status"
          value={closed ? 'Closed' : 'Open'} valueClass={closed ? 'text-rose-600' : 'text-emerald-600'}
          sub={closed ? `By ${sum.closed_by}` : 'Not Closed For The Day'} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* ── Left: collections + charts ── */}
        <div className="xl:col-span-2 space-y-6">
          {/* Collections by Module */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <CardHead icon={IndianRupee} title="Collections by Module" />
            <div className="overflow-x-auto">
              <table className="w-full text-[13.5px]">
                <thead>
                  <tr className="bg-gray-50/70 text-gray-500 text-[11.5px] uppercase tracking-wide">
                    <th className="px-4 py-3 text-left font-semibold w-10">#</th>
                    <th className="px-2 py-3 text-left font-semibold">Module</th>
                    <th className="px-4 py-3 text-right font-semibold">Cash (₹)</th>
                    <th className="px-4 py-3 text-right font-semibold">UPI / QR (₹)</th>
                    <th className="px-4 py-3 text-right font-semibold">Total Amount (₹)</th>
                    <th className="px-4 py-3 text-right font-semibold">Transactions</th>
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
                  <tr className="bg-amber-50/70 font-bold text-maroon-800 text-[14px]">
                    <td className="px-4 py-3.5" colSpan={2}>TOTAL</td>
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
              <CardHead icon={CreditCard} title="Payment Mode Summary" />
              <div className="p-5 flex items-center gap-5">
                <div className="shrink-0"><Donut cashPct={sum.cash_pct} upiPct={sum.upi_pct} /></div>
                <div className="flex-1 min-w-0 text-[13px]">
                  <div className="flex text-[11px] uppercase tracking-wide text-gray-400 font-semibold pb-2 border-b border-gray-100">
                    <span className="flex-1">Payment Mode</span><span className="w-20 text-right">Amount (₹)</span><span className="w-12 text-right">%</span>
                  </div>
                  <div className="flex items-center py-2.5 border-b border-gray-50">
                    <span className="flex-1 flex items-center gap-2 text-gray-700"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#7a1220' }} /> Cash</span>
                    <span className="w-20 text-right tabular-nums text-gray-700">{inr(t.cash)}</span>
                    <span className="w-12 text-right tabular-nums text-gray-500">{sum.cash_pct}%</span>
                  </div>
                  <div className="flex items-center py-2.5 border-b border-gray-50">
                    <span className="flex-1 flex items-center gap-2 text-gray-700"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#c99a2e' }} /> UPI / QR Code</span>
                    <span className="w-20 text-right tabular-nums text-gray-700">{inr(t.upi)}</span>
                    <span className="w-12 text-right tabular-nums text-gray-500">{sum.upi_pct}%</span>
                  </div>
                  <div className="flex items-center pt-2.5 font-bold text-maroon-800">
                    <span className="flex-1">Total</span>
                    <span className="w-20 text-right tabular-nums">{inr(t.total)}</span>
                    <span className="w-12 text-right tabular-nums">100%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Cash Reconciliation */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <CardHead icon={Scale} title="Cash Reconciliation" />
              <div className="p-5 text-[13.5px] space-y-3">
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
            <CardHead icon={ClipboardCheck} title="Closing Summary" />
            <div className="p-5 text-[13.5px] space-y-3">
              <Row label="Total Collections (₹)" value={inr(t.total)} valueClass="text-maroon-800 font-bold text-[15px]" />
              <Row label="(-) Refunds (₹)" value={inr(sum.refunds)} />
              <Row label="Net Collections (₹)" value={inr(sum.net_collections)} valueClass="text-emerald-600 font-bold text-[15px]" />
              <div className="border-t border-gray-100 pt-3 space-y-3">
                <Row label="Total Transactions" value={num(t.count)} />
                <Row label="Cash Transactions" value={num(sum.cash_txns)} />
                <Row label="UPI / QR Transactions" value={num(sum.upi_txns)} />
              </div>
              <div className="border-t border-gray-100 pt-3 space-y-3">
                <Row label="Cash in Hand (Expected) (₹)" value={inr(sum.expected_cash)} />
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Cash in Hand (Actual) (₹)</span>
                  <input type="number" value={actual} disabled={closed}
                    onChange={(e) => setActual(e.target.value)}
                    className="w-32 text-right tabular-nums border border-gray-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-maroon-200 focus:border-maroon-400 disabled:bg-gray-50 disabled:text-gray-500" />
                </div>
                <Row label="Difference (₹)" value={inr(closingDiff)}
                  valueClass={`font-bold ${closingDiff === 0 ? 'text-emerald-600' : 'text-rose-600'}`} />
              </div>
            </div>
          </div>

          {closed ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="inline-flex items-center gap-2 text-[13px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5">
                <CheckCircle2 size={16} /> Closed by {sum.closed_by} · {fmtStamp(sum.closed_at)}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-baseline justify-between mb-2">
                <label className="font-serif text-[15px] font-bold text-maroon-800">Closing Notes <span className="text-gray-400 font-sans font-normal text-[12px]">(Optional)</span></label>
              </div>
              <textarea rows={3} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Enter any closing notes / observations…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-[13px] focus:ring-2 focus:ring-maroon-200 focus:border-maroon-400 resize-none" />
              <div className="text-right text-[11px] text-gray-400 mt-1">{notes.length} / 500</div>

              {canClose && (
                <button onClick={closeDay} disabled={busy}
                  className="w-full mt-3 inline-flex items-center justify-center gap-2 bg-gradient-to-b from-maroon-800 to-maroon-900 text-cream font-semibold rounded-lg py-3 hover:from-maroon-700 disabled:opacity-60">
                  <Lock size={16} /> {busy ? 'Closing…' : 'Close Day & Finalize'}
                </button>
              )}

              <div className="mt-3 flex items-start gap-2.5 bg-amber-50/70 border border-amber-100 rounded-lg px-4 py-3 text-[12px] text-gray-600">
                <Info size={16} className="text-amber-500 shrink-0 mt-0.5" />
                Once the day is closed, no further transactions can be recorded for the selected date.
              </div>
              {msg && <div className="mt-3 text-[13px] text-emerald-700">{msg}</div>}
            </div>
          )}
        </div>
      </div>

      {/* ── Footer banner ── */}
      <div className="mt-6 flex items-center gap-2.5 bg-emerald-50/60 border border-emerald-100 rounded-xl px-5 py-3.5 text-[13px] text-gray-600">
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
