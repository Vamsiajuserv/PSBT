import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Printer, Plus, Minus, Trash2, Receipt as ReceiptIcon, Search, User, X, IndianRupee, Loader2,
} from 'lucide-react'
import { PageHeader } from '../../components/common/UI.jsx'
import { Receipt } from '../../components/common/Receipt.jsx'
import { SevasAPI, DevoteesAPI, BookingsAPI, PaymentsAPI } from '../../api/client.js'

const inr = (n) => '₹ ' + Number(n || 0).toLocaleString('en-IN')
const todayISO = () => new Date().toISOString().slice(0, 10)
const stampNow = () => new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function Counter() {
  const { role } = useOutletContext()

  // ── Seva catalogue ─────────────────────────────────────────────────────────
  const [sevas, setSevas] = useState([])
  const [sevaQ, setSevaQ] = useState('')
  const [catalogErr, setCatalogErr] = useState('')
  useEffect(() => {
    SevasAPI.list({ active_only: true })
      .then((r) => setSevas(r || []))
      .catch((e) => setCatalogErr(e.detail || 'Could not load services.'))
  }, [])
  const filteredSevas = useMemo(() => {
    const q = sevaQ.trim().toLowerCase()
    if (!q) return sevas
    return sevas.filter((s) => `${s.name} ${s.name_te || ''} ${s.category || ''}`.toLowerCase().includes(q))
  }, [sevas, sevaQ])

  // ── Cart ───────────────────────────────────────────────────────────────────
  const [cart, setCart] = useState([])
  const add = (s) => {
    setCart((c) => {
      const ex = c.find((x) => x.id === s.id)
      if (ex) return c.map((x) => (x.id === s.id ? { ...x, qty: x.qty + 1 } : x))
      return [...c, { ...s, qty: 1 }]
    })
  }
  const setQty = (id, delta) =>
    setCart((c) => c.map((x) => (x.id === id ? { ...x, qty: Math.max(1, x.qty + delta) } : x)))
  const remove = (id) => setCart((c) => c.filter((x) => x.id !== id))
  const total = cart.reduce((s, x) => s + Number(x.amount) * x.qty, 0)

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
    if (!name.trim()) { setError('Enter the devotee / payer name.'); return }
    if (!cart.length) { setError('Add at least one service to the bill.'); return }
    if (mode === 'UPI/QR Code' && !utr.trim()) { setError('Enter the UTR / Transaction ID for UPI payments.'); return }
    setBusy(true)
    try {
      const lines = []
      for (const item of cart) {
        const b = await BookingsAPI.create({
          devotee_id: devotee?.id ?? undefined,
          devotee_name: name.trim(),
          mobile: mobile.trim() || undefined,
          seva_id: item.id,
          seva_name: item.name,
          category: item.category || undefined,
          amount: Number(item.amount) * item.qty,
          scheduled_date: todayISO(),
          time_slot: item.slot || undefined,
          status: 'Confirmed',
          payment_status: 'Pending',
          payment_method: mode,
          source: 'Counter',
        })
        const order = await PaymentsAPI.createOrder({ purpose: 'SEVA_BOOKING', reference_id: b.id, method: mode })
        await PaymentsAPI.verify({ payment_order_id: order.payment_order_id, method: mode })
        const confirmed = await BookingsAPI.list({ q: b.booking_code, size: 1 })
          .then((r) => r.items?.[0]).catch(() => null)
        lines.push({ ...item, booking: confirmed || b })
      }
      setBill({
        lines,
        total,
        name: name.trim(),
        mobile: mobile.trim(),
        mode,
        utr: utr.trim(),
        ref: lines[0]?.booking?.receipt_no || lines[0]?.booking?.booking_code,
        paidAt: stampNow(),
      })
      // reset the counter for the next customer
      setCart([]); clearDevotee(); setUtr('')
    } catch (err) {
      setError(err.detail || 'Billing failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const modeLabel = (m) => (m === 'UPI/QR Code' ? 'UPI / QR Code' : m)

  return (
    <div>
      <PageHeader
        title="Counter Billing"
        subtitle="Issue seva / donation receipts at the counter"
        action={<span className="badge bg-saffron-50 text-saffron-700">Counter 1 · {role}</span>}
      />

      {catalogErr && <div className="mt-4 rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm px-4 py-2.5">{catalogErr}</div>}

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        {/* ── Seva picker ── */}
        <div className="lg:col-span-2 card p-5">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <h3 className="font-bold text-gray-900">Add Services</h3>
            <div className="relative w-full sm:w-64">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={sevaQ} onChange={(e) => setSevaQ(e.target.value)} placeholder="Search service…" className="input !pl-9 !py-2" />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-2 max-h-[520px] overflow-y-auto pr-1">
            {filteredSevas.map((s) => (
              <button key={s.id} onClick={() => add(s)} className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2.5 text-left hover:border-saffron-400 hover:bg-saffron-50 transition-colors">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-800 truncate">{s.name}</div>
                  <div className="text-[11px] text-gray-400 truncate">{s.name_te || s.category}</div>
                </div>
                <span className="flex items-center gap-1 text-saffron-700 font-bold text-sm shrink-0"><Plus size={14} />₹{Number(s.amount).toLocaleString('en-IN')}</span>
              </button>
            ))}
            {filteredSevas.length === 0 && <p className="text-sm text-gray-400 col-span-full text-center py-8">No matching services.</p>}
          </div>
        </div>

        {/* ── Bill ── */}
        <div className="card p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-1"><ReceiptIcon size={18} className="text-saffron-600" /><h3 className="font-bold text-gray-900">Bill / రసీదు</h3></div>
          <p className="text-[11px] text-gray-400 mb-3">Records a real receipt against the temple ledger</p>

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
          <div className="flex-1 space-y-2 min-h-[80px]">
            {cart.length === 0 && <p className="text-sm text-gray-400 text-center py-6">No items added.</p>}
            {cart.map((x) => (
              <div key={x.id} className="flex items-center justify-between text-sm border-b border-dashed border-gray-100 pb-2">
                <div className="min-w-0">
                  <div className="font-medium text-gray-800 truncate">{x.name}</div>
                  <div className="text-[11px] text-gray-400">₹{Number(x.amount).toLocaleString('en-IN')} each</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-1">
                    <button onClick={() => setQty(x.id, -1)} className="w-6 h-6 grid place-items-center rounded border border-gray-200 text-gray-500 hover:bg-gray-50"><Minus size={12} /></button>
                    <span className="w-5 text-center font-semibold">{x.qty}</span>
                    <button onClick={() => setQty(x.id, +1)} className="w-6 h-6 grid place-items-center rounded border border-gray-200 text-gray-500 hover:bg-gray-50"><Plus size={12} /></button>
                  </div>
                  <span className="font-bold text-gray-700 w-16 text-right">₹{(Number(x.amount) * x.qty).toLocaleString('en-IN')}</span>
                  <button onClick={() => remove(x.id)} className="text-gray-300 hover:text-red-500" title="Remove"><Trash2 size={14} /></button>
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
            <button onClick={checkout} disabled={busy || !cart.length} className="btn-primary w-full mt-3 disabled:bg-gray-300 justify-center">
              {busy ? <><Loader2 size={16} className="animate-spin" /> Processing…</> : <><ReceiptIcon size={16} /> Complete Billing</>}
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
      en: `${l.name}${l.qty > 1 ? ` × ${l.qty}` : ''}`,
      valueTe: l.name_te || undefined,
      value: `₹ ${(Number(l.amount) * l.qty).toLocaleString('en-IN')}`,
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
          <span className="text-sm font-semibold text-emerald-700">✓ Receipt generated</span>
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
