import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Printer, Plus, Trash2, Receipt as ReceiptIcon, Search, User, X, IndianRupee, Loader2, Eye,
  Calendar, Download, FileSpreadsheet, FileText, Check, Clock, ChevronLeft, ChevronRight, RefreshCw,
} from 'lucide-react'
import { PageHeader } from '../../components/common/UI.jsx'
import { Receipt } from '../../components/common/Receipt.jsx'
import { Select } from '../../components/common/Field.jsx'
import { Pill } from '../../components/admin/ui.jsx'
import { PoojasAPI, DevoteesAPI, BookingsAPI, PaymentsAPI, FestivalsAPI, TithiAPI } from '../../api/client.js'
import { promptDialog } from '../../components/common/Dialog.jsx'
import { T, tr, useLang, personName, stamp } from '../../i18n/LanguageContext.jsx'

const CATS = ['All', 'Daily', 'Monthly', 'Long-Term', 'Occasion', 'Festival', 'Vehicle']

const inr = (n) => '₹ ' + Number(n || 0).toLocaleString('en-IN')
const todayISO = () => new Date().toISOString().slice(0, 10)
const stampNow = () => stamp(new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }))

export default function Counter() {
  const { lang } = useLang()
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
              tithi_type: pl.tithi_type || null,
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

  // ── Tithi cache — fetch once at page load for instant add ──────────────────
  const [tithiCache, setTithiCache] = useState({})  // { Pournami: {tithi_date, name, ...}, Amavasya: ... }
  useEffect(() => {
    const types = ['Pournami', 'Amavasya']
    Promise.all(types.map((t) => TithiAPI.next(t).then((r) => [t, r]).catch(() => [t, null])))
      .then((results) => {
        const cache = {}
        for (const [type, data] of results) {
          if (data?.found) cache[type] = data
        }
        setTithiCache(cache)
      })
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
    let tithi_info = null  // { tithi_type, tithi_date, name }
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
    // Tithi-specific poojas (e.g., Pournami, Amavasya): use cached data (instant)
    if (entry.tithi_type) {
      const cached = tithiCache[entry.tithi_type]
      if (!cached) {
        setError(`${tr('No upcoming')} ${entry.tithi_type} ${tr('dates configured. Please add dates in Tithi Master.')}`)
        return
      }
      scheduled_date = cached.tithi_date
      tithi_info = { tithi_type: entry.tithi_type, tithi_date: cached.tithi_date, name: cached.name, days_away: cached.days_away }
    }
    // Vehicle poojas carry the vehicle number on the receipt.
    let vehicle_no
    if (entry.category === 'Vehicle') {
      const res = await promptDialog({
        title: 'Vehicle pooja',
        confirmLabel: tr('Add to Bill'),
        fields: [{ k: 'vehicle', label: tr('Vehicle number'), placeholder: 'e.g. TS09 AB 1234', note: 'Optional — printed on the receipt.' }],
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
        confirmLabel: tr('Add to Bill'),
        fields: [{ k: 'amount', label: tr('Amount (₹)'), type: 'number', required: true }],
      })
      if (!res) return
      amount = Number(res.amount)
      if (!(amount > 0)) { setError('Enter a valid amount.'); return }
      setError('')
    }
    // Add to cart immediately (no blocking API calls)
    setError('')
    const lineId = ++lineSeq.current
    setCart((c) => [...c, { ...entry, amount, scheduled_date, vehicle_no, tithi_info, lineId }])
    // Duplicate check runs in background — warns but doesn't block adding
    if ((devotee?.id || mobile?.trim()) && /life|year|monthly/i.test(entry.plan_name || '')) {
      const params = { pooja_id: entry.pooja_id, plan_id: entry.plan_id }
      if (devotee?.id) params.devotee_id = devotee.id
      else if (mobile?.trim()) params.mobile = mobile.trim()
      BookingsAPI.checkDuplicate(params).then((res) => {
        if (res.has_duplicate) {
          setDuplicateWarnings((prev) => [...prev.filter((w) => w.lineId !== lineId), { lineId, message: res.message, booking_code: res.existing_booking, plan_name: res.plan_name, valid_until: res.valid_until }])
        }
      }).catch(() => {})
    }
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

  // ── Duplicate booking warnings ─────────────────────────────────────────────
  const [duplicateWarnings, setDuplicateWarnings] = useState([])  // [{lineId, message, booking_code}]
  const checkDuplicate = useCallback(async (devoteeId, mobileNo, entry) => {
    if ((!devoteeId && !mobileNo) || !entry.pooja_id || !entry.plan_id) return null
    // Check for Monthly/Life Long/Yearly plans
    const isLongTerm = /life|year|monthly/i.test(entry.plan_name || '')
    if (!isLongTerm) return null
    try {
      const params = { pooja_id: entry.pooja_id, plan_id: entry.plan_id }
      if (devoteeId) params.devotee_id = devoteeId
      else if (mobileNo) params.mobile = mobileNo
      const res = await BookingsAPI.checkDuplicate(params)
      if (res.has_duplicate) {
        return { lineId: entry.lineId, message: res.message, booking_code: res.existing_booking, plan_name: res.plan_name, valid_until: res.valid_until }
      }
    } catch { /* ignore */ }
    return null
  }, [])

  // Check all cart items when devotee or mobile changes
  useEffect(() => {
    const devId = devotee?.id
    const mob = mobile?.trim()
    if ((!devId && !mob) || !cart.length) { setDuplicateWarnings([]); return }
    Promise.all(cart.map((item) => checkDuplicate(devId, mob, item)))
      .then((results) => setDuplicateWarnings(results.filter(Boolean)))
  }, [devotee?.id, mobile, cart, checkDuplicate])

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
    // Warn about duplicate bookings
    if (duplicateWarnings.length > 0) {
      const dupItems = duplicateWarnings.map((w) => `${w.plan_name} (${w.booking_code})`).join(', ')
      setError(`Cannot bill: Devotee already has active bookings — ${dupItems}. Remove these items from the cart.`)
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

  const modeLabel = (m) => tr(m === 'UPI/QR Code' ? 'UPI / QR Code' : m)

  return (
    <div>
      <PageHeader
        title={tr("Counter Billing")}
        subtitle={tr("Walk-up billing — poojas start today. For a chosen date, slot or poojari use Advance Booking.")}
        action={<span className="badge bg-saffron-50 text-saffron-700">{tr('Counter')} 1 · {tr(role)}</span>}
      />

      {catalogErr && <div className="mt-4 rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm px-4 py-2.5">{catalogErr}</div>}
      {!canBill && (
        <div className="mt-4 rounded-lg bg-blue-50 border border-blue-100 text-blue-700 text-sm px-4 py-2.5 flex items-center gap-2">
          <Eye size={15} className="shrink-0" />{' '}<T>View-only access — the Accountant role can review the counter but cannot issue receipts.</T>{' '}</div>
      )}

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        {/* ── Seva picker ── */}
        <div className="lg:col-span-2 card p-5">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <h3 className="font-bold text-gray-900"><T>Add Poojas</T></h3>
            <div className="relative w-full sm:w-64">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={sevaQ} onChange={(e) => setSevaQ(e.target.value)} placeholder={tr("Search pooja / plan…")} className="input !pl-9 !py-2" />
            </div>
          </div>
          {/* Category chips — jump to a pooja type fast */}
          <div className="flex flex-wrap gap-1.5 mb-2">
            {CATS.map((c) => (
              <button key={c} onClick={() => setCat(c)}
                className={`px-3 py-1.5 rounded-full text-[0.75rem] font-semibold border transition ${cat === c ? 'bg-maroon-700 text-cream border-maroon-700' : 'bg-white text-gray-600 border-gray-200 hover:border-maroon-300'}`}>
                {tr(c)}
              </button>
            ))}
          </div>
          {cat === 'Occasion' && (
            <p className="text-[0.6875rem] text-amber-700 mb-2"><T>Booking a ceremony for a future date (Namakaranam, Annaprasana…)? Use</T> <b><T>Advance Booking</T></b>{' '}<T>to pick the date, slot and poojari.</T></p>
          )}
          {cat === 'Festival' && (
            <p className="text-[0.6875rem] text-amber-700 mb-2"><T>Festival poojas are automatically scheduled for their festival window from the Festival Master.</T></p>
          )}
          <div className="grid sm:grid-cols-2 gap-2 max-h-[32.5rem] overflow-y-auto pr-1">
            {filtered.map((s) => (
              <button key={s.key} onClick={() => add(s)} className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2.5 text-left hover:border-saffron-400 hover:bg-saffron-50 transition-colors">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-800 truncate">{lang === 'te' && s.name_te ? s.name_te : tr(s.pooja_name)}</div>
                  <div className="text-[0.6875rem] text-gray-400 truncate">{tr(s.plan_name)}</div>
                </div>
                <span className="flex items-center gap-1 text-saffron-700 font-bold text-sm shrink-0">
                  <Plus size={14} /> ₹{Number(s.fee || 0).toLocaleString('en-IN')}
                </span>
              </button>
            ))}
            {filtered.length === 0 && <p className="text-sm text-gray-400 col-span-full text-center py-8"><T>No matching poojas.</T></p>}
          </div>
        </div>

        {/* ── Bill ── */}
        <div className="card p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-1"><ReceiptIcon size={18} className="text-saffron-600" /><h3 className="font-bold text-gray-900">{lang === 'te' ? 'రసీదు' : 'Bill / రసీదు'}</h3></div>
          <p className="text-[0.6875rem] text-gray-400 mb-3"><T>Records a real receipt against the temple ledger</T></p>

          {/* Devotee */}
          <div className="mb-3">
            {devotee ? (
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2 text-sm text-emerald-800"><User size={14} /> <span className="font-semibold">{personName(devotee, lang)}</span> <span className="text-emerald-600">{devotee.mobile}</span></div>
                <button onClick={clearDevotee} className="text-emerald-600 hover:text-emerald-900"><X size={15} /></button>
              </div>
            ) : (
              <div className="relative">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={devQ} onChange={(e) => setDevQ(e.target.value)} placeholder={tr("Link devotee by name / mobile (optional)…")} className="input !pl-9 !py-2 text-sm" />
                </div>
                {devResults && devResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                    {devResults.map((d) => (
                      <button key={d.id} onClick={() => pickDevotee(d)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between">
                        <span className="font-medium text-gray-800">{personName(d, lang)}</span>
                        <span className="text-gray-400 text-xs">{d.mobile}</span>
                      </button>
                    ))}
                  </div>
                )}
                {devResults && devResults.length === 0 && devQ.trim() && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs text-gray-400"><T>No match — bill as a walk-in below.</T></div>
                )}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <input value={name} onChange={(e) => { setName(e.target.value); if (devotee) setDevotee(null) }} placeholder={tr("Payer name *")} className="input !py-2 text-sm" />
            <input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder={tr("Mobile")} className="input !py-2 text-sm" />
          </div>

          {/* Line items */}
          <div className="flex-1 space-y-2 min-h-[5rem]">
            {cart.length === 0 && <p className="text-sm text-gray-400 text-center py-6"><T>No items added.</T></p>}
            {cart.map((x) => {
              const dup = duplicateWarnings.find((w) => w.lineId === x.lineId)
              return (
                <div key={x.lineId} className={`flex items-center justify-between text-sm border-b border-dashed pb-2 ${dup ? 'border-amber-200 bg-amber-50 -mx-2 px-2 rounded' : 'border-gray-100'}`}>
                  <div className="min-w-0">
                    <div className="font-medium text-gray-800 truncate">{x.pooja_name}</div>
                    <div className="text-[0.6875rem] text-gray-400 truncate">
                      {x.plan_name}
                      {x.scheduled_date && x.scheduled_date !== todayISO() ? ` · from ${x.scheduled_date}` : ''}
                    </div>
                    {x.tithi_info && (
                      <div className="text-[0.625rem] text-indigo-600 font-medium mt-0.5">
                        🌕 {x.tithi_info.tithi_type}{x.tithi_info.name ? ` (${x.tithi_info.name})` : ''} · {x.tithi_info.tithi_date}{x.tithi_info.days_away > 0 ? ` (${x.tithi_info.days_away} ${tr('days away')})` : ` (${tr('Today')})`}
                      </div>
                    )}
                    {dup && (
                      <div className="text-[0.625rem] text-amber-700 font-medium mt-0.5">
                        ⚠ {tr('Already has active')} {dup.plan_name} ({dup.booking_code}){dup.valid_until ? ` · ${tr('valid until')} ${dup.valid_until}` : ''}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-bold text-gray-700 text-right">₹{Number(x.amount || 0).toLocaleString('en-IN')}</span>
                    <button onClick={() => remove(x.lineId)} className="text-gray-300 hover:text-red-500" title={tr("Remove")}><Trash2 size={14} /></button>
                  </div>
                </div>
              )
            })}
          </div>
          {/* Duplicate booking warning summary */}
          {duplicateWarnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800 mt-2">
              <strong>⚠ {tr('Warning')}:</strong> {tr('Devotee already has active bookings for')} {duplicateWarnings.length} {tr('item(s) in the cart. Billing will fail for these.')}</div>
          )}

          {/* Payment mode */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            {['Cash', 'UPI/QR Code'].map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`flex items-center justify-center gap-1.5 rounded-lg border py-2 text-sm font-medium transition ${mode === m ? 'border-saffron-400 bg-saffron-50 text-saffron-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                <IndianRupee size={14} /> {modeLabel(m)}
              </button>
            ))}
          </div>
          {mode === 'UPI/QR Code' && (
            <input value={utr} onChange={(e) => setUtr(e.target.value)} placeholder={tr("UTR / Transaction ID *")} className="input !py-2 text-sm mt-2" />
          )}

          <div className="border-t border-gray-200 mt-3 pt-3">
            <div className="flex items-center justify-between font-extrabold text-lg">
              <span>{lang === 'te' ? 'మొత్తం' : 'Total / మొత్తం'}</span><span className="text-maroon-700">{inr(total)}</span>
            </div>
            {error && <p className="text-center text-xs text-red-600 font-semibold mt-2">{error}</p>}
            <button onClick={checkout} disabled={busy || !cart.length || !canBill} className="btn-primary w-full mt-3 disabled:bg-gray-300 justify-center">
              {busy ? <><Loader2 size={16} className="animate-spin" />{' '}<T>Processing…</T></> : !canBill ? <><Eye size={16} />{' '}<T>View Only</T></> : <><ReceiptIcon size={16} />{' '}<T>Complete Billing</T></>}
            </button>
          </div>
        </div>
      </div>

      {/* Today's Eligible Devotees Section */}
      <EligibleDevoteesSection
        onSelectDevotee={(d) => {
          setDevotee({ id: d.devotee_id, name: d.devotee_name, mobile: d.mobile })
          setName(d.devotee_name)
          setMobile(d.mobile || '')
        }}
      />

      {bill && <BillReceiptModal bill={bill} onClose={() => setBill(null)} />}
    </div>
  )
}

// ── Today's Eligible Devotees Section ────────────────────────────────────────
function EligibleDevoteesSection({ onSelectDevotee }) {
  const { lang } = useLang()
  const [data, setData] = useState({ items: [], total: 0, poojas: [], stats: { due: 0, done: 0 }, date: '' })
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [pooja, setPooja] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const size = 10

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await BookingsAPI.eligibleToday({ q, pooja, status, page, size })
      setData(res)
    } catch (e) {
      console.error('Failed to load eligible devotees:', e)
    } finally {
      setLoading(false)
    }
  }, [q, pooja, status, page])

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [load])

  const totalPages = Math.ceil(data.total / size)

  // Export to Excel
  const exportExcel = () => {
    const rows = data.items.map((e) => ({
      'Devotee Name': e.devotee_name,
      'Mobile': e.mobile || '',
      'Pooja': e.pooja,
      'Plan': e.plan,
      'Due Date': e.due_date,
      'Status': e.status,
    }))
    const csv = [
      Object.keys(rows[0] || {}).join(','),
      ...rows.map((r) => Object.values(r).map((v) => `"${v}"`).join(',')),
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `eligible-devotees-${data.date}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Export to PDF (simple print-based)
  const exportPDF = () => {
    const printContent = `
      <html>
      <head>
        <title>Today's Eligible Devotees - ${data.date}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { font-size: 18px; margin-bottom: 5px; }
          h2 { font-size: 14px; color: #666; margin-bottom: 15px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background: #f5f5f5; font-weight: bold; }
          .due { color: #d97706; }
          .done { color: #059669; }
        </style>
      </head>
      <body>
        <h1>Today's Eligible Devotees</h1>
        <h2>Date: ${new Date(data.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} | Due: ${data.stats.due} | Done: ${data.stats.done}</h2>
        <table>
          <tr><th>Devotee</th><th>Mobile</th><th>Pooja</th><th>Plan</th><th>Status</th></tr>
          ${data.items.map((e) => `
            <tr>
              <td>${e.devotee_name}</td>
              <td>${e.mobile || '—'}</td>
              <td>${e.pooja}</td>
              <td>${e.plan}</td>
              <td class="${e.status.toLowerCase()}">${e.status === 'Done' ? '✓ Done' : '⏳ Due'}</td>
            </tr>
          `).join('')}
        </table>
      </body>
      </html>
    `
    const win = window.open('', '_blank')
    win.document.write(printContent)
    win.document.close()
    win.print()
  }

  const fmtDate = (d) => {
    if (!d) return ''
    const dt = new Date(d)
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  return (
    <div className="card p-5 mt-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Calendar size={18} className="text-saffron-600" />
          <h3 className="font-bold text-gray-900"><T>Today's Eligible Devotees</T></h3>
          <span className="text-xs text-gray-400 ml-2">{fmtDate(data.date)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-1 rounded-full bg-amber-50 text-amber-700 font-medium">
            <Clock size={12} className="inline mr-1" />{data.stats.due} <T>Due</T>
          </span>
          <span className="text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 font-medium">
            <Check size={12} className="inline mr-1" />{data.stats.done} <T>Done</T>
          </span>
        </div>
      </div>

      <p className="text-[0.75rem] text-gray-500 mb-3"><T>Devotees due for their recurring poojas (Monthly, Yearly, Life Long) today.</T></p>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-3">
        <div className="relative flex-1 min-w-[150px] max-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} placeholder={tr("Search devotee…")} className="input !pl-9 !py-2 text-sm" />
        </div>
        <Select value={pooja} onChange={(e) => { setPooja(e.target.value); setPage(1) }} className="input !py-2 text-sm !w-auto min-w-[140px]">
          <option value="">{tr("All Poojas")}</option>
          {data.poojas.map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className="input !py-2 text-sm !w-auto min-w-[100px]">
          <option value="">{tr("All Status")}</option>
          <option value="Due">{tr("Due")}</option>
          <option value="Done">{tr("Done")}</option>
        </Select>
        <button onClick={load} title={tr("Refresh")} className="btn-outline !py-2 !px-3">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
        <button onClick={exportExcel} title={tr("Download Excel")} className="btn-outline !py-2 !px-3" disabled={!data.items.length}>
          <FileSpreadsheet size={14} />
        </button>
        <button onClick={exportPDF} title={tr("Download PDF")} className="btn-outline !py-2 !px-3" disabled={!data.items.length}>
          <FileText size={14} />
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-gray-100 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-[0.6875rem] uppercase tracking-wide text-gray-500">
              <th className="px-3 py-2.5 font-semibold">{tr('Devotee')}</th>
              <th className="px-3 py-2.5 font-semibold">{tr('Mobile')}</th>
              <th className="px-3 py-2.5 font-semibold">{tr('Pooja')}</th>
              <th className="px-3 py-2.5 font-semibold">{tr('Plan')}</th>
              <th className="px-3 py-2.5 font-semibold">{tr('Status')}</th>
              <th className="px-3 py-2.5 font-semibold">{tr('Action')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400"><Loader2 size={18} className="inline animate-spin mr-2" /><T>Loading…</T></td></tr>
            ) : data.items.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400"><T>No eligible devotees found for today.</T></td></tr>
            ) : data.items.map((e) => (
              <tr key={e.id} className="hover:bg-gray-50">
                <td className="px-3 py-2.5 font-medium text-gray-800">
                  {lang === 'te' && e.devotee_name_te ? e.devotee_name_te : e.devotee_name}
                </td>
                <td className="px-3 py-2.5 text-gray-600">{e.mobile || '—'}</td>
                <td className="px-3 py-2.5 text-gray-700">{e.pooja}</td>
                <td className="px-3 py-2.5 text-gray-600">{e.plan}</td>
                <td className="px-3 py-2.5">
                  <Pill tone={e.status === 'Done' ? 'green' : 'amber'}>
                    {e.status === 'Done' ? <><Check size={12} className="mr-1" />{tr('Done')}</> : <><Clock size={12} className="mr-1" />{tr('Due')}</>}
                  </Pill>
                </td>
                <td className="px-3 py-2.5">
                  {e.status === 'Due' && e.devotee_id && (
                    <button onClick={() => onSelectDevotee(e)} className="text-xs text-maroon-700 hover:text-maroon-900 font-medium">
                      <T>Select</T>
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 text-sm">
          <span className="text-gray-500"><T>Showing</T> {((page - 1) * size) + 1}–{Math.min(page * size, data.total)} <T>of</T> {data.total}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn-outline !py-1.5 !px-2 disabled:opacity-40">
              <ChevronLeft size={14} />
            </button>
            <span className="px-3 text-gray-600">{page} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn-outline !py-1.5 !px-2 disabled:opacity-40">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function BillReceiptModal({ bill, onClose }) {
  const { lang } = useLang()
  const rows = [
    { en: 'Devotee', value: bill.name },
    ...(bill.mobile ? [{ en: 'Mobile', value: bill.mobile }] : []),
    // The line label is composed from three parts — interpolating them into one
    // string would make it untranslatable, so each piece resolves separately.
    ...bill.lines.map((l) => ({
      en: [l.name_te && lang === 'te' ? l.name_te : tr(l.pooja_name), tr(l.plan_name), l.vehicle_no]
        .filter(Boolean).join(' · '),
      value: `₹ ${Number(l.amount || 0).toLocaleString('en-IN')}`,
    })),
    { en: 'Payment Mode', value: tr(bill.mode === 'UPI/QR Code' ? 'UPI / QR Code' : bill.mode) },
    ...(bill.utr ? [{ en: 'UTR / Txn ID', value: bill.utr }] : []),
    { en: 'Date & Time', value: bill.paidAt },
    ...(bill.lines.length > 1
      ? [{ en: 'Tickets', value: bill.lines.map((l) => l.booking?.ticket_no || l.booking?.booking_code).filter(Boolean).join(', ') }]
      : []),
  ]
  return (
    <div className="print-modal fixed inset-0 bg-black/40 z-50 grid place-items-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 no-print">
          {bill.failed
            ? <span className="text-sm font-semibold text-amber-700">⚠ Partial — {bill.failed} item(s) not billed, still in cart</span>
            : <span className="text-sm font-semibold text-emerald-700"><T>✓ Receipt generated</T></span>}
          <button onClick={onClose} className="text-gray-400 hover:text-maroon-700"><X size={18} /></button>
        </div>
        <div id="print-area" className="p-4">
          <Receipt
            title={tr("Counter Receipt")}
            titleTe="కౌంటర్ రసీదు"
            no={bill.ref}
            subNo={bill.lines[0]?.booking?.ticket_no}
            subNoLabel="Ticket No"
            rows={rows}
            amount={bill.total}
            footerNote="Please retain this receipt for your records."
          />
        </div>
        <div className="flex gap-2 px-5 py-4 border-t border-gray-100 no-print">
          <button onClick={() => window.print()} className="btn-outline flex-1 justify-center"><Printer size={15} />{' '}<T>Print</T></button>
          <button onClick={onClose} className="btn-maroon flex-1 justify-center"><T>New Bill</T></button>
        </div>
      </div>
    </div>
  )
}
