import React, { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  Search, UserPlus, User, ArrowRight, ArrowLeft, Check, Info, X, Calendar, Clock,
  Flame, CalendarDays, Tag, ShieldCheck, IndianRupee, Landmark, CheckCircle2, Printer,
  Download, Plus, ClipboardList, CreditCard, Ticket,
} from 'lucide-react'
import { DevoteesAPI, PoojasAPI, BookingsAPI, PaymentsAPI, PoojarisAPI, FestivalsAPI } from '../../api/client.js'
import { inr, fmtDate } from '../../components/admin/ui.jsx'
import { TicketRef } from '../../components/admin/BookingTicket.jsx'
import { Select, DateField, NumberField } from '../../components/common/Field.jsx'
import { T, tr } from '../../i18n/LanguageContext.jsx'

const STEPS = [
  { t: 'Booking Details', s: 'Enter booking information' },
  { t: 'Review & Payment', s: 'Confirm and make payment' },
  { t: 'Confirmation & Ticket', s: 'Booking confirmation and ticket' },
]
// Canonical bookable time slots (kept in sync with the poojari schedule).
const SLOTS = [
  '06:00 AM - 07:00 AM', '07:30 AM - 08:30 AM', '09:00 AM - 10:00 AM',
  '10:30 AM - 11:30 AM', '12:00 PM - 01:00 PM', '04:00 PM - 05:00 PM',
]
const money2 = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const stampNow = () => new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const shortPooja = (name) => (name || '').replace(/^Sri Shirdi Sai Baba\s+/i, '').split(' ').slice(-1)[0]

function durDays(pl) {
  const n = (pl?.plan_name || '').toLowerCase()
  if (n.includes('life')) return null
  if (pl?.duration_days) return pl.duration_days
  if (n.includes('daily') || n.includes('one')) return 1
  if (n.includes('monthly')) return 30
  if (n.includes('year')) return 365
  return 1
}
const validityShort = (pl) => {
  const n = (pl?.plan_name || '').toLowerCase()
  if (n.includes('daily')) return '1 Day'
  if (n.includes('monthly')) return '1 Month'
  if (n.includes('life')) return 'Lifetime'
  if (n.includes('one')) return 'One-Time'
  if (n.includes('year')) return '1 Year'
  return pl?.frequency || 'Selected Date'
}
function validityRange(pl, from) {
  const d = durDays(pl)
  if (d === null) return 'Lifetime'
  const to = addDays(from, d - 1)
  return `${d} Day${d > 1 ? 's' : ''} (${fmtDate(from)} to ${fmtDate(to)})`
}

// Ticket reference with the real scannable QR (shared component — see
// BookingTicket.jsx; the QR encodes the code the Verify Ticket screen expects).

function Stepper({ step }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-2 mb-5 flex items-stretch gap-1">
      {STEPS.map((s, i) => {
        const done = i < step, active = i === step, banner = active && step > 0
        const sub = done ? 'Completed' : active ? (i === 0 ? s.s : (step === STEPS.length - 1 ? 'Completed' : 'In Progress')) : 'Pending'
        return (
          <React.Fragment key={i}>
            <div className={`flex items-center gap-3 px-4 py-3 flex-1 ${banner ? 'bg-maroon-800 text-cream' : ''}`}
              style={banner ? { clipPath: 'polygon(0 0, calc(100% - 16px) 0, 100% 50%, calc(100% - 16px) 100%, 0 100%)', borderRadius: 8 } : {}}>
              <div className={`w-8 h-8 rounded-full grid place-items-center text-sm font-bold shrink-0 ${done ? 'bg-emerald-500 text-white' : banner ? 'bg-white text-maroon-800' : active ? 'bg-maroon-800 text-white' : 'bg-gray-100 text-gray-400'}`}>{done ? <Check size={16} /> : i + 1}</div>
              <div className="hidden md:block">
                <div className={`text-[0.8125rem] font-bold ${banner ? 'text-cream' : active ? 'text-maroon-800' : done ? 'text-gray-700' : 'text-gray-400'}`}>{s.t}</div>
                <div className={`text-[0.6875rem] ${banner ? 'text-cream/70' : 'text-gray-400'}`}>{sub}</div>
              </div>
            </div>
            {i < STEPS.length - 1 && <div className="w-8 self-center h-0.5 bg-gray-200 shrink-0" />}
          </React.Fragment>
        )
      })}
    </div>
  )
}

export default function NewBooking() {
  const nav = useNavigate()
  const [step, setStep] = useState(0)
  const [poojas, setPoojas] = useState([])

  const [searchBy, setSearchBy] = useState('Mobile Number')
  const [devQ, setDevQ] = useState('')
  const [devResults, setDevResults] = useState(null)
  const [devotee, setDevotee] = useState(null)

  const [poojaId, setPoojaId] = useState('')
  const [plan, setPlan] = useState(null)
  const [schedDate, setSchedDate] = useState(new Date().toISOString().slice(0, 10))
  const [slot, setSlot] = useState(SLOTS[0])
  const [poojaris, setPoojaris] = useState([])
  const [poojariId, setPoojariId] = useState('')
  const [method, setMethod] = useState('Cash')
  const [utr, setUtr] = useState('')
  // Committee-decided plans have no fixed fee — the operator enters the amount the
  // committee set for this occurrence. Kept separate from the fixed-fee path.
  const [committeeAmt, setCommitteeAmt] = useState('')
  // Sankalpam details — prefilled from the devotee record, printed on the ticket.
  const [gothram, setGothram] = useState('')
  const [nakshatram, setNakshatram] = useState('')
  const [beneficiary, setBeneficiary] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ticket, setTicket] = useState(null)

  // Inline "quick add devotee" — stays inside the wizard, no navigation / state loss.
  const [quickAdd, setQuickAdd] = useState(null)   // null | {name, mobile, email}
  const [qaBusy, setQaBusy] = useState(false)
  const [qaErr, setQaErr] = useState('')

  useEffect(() => { PoojasAPI.list().then((d) => setPoojas(d.items)).catch(() => {}) }, [])
  // A fresh plan selection clears any previously entered committee amount.
  useEffect(() => { setCommitteeAmt('') }, [plan])
  // Prefill sankalpam details from the selected devotee's record.
  useEffect(() => {
    setGothram(devotee?.gothram || '')
    setNakshatram(devotee?.nakshatram || '')
    setBeneficiary('')
  }, [devotee])
  useEffect(() => { PoojarisAPI.list().then((d) => setPoojaris((Array.isArray(d) ? d : d?.items || []).filter((p) => p.active))).catch(() => {}) }, [])

  // Festival windows — a Festival-category pooja defaults its date into the
  // configured festival window (the backend also enforces this).
  const [festivals, setFestivals] = useState([])
  useEffect(() => { FestivalsAPI.list().then((r) => setFestivals(r.items || r || [])).catch(() => {}) }, [])

  // Debounced auto-search as the user types (mirrors the Devotees master screen).
  useEffect(() => {
    if (devotee) return
    const q = devQ.trim()
    if (q.length < 2) { setDevResults(null); return }
    const t = setTimeout(() => { DevoteesAPI.list({ q, size: 8 }).then((r) => setDevResults(r.items)).catch(() => {}) }, 300)
    return () => clearTimeout(t)
  }, [devQ, devotee])

  const pooja = poojas.find((p) => String(p.id) === String(poojaId)) || null

  // Active festival window linked to the selected pooja (if it is a Festival pooja).
  const festWindow = (() => {
    if (!pooja || pooja.category !== 'Festival') return null
    const linked = festivals.filter((f) => f.status === 'Active' && f.start_date && f.end_date &&
      (f.pooja_ids || []).includes(pooja.id))
    if (!linked.length) return null
    const t = new Date().toISOString().slice(0, 10)
    return linked.find((f) => f.start_date <= t && t <= f.end_date) ||
           linked.filter((f) => f.start_date > t).sort((a, b) => a.start_date.localeCompare(b.start_date))[0] ||
           linked[0]
  })()
  // Default the booking date into the festival window when a festival pooja is picked.
  useEffect(() => {
    if (!festWindow) return
    const t = new Date().toISOString().slice(0, 10)
    setSchedDate(festWindow.start_date <= t && t <= festWindow.end_date ? t : festWindow.start_date)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poojaId, festivals.length])

  // The committee's per-festival price (set once in the Festival Master) is
  // authoritative for committee plans when configured; else the operator enters it.
  const festCommitteeFee = plan?.committee_decided
    ? Number(festWindow?.plan_fees?.[String(plan.id)] || 0) : 0
  const fee = plan?.committee_decided
    ? (festCommitteeFee > 0 ? festCommitteeFee : Number(committeeAmt || 0))
    : Number(plan?.fee || 0)
  const rateType = plan?.committee_decided ? 'Committee Decided' : 'Fixed Amount'
  // Committee-decided bookings must carry a positive, operator-entered amount.
  const amountReady = fee > 0

  async function search() {
    const r = await DevoteesAPI.list({ q: devQ, size: 8 })
    setDevResults(r.items)
  }

  // Open the inline quick-add, pre-filling from whatever was already typed.
  function openQuickAdd() {
    const q = devQ.trim()
    const isMobile = /^\d{6,}$/.test(q)
    setQaErr('')
    setQuickAdd({ name: isMobile ? '' : q, mobile: isMobile ? q : '', email: '' })
  }
  async function saveQuickAdd() {
    setQaErr('')
    if (!quickAdd.name.trim() || !quickAdd.mobile.trim()) { setQaErr('Name and mobile are required.'); return }
    if (!/^\d{10}$/.test(quickAdd.mobile.trim())) { setQaErr('Enter a valid 10-digit mobile number.'); return }
    setQaBusy(true)
    try {
      const d = await DevoteesAPI.create({
        name: quickAdd.name.trim(), mobile: quickAdd.mobile.trim(),
        email: quickAdd.email.trim() || undefined,
      })
      setDevotee(d)            // drop straight into the booking — no page change
      setQuickAdd(null); setDevResults(null); setDevQ('')
    } catch (ex) { setQaErr(ex.detail || 'Could not create devotee.') } finally { setQaBusy(false) }
  }
  async function pay() {
    setError('')
    if (plan?.committee_decided && !amountReady) {
      setError('Enter the committee-decided amount for this pooja before confirming.'); return
    }
    setBusy(true)
    try {
      const b = await BookingsAPI.create({
        devotee_id: devotee.id, devotee_name: devotee.name, mobile: devotee.mobile,
        pooja_id: pooja.id, plan_id: plan.id, category: pooja.category, plan_name: plan.plan_name,
        seva_name: pooja.name, amount: fee, scheduled_date: schedDate, time_slot: slot,
        gothram: gothram.trim() || undefined, nakshatram: nakshatram.trim() || undefined,
        beneficiary_name: beneficiary.trim() || undefined,
        status: 'Confirmed', payment_status: 'Pending', payment_method: method, source: 'Counter',
      })
      const order = await PaymentsAPI.createOrder({ purpose: 'SEVA_BOOKING', reference_id: b.id, method })
      await PaymentsAPI.verify({ payment_order_id: order.payment_order_id, method })
      // Optional poojari assignment — must never break the confirmed booking/ticket.
      if (poojariId) {
        try { await PoojarisAPI.assign(b.id, Number(poojariId)) } catch { /* assignment is best-effort */ }
      }
      const assignedPoojari = poojaris.find((p) => String(p.id) === String(poojariId)) || null
      const confirmed = await BookingsAPI.list({ q: b.booking_code, size: 1 }).then((r) => r.items?.[0]).catch(() => null)
      setTicket({ ...(confirmed || b), _paidAt: stampNow(), _method: method, _utr: utr, _poojari: assignedPoojari?.name || null })
      setStep(2)
    } catch (err) { setError(err.detail || 'Payment failed. Please try again.') } finally { setBusy(false) }
  }

  const canNext = devotee && plan && schedDate
  const validText = plan ? validityRange(plan, schedDate) : ''
  const modeLabel = (m) => (m === 'UPI/QR Code' ? 'UPI / QR Code' : m)

  // summary rows shared by step 2 & 3
  const summaryRows = (t) => [
    { icon: User, k: 'Devotee', v: `${devotee?.name} (${devotee?.mobile})` },
    { icon: Landmark, k: 'Pooja', v: pooja?.name },
    { icon: CalendarDays, k: 'Plan', v: `${plan?.plan_name} ${shortPooja(pooja?.name)}` },
    { icon: Tag, k: 'Plan Type', v: plan?.plan_name },
    { icon: Calendar, k: 'Booking Date', v: fmtDate(schedDate) },
    { icon: Clock, k: 'Time Slot', v: slot },
    ...(poojariId ? [{ icon: User, k: 'Poojari', v: poojaris.find((p) => String(p.id) === String(poojariId))?.name || '—' }] : []),
    { icon: ShieldCheck, k: 'Validity', v: validText },
    { icon: IndianRupee, k: 'Rate Type', v: rateType },
    ...(t ? [{ icon: IndianRupee, k: 'Amount Paid (₹)', v: money2(fee) }] : []),
  ]

  return (
    <div>
      <div className="text-[0.75rem] text-gray-400 mb-1"><Link to="/admin/bookings" className="hover:text-maroon-600"><T>Pooja Management</T></Link> › <Link to="/admin/bookings" className="hover:text-maroon-600"><T>Bookings</T></Link> › <span className="text-gray-500"><T>Advance Pooja Booking</T></span></div>
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="font-serif text-[1.625rem] font-bold text-maroon-800"><T>Advance Pooja Booking</T></h1>
          <p className="text-[0.78125rem] text-gray-500 mt-0.5"><T>Schedule a pooja for a chosen date, time slot and poojari. For walk-up billing use Counter Billing.</T></p>
        </div>
        <button onClick={() => nav('/admin/bookings')} className="btn-outline !py-2.5"><ArrowLeft size={15} />{' '}<T>Back to Bookings</T></button>
      </div>

      <Stepper step={step} />
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">{error}</div>}

      {/* ── Step 1: Booking Details ── */}
      {step === 0 && (
        <div className="space-y-5">
          {/* 1. Devotee Search & Selection */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 text-maroon-700 mb-4"><User size={18} /><h3 className="font-serif text-lg font-bold">1. Devotee Search &amp; Selection</h3></div>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1.2fr_auto] gap-5 items-start">
              <div>
                <label className="label"><T>Search By</T></label>
                <div className="flex gap-5 mb-3 mt-1">
                  {['Mobile Number', 'Devotee Name'].map((o) => (
                    <label key={o} className="flex items-center gap-2 text-sm text-gray-700"><input type="radio" name="sby" className="accent-maroon-700" checked={searchBy === o} onChange={() => setSearchBy(o)} /> {o}</label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input className="input flex-1" placeholder={`Enter ${searchBy.toLowerCase()}`} value={devQ} onChange={(e) => setDevQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
                  <button type="button" onClick={search} className="btn-maroon !px-4"><Search size={15} />{' '}<T>Search</T></button>
                </div>
              </div>
              <div className="hidden lg:flex flex-col items-center justify-center text-[0.75rem] text-gray-400 self-stretch"><div className="flex-1 w-px bg-gray-100" /><span className="py-1"><T>OR</T></span><div className="flex-1 w-px bg-gray-100" /></div>
              <div>
                <label className="label"><T>Select Devotee</T></label>
                {devotee ? (
                  <>
                    <div className="flex items-center gap-3 border border-gray-200 rounded-xl px-3.5 py-3 bg-gray-50/50">
                      <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 grid place-items-center"><User size={18} /></div>
                      <div className="flex-1"><div className="font-bold text-gray-800">{devotee.name}</div><div className="text-[0.75rem] text-gray-500">{devotee.mobile}</div></div>
                      <button type="button" onClick={() => setDevotee(null)} className="text-gray-400 hover:text-red-600"><X size={16} /></button>
                    </div>
                    {/* Sankalpam details — printed on the ticket for the poojari */}
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      <div><label className="label !text-[0.6875rem]"><T>Gothram</T></label>
                        <input className="input !py-2 text-sm" value={gothram} onChange={(e) => setGothram(e.target.value)} placeholder={tr("Gothram")} /></div>
                      <div><label className="label !text-[0.6875rem]"><T>Nakshatram</T></label>
                        <input className="input !py-2 text-sm" value={nakshatram} onChange={(e) => setNakshatram(e.target.value)} placeholder={tr("Nakshatram")} /></div>
                      <div><label className="label !text-[0.6875rem]"><T>In the name of</T></label>
                        <input className="input !py-2 text-sm" value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)} placeholder={tr("Optional — e.g. the child")} /></div>
                    </div>
                  </>
                ) : devResults === null ? (
                  <div className="border border-dashed border-gray-200 rounded-xl px-3.5 py-4 text-[0.8125rem] text-gray-400 text-center"><T>Search and select a devotee.</T></div>
                ) : (
                  <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-40 overflow-y-auto">
                    {devResults.map((d) => (
                      <button key={d.id} type="button" onClick={() => setDevotee(d)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50">
                        <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-700 grid place-items-center text-[0.75rem] font-bold">{d.name[0]}</div>
                        <div className="flex-1 min-w-0"><div className="font-semibold text-gray-800 text-[0.8125rem]">{d.name}</div><div className="text-[0.6875rem] text-gray-400">{d.code} · {d.mobile}</div></div>
                      </button>
                    ))}
                    {devResults.length === 0 && (
                      <div className="px-3 py-4 text-center">
                        <div className="text-gray-400 text-[0.8125rem] mb-2">No devotee found for “{devQ}”.</div>
                        <button type="button" onClick={openQuickAdd} className="inline-flex items-center gap-1.5 text-[0.78125rem] font-semibold text-maroon-700 border border-maroon-200 rounded-lg px-3 py-1.5 hover:bg-maroon-50"><UserPlus size={14} /> Create devotee “{devQ}”</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="self-end"><button type="button" onClick={openQuickAdd} className="btn-outline whitespace-nowrap"><UserPlus size={15} />{' '}<T>Register New Devotee</T></button></div>
            </div>

            {/* Inline quick-add — 2 fields, no navigation, no lost progress */}
            {quickAdd && (
              <div className="mt-4 border border-maroon-200 bg-maroon-50/30 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-maroon-700"><UserPlus size={16} /><h4 className="font-semibold text-[0.875rem]"><T>Quick Add Devotee</T></h4></div>
                  <button type="button" onClick={() => setQuickAdd(null)} className="text-gray-400 hover:text-red-600"><X size={16} /></button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div><label className="label"><T>Full Name *</T></label><input autoFocus className="input" placeholder={tr("Devotee name")} value={quickAdd.name} onChange={(e) => setQuickAdd((q) => ({ ...q, name: e.target.value }))} /></div>
                  <div><label className="label"><T>Mobile Number *</T></label><input className="input" placeholder={tr("10-digit mobile")} value={quickAdd.mobile} maxLength={10} onChange={(e) => setQuickAdd((q) => ({ ...q, mobile: e.target.value.replace(/\D/g, '') }))} /></div>
                  <div><label className="label">Email (optional)</label><input className="input" placeholder={tr("email@example.com")} value={quickAdd.email} onChange={(e) => setQuickAdd((q) => ({ ...q, email: e.target.value }))} /></div>
                </div>
                {qaErr && <div className="text-[0.75rem] text-red-600 mt-2">{qaErr}</div>}
                <div className="flex items-center gap-2 mt-3">
                  <button type="button" onClick={saveQuickAdd} disabled={qaBusy} className="btn-maroon !py-2 disabled:opacity-60"><Check size={15} /> {qaBusy ? 'Saving…' : 'Add & Select'}</button>
                  <button type="button" onClick={() => setQuickAdd(null)} className="btn-outline !py-2"><T>Cancel</T></button>
                  <span className="text-[0.71875rem] text-gray-400 ml-1"><T>You can complete the full profile later from Devotee Management.</T></span>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.6fr] gap-5">
            {/* 2. Pooja Selection */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 text-maroon-700 mb-4"><Flame size={18} /><h3 className="font-serif text-lg font-bold"><T>2. Pooja Selection</T></h3></div>
              <label className="label"><T>Select Pooja *</T></label>
              <Select value={poojaId} onChange={(e) => { setPoojaId(e.target.value); setPlan(null) }} className="input"><option value="">Select a pooja…</option>{poojas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
              <div className="mt-4 bg-blue-50/60 border border-blue-100 rounded-lg px-3.5 py-2.5 text-[0.78125rem] text-gray-600 flex items-start gap-2"><Info size={15} className="text-blue-500 shrink-0 mt-0.5" />{' '}<T>Only plans configured for the selected pooja are shown below.</T></div>
            </div>

            {/* 3. Plan Selection */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 text-maroon-700 mb-4"><CalendarDays size={18} /><h3 className="font-serif text-lg font-bold"><T>3. Plan Selection</T></h3></div>
              {!pooja ? (
                <div className="border border-dashed border-gray-200 rounded-xl px-4 py-10 text-center text-gray-400 text-[0.8125rem]"><T>Select a pooja to view available plans.</T></div>
              ) : (
                <div className="border border-gray-100 rounded-xl overflow-hidden overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-gray-50/70 text-left text-[0.65625rem] uppercase tracking-wide text-gray-500"><th className="px-4 py-2.5"><T>Plan Name</T></th><th className="px-2 py-2.5"><T>Plan Type</T></th><th className="px-2 py-2.5 text-right">Rate (₹)</th><th className="px-2 py-2.5"><T>Validity</T></th><th className="px-2 py-2.5"><T>Availability</T></th><th className="px-2 py-2.5"><T>Select</T></th></tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {pooja.plans.map((pl) => {
                        const on = plan?.id === pl.id
                        return (
                          <tr key={pl.id} className={on ? 'bg-maroon-50/40' : 'hover:bg-gray-50/60'}>
                            <td className="px-4 py-3 font-semibold text-gray-800"><span className="inline-flex items-center gap-2"><span onClick={() => setPlan(pl)} className={`w-4 h-4 rounded-full border-2 grid place-items-center cursor-pointer ${on ? 'border-maroon-600' : 'border-gray-300'}`}>{on && <span className="w-2 h-2 rounded-full bg-maroon-600" />}</span>{pl.plan_name} {shortPooja(pooja.name)}</span></td>
                            <td className="px-2 py-3 text-gray-600">{pl.plan_name}</td>
                            <td className="px-2 py-3 text-right font-semibold text-gray-800">{pl.committee_decided ? <span className="text-amber-600 text-[0.75rem]"><T>Committee</T></span> : money2(pl.fee)}</td>
                            <td className="px-2 py-3 text-gray-600 text-[0.8125rem]">{validityShort(pl)}</td>
                            <td className="px-2 py-3"><span className="text-[0.6875rem] font-semibold text-emerald-700 bg-emerald-50 rounded-full px-2.5 py-0.5"><T>Available</T></span></td>
                            <td className="px-2 py-3">{on ? <span className="text-[0.75rem] font-semibold text-maroon-700 inline-flex items-center gap-1"><Check size={13} />{' '}<T>Selected</T></span> : <button type="button" onClick={() => setPlan(pl)} className="text-[0.75rem] font-semibold rounded-lg px-3 py-1 border border-maroon-200 text-maroon-700 hover:bg-maroon-50"><T>Select</T></button>}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* 4. Booking Date */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 text-maroon-700 mb-4"><Calendar size={18} /><h3 className="font-serif text-lg font-bold"><T>4. Booking Date</T></h3></div>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_1fr] gap-5 items-start">
              {plan ? (
                <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl px-4 py-3.5 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 grid place-items-center shrink-0"><CalendarDays size={18} /></div>
                  <div><div className="font-bold text-gray-800">{plan.plan_name} {shortPooja(pooja?.name)}</div><div className="text-[0.75rem] text-gray-500">{plan.plan_name} · {plan.committee_decided ? 'Committee' : inr(plan.fee)} · Validity: {validityShort(plan)}</div></div>
                </div>
              ) : <div className="border border-dashed border-gray-200 rounded-xl px-4 py-4 text-center text-gray-400 text-[0.8125rem]"><T>Select a plan first.</T></div>}
              <div>
                <label className="label"><T>Booking Date *</T></label>
                <DateField value={schedDate}
                  min={festWindow?.start_date && festWindow.start_date > new Date().toISOString().slice(0, 10) ? festWindow.start_date : new Date().toISOString().slice(0, 10)} max={festWindow?.end_date}
                  onChange={(e) => setSchedDate(e.target.value)} />
                {festWindow && (
                  <div className="text-[0.75rem] text-amber-700 mt-1.5">
                    {festWindow.name}: {festWindow.start_date} – {festWindow.end_date} — the booking date must fall in this festival window.
                  </div>
                )}
                {plan && <div className="text-[0.75rem] text-gray-400 mt-1.5">Booking will be valid for {validityShort(plan)} from the selected date.</div>}
              </div>
              <div>
                <label className="label"><T>Time Slot *</T></label>
                <Select value={slot} onChange={(e) => setSlot(e.target.value)}>{SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}</Select>
                <div className="text-[0.75rem] text-gray-400 mt-1.5"><T>Select the pooja timing slot for the booking.</T></div>
              </div>
              <div>
                <label className="label">Assign Poojari (Optional)</label>
                <Select value={poojariId} onChange={(e) => setPoojariId(e.target.value)}><option value="">Not assigned</option>{poojaris.map((p) => <option key={p.id} value={p.id}>{p.name}{p.specialization ? ` · ${p.specialization}` : ''}</option>)}</Select>
                <div className="text-[0.75rem] text-gray-400 mt-1.5"><T>Optionally assign a poojari to perform this booking.</T></div>
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <button onClick={() => nav('/admin/bookings')} className="btn-outline"><T>Cancel</T></button>
            <button onClick={() => setStep(1)} disabled={!canNext} className="btn-maroon disabled:opacity-40">Next: Review &amp; Payment <ArrowRight size={15} /></button>
          </div>
        </div>
      )}

      {/* ── Step 2: Review & Payment ── */}
      {step === 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-5">
          <div className="space-y-5">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 text-maroon-700 mb-4"><ClipboardList size={18} /><h3 className="font-serif text-lg font-bold"><T>1. Booking Summary</T></h3></div>
              <div className="divide-y divide-gray-100">
                {summaryRows(false).map((r) => { const Icon = r.icon; return (
                  <div key={r.k} className="flex items-center gap-3 py-2.5 text-[0.84375rem]"><Icon size={15} className="text-gray-400 shrink-0" /><span className="text-gray-500 w-32 shrink-0">{r.k}</span><span className="text-gray-400">:</span><span className="text-gray-800 font-medium">{r.v}</span></div>
                ) })}
              </div>
              <div className="mt-3 bg-blue-50/60 border border-blue-100 rounded-lg px-3.5 py-2.5 text-[0.78125rem] text-gray-600 flex items-start gap-2"><Info size={15} className="text-blue-500 shrink-0 mt-0.5" />{' '}<T>Please verify all details before proceeding to payment.</T></div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 text-maroon-700 mb-4"><CreditCard size={18} /><h3 className="font-serif text-lg font-bold"><T>2. Payment Details</T></h3></div>
              <label className="label"><T>Select Payment Mode *</T></label>
              <div className="grid grid-cols-2 gap-3 mt-1 mb-3">
                {['Cash', 'UPI/QR Code'].map((m) => { const on = method === m; return (
                  <button type="button" key={m} onClick={() => setMethod(m)} className={`flex items-center gap-2.5 border rounded-lg px-4 py-3 ${on ? 'border-maroon-400 bg-maroon-50/40 ring-1 ring-maroon-200' : 'border-gray-200 hover:border-maroon-300'}`}>
                    <span className={`w-4 h-4 rounded-full border-2 grid place-items-center ${on ? 'border-maroon-600' : 'border-gray-300'}`}>{on && <span className="w-2 h-2 rounded-full bg-maroon-600" />}</span>
                    {m === 'Cash' ? <IndianRupee size={16} className="text-emerald-600" /> : <Ticket size={16} className="text-blue-600" />}
                    <span className="text-[0.8125rem] font-semibold text-gray-700">{modeLabel(m)}</span>
                  </button>
                ) })}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                <div>
                  <div className="bg-amber-50/60 border border-amber-100 rounded-lg px-3.5 py-2.5 text-[0.75rem] text-gray-600 flex items-start gap-2 mb-3"><Info size={14} className="text-amber-600 shrink-0 mt-0.5" />{' '}<T>If payment mode is UPI / QR Code, please enter the UTR / Transaction ID.</T></div>
                  <label className="label">Payment Date &amp; Time</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1"><input className="input pr-8 bg-gray-50" value={fmtDate(new Date().toISOString())} readOnly /><Calendar size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" /></div>
                    <div className="relative flex-1"><input className="input pr-8 bg-gray-50" value={new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} readOnly /><Clock size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" /></div>
                  </div>
                </div>
                <div>
                  <label className="label">UTR / Transaction ID (For UPI)</label>
                  <input className="input" placeholder={tr("Enter UTR / Transaction ID")} value={utr} onChange={(e) => setUtr(e.target.value)} disabled={method !== 'UPI/QR Code'} />
                  <div className="text-[0.6875rem] text-gray-400 mt-1"><T>Enter UPI transaction reference number / UTR</T></div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 text-maroon-700 mb-4"><IndianRupee size={18} /><h3 className="font-serif text-lg font-bold"><T>Booking Amount Summary</T></h3></div>
              <div className="flex justify-between py-2 text-[0.84375rem]"><span className="text-gray-500"><T>Rate Type</T></span><span className="font-medium text-gray-800">{rateType}</span></div>
              {plan?.committee_decided ? (
                festCommitteeFee > 0 ? (
                  <div className="py-2 border-t border-gray-100">
                    <div className="flex justify-between text-[0.84375rem]"><span className="text-gray-500">Committee Price ({festWindow?.name})</span><span className="font-bold text-gray-800">{money2(festCommitteeFee)}</span></div>
                    <div className="text-[0.6875rem] text-emerald-700 mt-1"><T>Set once by the committee in the Festival Master — no manual entry needed.</T></div>
                  </div>
                ) : (
                <div className="py-2 border-t border-gray-100">
                  <label className="label">Committee-Decided Amount (₹) *</label>
                  <NumberField min="1" step="1" prefix="₹" className="mt-1" placeholder={tr("Enter amount set by the committee")}
                         value={committeeAmt} onChange={(e) => setCommitteeAmt(e.target.value.replace(/[^\d.]/g, ''))} />
                  {!amountReady && <div className="text-[0.6875rem] text-amber-600 mt-1"><T>This pooja has no fixed fee — enter the committee's amount to continue.</T></div>}
                </div>
                )
              ) : (
                <div className="flex justify-between py-2 text-[0.84375rem] border-t border-gray-100"><span className="text-gray-500">Rate (₹)</span><span className="font-medium text-gray-800">{money2(fee)}</span></div>
              )}
              <div className="flex justify-between py-2 text-[0.84375rem] border-t border-gray-100"><span className="text-gray-500">Discount (₹)</span><span className="font-medium text-gray-800">0.00</span></div>
              <div className="flex justify-between items-center py-3 mt-1 border-t border-gray-200"><span className="font-bold text-maroon-800">Total Amount (₹)</span><span className="text-xl font-extrabold text-maroon-800">{money2(fee)}</span></div>
            </div>
            <div className="bg-amber-50/50 border border-amber-100 rounded-lg px-4 py-3 text-[0.78125rem] text-gray-600 flex items-start gap-2"><Info size={15} className="text-amber-600 shrink-0 mt-0.5" />{' '}<T>All payments are subject to temple rules and availability.</T></div>
          </div>

          <div className="lg:col-span-2 flex justify-between">
            <button onClick={() => setStep(0)} className="btn-outline"><ArrowLeft size={15} />{' '}<T>Previous</T></button>
            <button onClick={pay} disabled={busy || !amountReady} className="btn-maroon disabled:opacity-60">{busy ? 'Processing…' : <>Confirm Booking &amp; Pay <ArrowRight size={15} /></>}</button>
          </div>
        </div>
      )}

      {/* ── Step 3: Confirmation & Ticket ── */}
      {step === 2 && ticket && (
        <div>
          <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl px-6 py-4 flex items-center gap-4 mb-5">
            <div className="w-12 h-12 rounded-full bg-emerald-600 text-white grid place-items-center shrink-0"><Check size={26} /></div>
            <div><h2 className="font-serif text-xl font-bold text-emerald-700"><T>Booking Successful!</T></h2><p className="text-[0.8125rem] text-gray-500"><T>Your pooja booking has been confirmed successfully. Thank you for your devotion.</T></p></div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Details list */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 text-maroon-700 mb-4"><ClipboardList size={18} /><h3 className="font-serif text-lg font-bold">Booking &amp; Payment Details</h3></div>
              <div className="divide-y divide-gray-100 text-[0.84375rem]">
                <Detail k="Booking ID" v={<span className="font-mono">{ticket.booking_code}</span>} />
                <Detail k="Ticket Number" v={<span className="font-mono text-maroon-700 font-semibold">{ticket.ticket_no || ticket.receipt_no}</span>} />
                {summaryRows(true).map((r) => <Detail key={r.k} k={r.k} v={r.v} />)}
                <Detail k="Payment Mode" v={modeLabel(ticket._method)} />
                {ticket._utr && <Detail k="UTR / Transaction ID" v={<span className="text-emerald-700 font-mono">{ticket._utr}</span>} />}
                <Detail k="Payment Date & Time" v={ticket._paidAt} />
              </div>
              <div className="mt-3 bg-blue-50/60 border border-blue-100 rounded-lg px-3.5 py-2.5 text-[0.78125rem] text-gray-600 flex items-start gap-2"><Info size={15} className="text-blue-500 shrink-0 mt-0.5" />{' '}<T>Please show this ticket at the temple counter / pooja venue.</T></div>
            </div>

            {/* Ticket card */}
            <div id="print-area">
              <div className="bg-[#fdf7ee] border-2 border-dashed border-amber-300 rounded-2xl p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Landmark size={34} className="text-amber-600" />
                    <div><div className="font-display font-bold text-maroon-800 text-[0.9375rem] tracking-wide"><T>SRI SHIRDI SAI BABA TEMPLE</T></div><div className="text-[0.625rem] text-gray-500"><T>Endowments Department, Government of Telangana</T></div></div>
                  </div>
                  <TicketRef code={ticket.booking_code} />
                </div>
                <div className="text-center my-4"><span className="inline-block bg-maroon-800 text-cream text-[0.75rem] font-bold tracking-wider rounded px-4 py-1.5"><T>POOJA BOOKING TICKET</T></span></div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-dashed border-amber-200 pt-4">
                  <TField k="Booking ID" v={ticket.booking_code} mono />
                  <TField k="Ticket Number" v={ticket.ticket_no || ticket.receipt_no} mono />
                  <TField k="Devotee" v={<>{devotee.name}<span className="block text-[0.6875rem] text-gray-500 font-normal">{devotee.mobile}</span></>} />
                  {(gothram || nakshatram) && <TField k="Gothram · Nakshatram" v={[gothram, nakshatram].filter(Boolean).join(' · ')} />}
                  {beneficiary && <TField k="In the name of" v={beneficiary} />}
                  <TField k="Pooja" v={pooja.name} />
                  <TField k="Plan" v={`${plan.plan_name} ${shortPooja(pooja.name)}`} />
                  <TField k="Plan Type" v={plan.plan_name} />
                  <TField k="Booking Date" v={fmtDate(schedDate)} />
                  <TField k="Time Slot" v={slot} />
                  {ticket._poojari && <TField k="Poojari" v={ticket._poojari} />}
                  <TField k="Validity" v={validityShort(plan)} sub={validText.includes('(') ? validText.slice(validText.indexOf('(')) : ''} />
                  <div className="bg-amber-100/60 rounded-lg px-3 py-2 col-span-2 flex items-center justify-between"><span className="text-[0.6875rem] text-gray-500">Amount Paid (₹)</span><span className="font-extrabold text-maroon-800">{money2(fee)}</span></div>
                  <TField k="Payment Mode" v={modeLabel(ticket._method)} />
                  <TField k="Payment Date & Time" v={ticket._paidAt} />
                </div>
                <div className="text-center mt-4 pt-3 border-t border-dashed border-amber-200"><div className="font-display text-maroon-700 tracking-wide text-sm"><T>✦ Om Sai Ram ✦</T></div><div className="text-[0.6875rem] text-gray-500 mt-0.5"><T>Thank you for your devotion. May Sai Baba bless you.</T></div></div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 justify-center mt-6 no-print">
            <button onClick={() => window.print()} className="btn-outline"><Printer size={15} />{' '}<T>Print Ticket / Receipt</T></button>
            <button onClick={() => window.print()} className="btn-outline"><Download size={15} />{' '}<T>Download PDF</T></button>
            <button onClick={() => { setStep(0); setDevotee(null); setPoojaId(''); setPlan(null); setTicket(null); setDevResults(null); setUtr(''); setCommitteeAmt(''); setSlot(SLOTS[0]); setPoojariId(''); setQuickAdd(null); setDevQ('') }} className="btn-outline"><Plus size={15} />{' '}<T>New Booking</T></button>
            <button onClick={() => nav('/admin/bookings')} className="btn-maroon"><ArrowLeft size={15} />{' '}<T>Back to Bookings</T></button>
          </div>
        </div>
      )}

      {step === 0 && (
        <div className="mt-4 flex items-center gap-2 text-[0.8125rem] text-gray-500 bg-blue-50/60 border border-blue-100 rounded-lg px-4 py-2.5">
          <ShieldCheck size={15} className="text-blue-500" />{' '}<T>All bookings are subject to temple rules and availability.</T>{' '}</div>
      )}
    </div>
  )
}

function Detail({ k, v }) {
  return <div className="flex items-center gap-3 py-2.5"><span className="text-gray-500 w-40 shrink-0">{k}</span><span className="text-gray-400">:</span><span className="text-gray-800 font-medium">{v}</span></div>
}
function TField({ k, v, sub, mono }) {
  return <div><div className="text-[0.6875rem] text-gray-500">{k}</div><div className={`text-[0.8125rem] text-gray-800 font-semibold ${mono ? 'font-mono' : ''}`}>{v}</div>{sub && <div className="text-[0.625rem] text-gray-400">{sub}</div>}</div>
}
