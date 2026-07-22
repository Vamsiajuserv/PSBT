import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Printer, Plus, Trash2, Receipt as ReceiptIcon, Search, User, X, IndianRupee, Loader2, Eye,
} from 'lucide-react'
import { PageHeader } from '../../components/common/UI.jsx'
import { Receipt } from '../../components/common/Receipt.jsx'
import { PoojasAPI, DevoteesAPI, BookingsAPI, PaymentsAPI, FestivalsAPI } from '../../api/client.js'
import { promptDialog } from '../../components/common/Dialog.jsx'

const CATS = ['All', 'Daily', 'Monthly', 'Long-Term', 'Occasion', 'Festival', 'Vehicle']

const inr = (n) => '₹ ' + Number(n || 0).toLocaleString('en-IN')
const todayISO = () => new Date().toISOString().slice(0, 10)
const stampNow = () => new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function Counter() {
  const { role } = useOutletContext()
  const canBill = role !== 'Accountant'   // Accountant has read-only oversight of the counter

  // ── Pooja catalogue — single source of truth = Pooja Master, plan-expanded ──
  // One card per (pooja, plan) so counter bookings carry pooja_id/plan_id/plan_name
  // exactly like New Booking, and the plan's validity/quota is applied server-side.
  const [catalog, setCatalog] = useState([])
  const [sevaQ, setSevaQ] = useState('')
  const [catalogErr, setCatalogErr] = useState('')
  useEffect(() => {
    PoojasAPI.list()
      .then((r) => {
        const flat = []
        for (const p of (r.items || [])) {
          for (const pl of (p.plans || [])) {
            flat.push({
              key: `${p.id}-${pl.id}`,
              pooja_id: p.id, pooja_name: p.name, name_te: p.name_te, category: p.category,
              plan_id: pl.id, plan_name: pl.plan_name,
              committee: !!pl.committee_decided,
              fee: pl.fee == null ? null : Number(pl.fee),
            })
          }
        }
        setCatalog(flat)
      })
      .catch((e) => setCatalogErr(e.detail || 'Could not load the pooja catalogue.'))
  }, [])
  // Festival windows (for auto-dating festival poojas to their festival, not today)
  const [festivals, setFestivals] = useState([])
  useEffect(() => {
    FestivalsAPI.list().then((r) => setFestivals(r.items || r || [])).catch(() => {})
  }, [])
  const festivalFor = (entry) => {
    if (entry.category !== 'Festival') return null
    const t = todayISO()
    const linked = festivals.filter((f) => f.status === 'Active' && f.start_date && f.end_date &&
      (f.pooja_ids || []).includes(entry.pooja_id))
    if (!linked.length) return { none: true }
    const current = linked.find((f) => f.start_date <= t && t <= f.end_date)
    if (current) return { date: t, name: current.name, fest: current }
    const upcoming = linked.filter((f) => f.start_date > t)
      .sort((a, b) => a.start_date.localeCompare(b.start_date))[0]
    if (upcoming) return { date: upcoming.start_date, name: upcoming.name, fest: upcoming }
    return { past: true, windows: linked.map((f) => `${f.name} (${f.start_date} – ${f.end_date})`).join(', ') }
  }

  const [cat, setCat] = useState('All')
  const filtered = useMemo(() => {
    const q = sevaQ.trim().toLowerCase()
    return catalog.filter((s) =>
      (cat === 'All' || s.category === cat) &&
      (!q || `${s.pooja_name} ${s.name_te || ''} ${s.plan_name} ${s.category || ''}`.toLowerCase().includes(q)))
  }, [catalog, sevaQ, cat])

  // ── Cart ─ each line is one pooja booking (its own ticket / quota / validity) ─
  const lineSeq = useRef(0)
  const [cart, setCart] = useState([])
  const add = async (entry) => {
    let amount = entry.fee
    // Festival poojas: scheduled for their festival window, and the committee's
    // per-festival price (set once in the Festival Master) is used when configured.
    let scheduled_date
    if (entry.category === 'Festival') {
      const fw = festivalFor(entry)
      if (fw?.past) {
        setError(`The festival window for this pooja is over (${fw.windows}). Update the Festival Master or use Advance Booking.`)
        return
      }
      if (fw?.date) scheduled_date = fw.date
      const festFee = Number(fw?.fest?.plan_fees?.[String(entry.plan_id)] || 0)
      if (festFee > 0) amount = festFee
    }
    // Vehicle poojas carry the vehicle number on the receipt.
    let vehicle_no
    if (entry.category === 'Vehicle') {
      const res = await promptDialog({
        title: 'Vehicle pooja',
        confirmLabel: 'Add to Bill',
        fields: [{ k: 'vehicle', label: 'Vehicle number', placeholder: 'e.g. TS09 AB 1234', note: 'Optional — printed on the receipt.' }],
      })
      if (!res) return
      vehicle_no = res.vehicle.trim().toUpperCase() || undefined
    }
    // Committee-decided plans (and any plan without a configured fee) need an
    // operator-entered amount — unless the festival already priced them above.
    if ((entry.committee || entry.fee == null) && !(Number(amount) > 0)) {
      const res = await promptDialog({
        title: `${entry.pooja_name} · ${entry.plan_name}`,
        message: entry.committee ? 'Committee-decided plan — enter the amount set for this occurrence.' : 'No fee is configured for this plan — enter the amount.',
        confirmLabel: 'Add to Bill',
        fields: [{ k: 'amount', label: 'Amount (₹)', type: 'number', required: true }],
      })
      if (!res) return
      amount = Number(res.amount)
      if (!(amount > 0)) { setError('Enter a valid amount.'); return }
      setError('')
    }
    setCart((c) => [...c, { ...entry, amount, scheduled_date, vehicle_no, lineId: ++lineSeq.current }])
  }
  const remove = (lineId) => setCart((c) => c.filter((x) => x.lineId !== lineId))
  const total = cart.reduce((s, x) => s + Number(x.amount || 0), 0)

  // ── Devotee (optional link to a master record; walk-ins allowed) ────────────
  const [devQ, setDevQ] = useState('')
  const [devResults, setDevResults] = useState(null)
  const [devotee, setDevotee] = useState(null)   // { id, name, mobile } when linked
  const [name, setName] = useState('')
  const [mobile, setMobile] = useState('')
  const searchRef = useRef(0)
  useEffect(() => {
    const q = devQ.trim()
    if (!q || devotee) { setDevResults(null); return }
    const seq = ++searchRef.current
    const t = setTimeout(() => {
      DevoteesAPI.list({ q, size: 6 })
        .then((r) => { if (seq === searchRef.current) setDevResults(r.items || []) })
        .catch(() => { if (seq === searchRef.current) setDevResults([]) })
    }, 250)
    return () => clearTimeout(t)
  }, [devQ, devotee])
  const pickDevotee = (d) => {
    setDevotee(d); setName(d.name); setMobile(d.mobile || ''); setDevQ(''); setDevResults(null)
  }
  const clearDevotee = () => { setDevotee(null); setName(''); setMobile(''); setDevQ('') }

  // ── Payment / checkout ──────────────────────────────────────────────────────
  const [mode, setMode] = useState('Cash')       // Cash | UPI/QR Code
  const [utr, setUtr] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [bill, setBill] = useState(null)         // completed receipt data

  async function checkout() {
    setError('')
    if (!canBill) { setError('View-only access — the Accountant role cannot issue receipts.'); return }
    if (!name.trim()) { setError('Enter the devotee / payer name.'); return }
    if (!cart.length) { setError('Add at least one pooja to the bill.'); return }
    if (mode === 'UPI/QR Code' && !utr.trim()) { setError('Enter the UTR / Transaction ID for UPI payments.'); return }
    // Long-term poojas are registrations — a linked devotee record is mandatory.
    const lt = cart.find((x) => /life|year/i.test(x.plan_name || ''))
    if (lt && !devotee) {
      setError(`"${lt.pooja_name} · ${lt.plan_name}" is a long-term pooja — search and link the registered devotee first (walk-in not allowed).`)
      return
    }
    setBusy(true)
    // Bill line-by-line, dropping each item from the cart only after it is fully
    // committed. If a line fails, the billed lines are already gone and the
    // un-billed ones remain — so a retry can never double-charge.
    const done = []
    let remaining = [...cart]
    const sum = (ls) => ls.reduce((s, x) => s + Number(x.amount || 0), 0)
    try {
      while (remaining.length) {
        const item = remaining[0]
        const b = await BookingsAPI.create({
          devotee_id: devotee?.id ?? undefined,
          devotee_name: name.trim(),
          mobile: mobile.trim() || undefined,
          pooja_id: item.pooja_id,
          plan_id: item.plan_id,
          plan_name: item.plan_name,
          seva_name: item.pooja_name,
          category: item.category || undefined,
          amount: Number(item.amount),
          scheduled_date: item.scheduled_date || todayISO(),
          vehicle_no: item.vehicle_no,
          status: 'Confirmed',
          payment_status: 'Pending',
          payment_method: mode,
          source: 'Counter',
        })
        const order = await PaymentsAPI.createOrder({ purpose: 'SEVA_BOOKING', reference_id: b.id, method: mode })
        await PaymentsAPI.verify({ payment_order_id: order.payment_order_id, method: mode })
        const confirmed = await BookingsAPI.list({ q: b.booking_code, size: 1 })
          .then((r) => r.items?.[0]).catch(() => null)
        done.push({ ...item, booking: confirmed || b })
        remaining = remaining.slice(1)
        setCart(remaining)   // keep the visible cart in sync as each line commits
      }
    } catch (err) {
      // Nothing billed yet → surface the error and keep the whole cart to retry.
      if (!done.length) {
        setError(err.detail || 'Billing failed. Please try again.')
        setBusy(false)
        return
      }
      // Otherwise fall through: `done` gets a receipt, `remaining` stays in the cart.
    }
    const failed = remaining.length
    setBill({
      lines: done,
      total: sum(done),
      name: name.trim(),
      mobile: mobile.trim(),
      mode,
      utr: utr.trim(),
      ref: done[0]?.booking?.receipt_no || done[0]?.booking?.booking_code,
      paidAt: stampNow(),
      failed,
    })
    if (failed) {
      setError(`${done.length} item(s) billed; ${failed} could not be billed and remain in the cart — retry them.`)
    } else {
      setCart([]); clearDevotee(); setUtr('')
    }
    setBusy(false)
  }

  const modeLabel = (m) => (m === 'UPI/QR Code' ? 'UPI / QR Code' : m)

  return (
    <div>
      <PageHeader
        title="Counter Billing"
        subtitle="Walk-up billing — poojas start today. For a chosen date, slot or poojari use Advance Booking."
        action={<span className="badge bg-saffron-50 text-saffron-700">Counter 1 · {role}</span>}
      />

      {catalogErr && <div className="mt-4 rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm px-4 py-2.5">{catalogErr}</div>}
      {!canBill && (
        <div className="mt-4 rounded-lg bg-blue-50 border border-blue-100 text-blue-700 text-sm px-4 py-2.5 flex items-center gap-2">
          <Eye size={15} className="shrink-0" /> View-only access — the Accountant role can review the counter but cannot issue receipts.
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        {/* ── Seva picker ── */}
        <div className="lg:col-span-2 card p-5">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <h3 className="font-bold text-gray-900">Add Poojas</h3>
            <div className="relative w-full sm:w-64">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={sevaQ} onChange={(e) => setSevaQ(e.target.value)} placeholder="Search pooja / plan…" className="input !pl-9 !py-2" />
            </div>
          </div>
          {/* Category chips — jump to a pooja type fast */}
          <div className="flex flex-wrap gap-1.5 mb-2">
            {CATS.map((c) => (
              <button key={c} onClick={() => setCat(c)}
                className={`px-3 py-1.5 rounded-full text-[0.75rem] font-semibold border transition ${cat === c ? 'bg-maroon-700 text-cream border-maroon-700' : 'bg-white text-gray-600 border-gray-200 hover:border-maroon-300'}`}>
                {c}
              </button>
            ))}
          </div>
          {cat === 'Occasion' && (
            <p className="text-[0.6875rem] text-amber-700 mb-2">Booking a ceremony for a future date (Namakaranam, Annaprasana…)? Use <b>Advance Booking</b> to pick the date, slot and poojari.</p>
          )}
          {cat === 'Festival' && (
            <p className="text-[0.6875rem] text-amber-700 mb-2">Festival poojas are automatically scheduled for their festival window from the Festival Master.</p>
          )}
          <div className="grid sm:grid-cols-2 gap-2 max-h-[32.5rem] overflow-y-auto pr-1">
            {filtered.map((s) => (
              <button key={s.key} onClick={() => add(s)} className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2.5 text-left hover:border-saffron-400 hover:bg-saffron-50 transition-colors">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-800 truncate">{s.pooja_name}</div>
                  <div className="text-[0.6875rem] text-gray-400 truncate">{s.plan_name}{s.name_te ? ` · ${s.name_te}` : ''}</div>
                </div>
                <span className="flex items-center gap-1 text-saffron-700 font-bold text-sm shrink-0">
                  <Plus size={14} />{s.committee ? <span className="text-[0.6875rem] text-amber-600 font-semibold">Committee</span> : `₹${Number(s.fee || 0).toLocaleString('en-IN')}`}
                </span>
              </button>
            ))}
            {filtered.length === 0 && <p className="text-sm text-gray-400 col-span-full text-center py-8">No matching poojas.</p>}
          </div>
        </div>

        {/* ── Bill ── */}
        <div className="card p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-1"><ReceiptIcon size={18} className="text-saffron-600" /><h3 className="font-bold text-gray-900">Bill / రసీదు</h3></div>
          <p className="text-[0.6875rem] text-gray-400 mb-3">Records a real receipt against the temple ledger</p>

          {/* Devotee */}
          <div className="mb-3">
            {devotee ? (
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2 text-sm text-emerald-800"><User size={14} /> <span className="font-semibold">{devotee.name}</span> <span className="text-emerald-600">{devotee.mobile}</span></div>
                <button onClick={clearDevotee} className="text-emerald-600 hover:text-emerald-900"><X size={15} /></button>
              </div>
            ) : (
              <div className="relative">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={devQ} onChange={(e) => setDevQ(e.target.value)} placeholder="Link devotee by name / mobile (optional)…" className="input !pl-9 !py-2 text-sm" />
                </div>
                {devResults && devResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                    {devResults.map((d) => (
                      <button key={d.id} onClick={() => pickDevotee(d)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between">
                        <span className="font-medium text-gray-800">{d.name}</span>
                        <span className="text-gray-400 text-xs">{d.mobile}</span>
                      </button>
                    ))}
                  </div>
                )}
                {devResults && devResults.length === 0 && devQ.trim() && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs text-gray-400">No match — bill as a walk-in below.</div>
                )}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <input value={name} onChange={(e) => { setName(e.target.value); if (devotee) setDevotee(null) }} placeholder="Payer name *" className="input !py-2 text-sm" />
            <input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="Mobile" className="input !py-2 text-sm" />
          </div>

          {/* Line items */}
          <div className="flex-1 space-y-2 min-h-[5rem]">
            {cart.length === 0 && <p className="text-sm text-gray-400 text-center py-6">No items added.</p>}
            {cart.map((x) => (
              <div key={x.lineId} className="flex items-center justify-between text-sm border-b border-dashed border-gray-100 pb-2">
                <div className="min-w-0">
                  <div className="font-medium text-gray-800 truncate">{x.pooja_name}</div>
                  <div className="text-[0.6875rem] text-gray-400 truncate">
                    {x.plan_name}{x.committee ? ' · Committee' : ''}
                    {x.scheduled_date && x.scheduled_date !== todayISO() ? ` · from ${x.scheduled_date}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-bold text-gray-700 text-right">₹{Number(x.amount || 0).toLocaleString('en-IN')}</span>
                  <button onClick={() => remove(x.lineId)} className="text-gray-300 hover:text-red-500" title="Remove"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>

          {/* Payment mode */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            {['Cash', 'UPI/QR Code'].map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`flex items-center justify-center gap-1.5 rounded-lg border py-2 text-sm font-medium transition ${mode === m ? 'border-saffron-400 bg-saffron-50 text-saffron-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                <IndianRupee size={14} /> {modeLabel(m)}
              </button>
            ))}
          </div>
          {mode === 'UPI/QR Code' && (
            <input value={utr} onChange={(e) => setUtr(e.target.value)} placeholder="UTR / Transaction ID *" className="input !py-2 text-sm mt-2" />
          )}

          <div className="border-t border-gray-200 mt-3 pt-3">
            <div className="flex items-center justify-between font-extrabold text-lg">
              <span>Total / మొత్తం</span><span className="text-maroon-700">{inr(total)}</span>
            </div>
            {error && <p className="text-center text-xs text-red-600 font-semibold mt-2">{error}</p>}
            <button onClick={checkout} disabled={busy || !cart.length || !canBill} className="btn-primary w-full mt-3 disabled:bg-gray-300 justify-center">
              {busy ? <><Loader2 size={16} className="animate-spin" /> Processing…</> : !canBill ? <><Eye size={16} /> View Only</> : <><ReceiptIcon size={16} /> Complete Billing</>}
            </button>
          </div>
        </div>
      </div>

      {bill && <BillReceiptModal bill={bill} onClose={() => setBill(null)} />}
    </div>
  )
}

function BillReceiptModal({ bill, onClose }) {
  const rows = [
    { en: 'Devotee', value: bill.name },
    ...(bill.mobile ? [{ en: 'Mobile', value: bill.mobile }] : []),
    ...bill.lines.map((l) => ({
      en: `${l.pooja_name} · ${l.plan_name}${l.vehicle_no ? ` · ${l.vehicle_no}` : ''}`,
      valueTe: l.name_te || undefined,
      value: `₹ ${Number(l.amount || 0).toLocaleString('en-IN')}`,
    })),
    { en: 'Payment Mode', value: bill.mode === 'UPI/QR Code' ? 'UPI / QR Code' : bill.mode },
    ...(bill.utr ? [{ en: 'UTR / Txn ID', value: bill.utr }] : []),
    { en: 'Date & Time', value: bill.paidAt },
    ...(bill.lines.length > 1
      ? [{ en: 'Tickets', value: bill.lines.map((l) => l.booking?.ticket_no || l.booking?.booking_code).filter(Boolean).join(', ') }]
      : []),
  ]
  return (
    <div className="fixed inset-0 bg-black/40 z-50 grid place-items-center p-4 print:bg-white print:static" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl shadow-xl w-full max-w-sm max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 print:hidden">
          {bill.failed
            ? <span className="text-sm font-semibold text-amber-700">⚠ Partial — {bill.failed} item(s) not billed, still in cart</span>
            : <span className="text-sm font-semibold text-emerald-700">✓ Receipt generated</span>}
          <button onClick={onClose} className="text-gray-400 hover:text-maroon-700"><X size={18} /></button>
        </div>
        <div className="p-5">
          <Receipt
            title="Counter Receipt"
            titleTe="కౌంటర్ రసీదు"
            no={bill.ref}
            subNo={bill.lines[0]?.booking?.ticket_no}
            subNoLabel="Ticket No"
            rows={rows}
            amount={bill.total}
            footerNote="Please retain this receipt for your records."
          />
        </div>
        <div className="flex gap-2 px-5 py-4 border-t border-gray-100 print:hidden">
          <button onClick={() => window.print()} className="btn-outline flex-1 justify-center"><Printer size={15} /> Print</button>
          <button onClick={onClose} className="btn-maroon flex-1 justify-center">New Bill</button>
        </div>
      </div>
    </div>
  )
}
