import React, { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  Search, UserPlus, User, ArrowRight, ArrowLeft, Check, Info, X, Calendar, Clock,
  Flame, CalendarDays, ShieldCheck, IndianRupee, Landmark, Printer, Plus,
  ClipboardList, CreditCard, Ticket, Moon, Car, AlertTriangle, FileText, Loader2,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { DevoteesAPI, PoojasAPI, BookingsAPI, PoojarisAPI, FestivalsAPI, TithiAPI, SettingsAPI } from '../../api/client.js'
import { fmtDate } from '../../components/admin/ui.jsx'
import { TicketShell } from '../../components/admin/BookingTicket.jsx'
import { toast } from '../../components/common/Dialog.jsx'
import { Select, DateField, CountryCodeSelect, getCountryDigits, Combobox } from '../../components/common/Field.jsx'
import ParticipantsInput from '../../components/common/ParticipantsInput.jsx'
import { T, tr, clock12, useLang, personName } from '../../i18n/LanguageContext.jsx'
import { sanitizePhone, sanitizeName, validatePhone, sanitizeVehicle } from '../../lib/validation.js'
import { GOTHRAMS, NAKSHATRAMS, RASHIS } from '../../lib/sankalpam.js'
import { addDaysISO, planValidUntil, planSpan } from '../../lib/planTerms.js'

const STEPS = [
  { t: 'Booking Details', s: 'Enter booking information' },
  { t: 'Review & Payment', s: 'Confirm and make payment' },
  { t: 'Confirmation & Ticket', s: 'Booking confirmation and ticket' },
]

// ── Dates & slots, always in India time ──
const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const nowISTMinutes = () => {
  const [h, m] = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).split(':').map(Number)
  return h * 60 + m
}
const slotEndMinutes = (slot) => {
  const m = /-\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*$/i.exec(slot || '')
  if (!m) return null
  let h = Number(m[1]) % 12
  if (m[3].toUpperCase() === 'PM') h += 12
  return h * 60 + Number(m[2])
}
// Today's slots stay bookable until they end (the server applies the same rule)
const openSlots = (slots, date) => (date !== todayIST() ? slots : slots.filter((s) => {
  const end = slotEndMinutes(s)
  return end == null || end > nowISTMinutes()
}))

const money2 = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const stampNow = () => new Date().toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
const isLifetime = (planName) => /life\s*long|life\s*time|lifetime/i.test(planName || '')

const buildUpiUrl = (upiId, payeeName, amount) => {
  if (!upiId) return ''
  const params = new URLSearchParams({ pa: upiId, pn: payeeName || 'Temple', am: String(Number(amount) || 0), cu: 'INR', tn: 'Temple Seva' })
  return `upi://pay?${params.toString()}`
}

// Validity preview before booking — same calculation as the server, so it matches the ticket
function validityPreview(pl, from) {
  if (!pl || !from) return ''
  const end = planValidUntil(pl, from)
  if (end === null) return tr('Lifetime')
  if (end === from) return `${tr('On')} ${fmtDate(from)}`
  return `${fmtDate(from)} – ${fmtDate(end)}`
}
function spanLabel(pl) {
  const sp = planSpan(pl)
  if (sp.lifetime) return tr('Lifetime')
  if (sp.years) return sp.years === 1 ? tr('1 Year') : `${sp.years} ${tr('Years')}`
  return sp.days === 1 ? tr('1 Day') : `${sp.days} ${tr('Days')}`
}
function ticketValidity(t) {
  if (!t) return ''
  if (!t.valid_until) return isLifetime(t.plan_name) ? tr('Lifetime') : `${tr('On')} ${fmtDate(t.scheduled_date)}`
  if (t.valid_until === t.scheduled_date) return `${tr('On')} ${fmtDate(t.scheduled_date)}`
  return `${fmtDate(t.scheduled_date)} – ${fmtDate(t.valid_until)}`
}

function Stepper({ step }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-2 mb-5 flex items-stretch gap-1">
      {STEPS.map((s, i) => {
        const done = i < step, active = i === step, banner = active && step > 0
        const sub = done ? tr('Completed') : active ? (i === 0 ? tr(s.s) : (step === STEPS.length - 1 ? tr('Completed') : tr('In Progress'))) : tr('Pending')
        return (
          <React.Fragment key={i}>
            <div className={`flex items-center gap-3 px-4 py-3 flex-1 ${banner ? 'bg-maroon-800 text-cream' : ''}`}
              style={banner ? { clipPath: 'polygon(0 0, calc(100% - 16px) 0, 100% 50%, calc(100% - 16px) 100%, 0 100%)', borderRadius: 8 } : {}}>
              <div className={`w-8 h-8 rounded-full grid place-items-center text-sm font-bold shrink-0 ${done ? 'bg-emerald-500 text-white' : banner ? 'bg-white text-maroon-800' : active ? 'bg-maroon-800 text-white' : 'bg-gray-100 text-gray-400'}`}>{done ? <Check size={16} /> : i + 1}</div>
              <div className="hidden md:block">
                <div className={`text-[0.8125rem] font-bold ${banner ? 'text-cream' : active ? 'text-maroon-800' : done ? 'text-gray-700' : 'text-gray-400'}`}>{tr(s.t)}</div>
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
  const langCtx = useLang()
  const lang = langCtx?.lang || 'en'
  const nav = useNavigate()
  const [step, setStep] = useState(0)

  // ── Reference data ──
  const [poojas, setPoojas] = useState([])
  const [festivals, setFestivals] = useState([])
  const [poojaris, setPoojaris] = useState([])
  const [pournamiDates, setPournamiDates] = useState([])
  const [cfg, setCfg] = useState({ slots: [], maxDays: null, upiId: '', upiPayee: '' })

  useEffect(() => {
    PoojasAPI.list().then((d) => setPoojas(d.items || [])).catch(() => toast(tr('Failed to load poojas'), 'error'))
    FestivalsAPI.list().then((r) => setFestivals(r.items || r || [])).catch(() => toast(tr('Failed to load festivals'), 'error'))
    PoojarisAPI.list().then((d) => setPoojaris((Array.isArray(d) ? d : d?.items || []).filter((p) => p.active))).catch(() => toast(tr('Failed to load poojaris'), 'error'))
    TithiAPI.upcoming('Pournami', 12).then((r) => setPournamiDates((r.dates || []).map((d) => d.date))).catch(() => setPournamiDates([]))
    SettingsAPI.config()
      .then((c) => setCfg({
        slots: Array.isArray(c?.time_slots) ? c.time_slots : [],
        maxDays: Number.isInteger(c?.advance_booking_max_days) ? c.advance_booking_max_days : null,
        upiId: c?.upi_id || '', upiPayee: c?.upi_payee_name || '',
      }))
      .catch(() => toast(tr('Failed to load booking settings'), 'error'))
  }, [])

  // ── Devotee ──
  const [searchBy, setSearchBy] = useState('Mobile Number')
  const [devQ, setDevQ] = useState('')
  const [searchCountryCode, setSearchCountryCode] = useState('+91')
  const [devResults, setDevResults] = useState(null)
  const [devotee, setDevotee] = useState(null)
  const [quickAdd, setQuickAdd] = useState(null)   // null | {name, mobile, email, country_code}
  const [qaBusy, setQaBusy] = useState(false)
  const [qaErr, setQaErr] = useState('')
  const [qaMobileError, setQaMobileError] = useState('')

  // Debounced search; one devotee per phone, so a full mobile match is linked straight away
  useEffect(() => {
    if (devotee) return
    const q = devQ.trim()
    if (q.length < 4) { setDevResults(null); return }
    const t = setTimeout(() => {
      DevoteesAPI.list({ q, size: 8 })
        .then((r) => {
          const items = r.items || []
          const exact = searchBy === 'Mobile Number' ? items.find((d) => d.mobile === q) : null
          if (exact) { setDevotee(exact); setDevResults(null); return }
          setDevResults(items)
        })
        .catch(() => setDevResults(null))
    }, 300)
    return () => clearTimeout(t)
  }, [devQ, devotee, searchBy])

  // ── Sankalpam (prefilled from the devotee's saved details) ──
  const [gothram, setGothram] = useState('')
  const [nakshatram, setNakshatram] = useState('')
  const [rasi, setRasi] = useState('')
  const [beneficiary, setBeneficiary] = useState('')
  const [participants, setParticipants] = useState([])
  const [specialNotes, setSpecialNotes] = useState('')
  useEffect(() => {
    setGothram(devotee?.gothram || '')
    setNakshatram(devotee?.nakshatram || '')
    setRasi(devotee?.rasi || '')
    setBeneficiary('')
    setParticipants([])
    setSpecialNotes('')
  }, [devotee])

  // ── Pooja, plan, date, slot ──
  const [poojaId, setPoojaId] = useState('')
  const [plan, setPlan] = useState(null)
  const [schedDate, setSchedDate] = useState(() => addDaysISO(todayIST(), 1))
  const [slot, setSlot] = useState('')
  const [poojariId, setPoojariId] = useState('')
  const [vehicleNo, setVehicleNo] = useState('')
  const pooja = poojas.find((p) => String(p.id) === String(poojaId)) || null

  const today = todayIST()
  const limitDate = cfg.maxDays != null ? addDaysISO(today, cfg.maxDays) : null

  // Festival window for a Festival-category pooja: current, next upcoming, or all over
  const festInfo = (() => {
    if (!pooja || pooja.category !== 'Festival') return null
    const linked = festivals.filter((f) => f.status === 'Active' && f.start_date && f.end_date && (f.pooja_ids || []).includes(pooja.id))
    if (!linked.length) return null
    const current = linked.find((f) => f.start_date <= today && today <= f.end_date)
    if (current) return { fest: current }
    const upcoming = linked.filter((f) => f.start_date > today).sort((a, b) => a.start_date.localeCompare(b.start_date))[0]
    if (upcoming) return { fest: upcoming }
    return { past: true, windows: linked.map((f) => `${f.name} (${fmtDate(f.start_date)} – ${fmtDate(f.end_date)})`).join(', ') }
  })()
  const fest = festInfo?.fest || null

  // Monthly poojas are performed on Pournami — offer only those dates when the calendar has them
  const isMonthly = pooja?.category === 'Monthly'
  const monthlyDates = pournamiDates.filter((d) => d >= today && (!limitDate || d <= limitDate))
  const usePournami = isMonthly && monthlyDates.length > 0

  const minDate = fest && fest.start_date > today ? fest.start_date : today
  const maxDate = [fest?.end_date, limitDate].filter(Boolean).sort()[0] || undefined

  // Settings load after the first render: keep the default date inside the admin's limit
  useEffect(() => {
    if (limitDate && schedDate > limitDate) setSchedDate(limitDate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limitDate])

  const defaultDateFor = (p) => {
    if (!p) return addDaysISO(today, 1)
    if (p.category === 'Monthly') {
      const first = pournamiDates.find((d) => d >= today && (!limitDate || d <= limitDate))
      if (first) return first
    }
    if (p.category === 'Festival') {
      const linked = festivals.filter((f) => f.status === 'Active' && f.start_date && f.end_date && (f.pooja_ids || []).includes(p.id))
      const cur = linked.find((f) => f.start_date <= today && today <= f.end_date)
      if (cur) return today
      const next = linked.filter((f) => f.start_date > today).sort((a, b) => a.start_date.localeCompare(b.start_date))[0]
      if (next) return next.start_date
    }
    const tomorrow = addDaysISO(today, 1)
    return limitDate && tomorrow > limitDate ? today : tomorrow
  }
  const choosePooja = (id) => {
    const p = poojas.find((x) => String(x.id) === String(id)) || null
    setPoojaId(id); setPlan(null); setVehicleNo('')
    setSchedDate(defaultDateFor(p))
  }

  const slotsForDate = openSlots(cfg.slots, schedDate)
  // Slot is optional — clear it if it's no longer valid for the chosen date
  useEffect(() => {
    if (slot && !slotsForDate.includes(slot)) setSlot('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedDate, cfg.slots.join('|')])

  // ── Pricing (same rule as Counter: committee plans need the committee's festival price) ──
  const festCommitteeFee = plan?.committee_decided ? Number(fest?.plan_fees?.[String(plan.id)] || 0) : 0
  const fee = plan?.committee_decided ? festCommitteeFee : Number(plan?.fee || 0)
  const pricingAwaited = !!plan && !(fee > 0)

  // ── Active plan check (renewals that start after the current plan ends are allowed) ──
  const [dupWarning, setDupWarning] = useState(null)
  const [dupChecking, setDupChecking] = useState(false)
  useEffect(() => {
    if (!devotee?.id || !pooja?.id || !plan?.id || !schedDate) { setDupWarning(null); setDupChecking(false); return }
    let cancelled = false
    setDupChecking(true)
    BookingsAPI.checkDuplicate({ devotee_id: devotee.id, mobile: devotee.mobile, pooja_id: pooja.id, plan_id: plan.id, scheduled_date: schedDate })
      .then((res) => { if (!cancelled) setDupWarning(res.has_duplicate ? res : null) })
      .catch(() => { if (!cancelled) setDupWarning(null) })
      .finally(() => { if (!cancelled) setDupChecking(false) })
    return () => { cancelled = true }
  }, [devotee?.id, devotee?.mobile, pooja?.id, plan?.id, schedDate])

  // ── Poojari clash: already booked for the same date and slot ──
  const [poojariClash, setPoojariClash] = useState([])
  useEffect(() => {
    if (!poojariId || !schedDate || !slot) { setPoojariClash([]); return }
    let cancelled = false
    PoojarisAPI.schedule(schedDate)
      .then((r) => {
        if (cancelled) return
        const group = (r.groups || []).find((g) => String(g.poojari?.id) === String(poojariId))
        setPoojariClash((group?.bookings || []).filter((b) => b.time_slot === slot))
      })
      .catch(() => { if (!cancelled) setPoojariClash([]) })
    return () => { cancelled = true }
  }, [poojariId, schedDate, slot])

  // ── Step 1 validation: first problem blocks "Next" and is shown next to it ──
  const step1Issue = (() => {
    if (!devotee) return tr('Select or register the devotee.')
    if (!pooja) return tr('Select a pooja.')
    if (festInfo?.past) return tr('The festival window for this pooja is over') + ` (${festInfo.windows}).`
    if (!plan) return tr('Select a plan.')
    if (pricingAwaited) return tr('Awaiting committee decision on pricing.')
    if (!schedDate) return tr('Select the pooja date.')
    if (schedDate < minDate) return tr('The pooja date cannot be before') + ` ${fmtDate(minDate)}.`
    if (maxDate && schedDate > maxDate) return tr('The pooja date cannot be after') + ` ${fmtDate(maxDate)}.`
    if (usePournami && !monthlyDates.includes(schedDate)) return tr('Select a Pournami date for this monthly pooja.')
    if (dupChecking) return tr('Checking existing plans, please wait.')
    if (dupWarning) return tr('Booking blocked: An active plan already exists for this devotee and pooja.')
    return ''
  })()

  // ── Payment & result ──
  const [method, setMethod] = useState('Cash')
  const [utr, setUtr] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ticket, setTicket] = useState(null)

  function openQuickAdd() {
    const q = devQ.trim()
    const isMobile = /^\d{6,}$/.test(q)
    setQaErr(''); setQaMobileError('')
    setQuickAdd({ name: isMobile ? '' : q, mobile: isMobile ? q : '', email: '', country_code: '+91' })
  }
  async function saveQuickAdd() {
    setQaErr('')
    if (!quickAdd.name.trim() || !quickAdd.mobile.trim()) { setQaErr(tr('Name and mobile are required.')); return }
    if ((quickAdd.country_code || '+91') === '+91') {
      if (!/^\d{10}$/.test(quickAdd.mobile.trim())) { setQaErr(tr('Please Enter 10 digits Mobile Number')); return }
      if (!validatePhone(quickAdd.mobile.trim()).valid) { setQaErr(tr('Invalid Mobile Number')); return }
    }
    setQaBusy(true)
    try {
      const d = await DevoteesAPI.create({ name: quickAdd.name.trim(), mobile: quickAdd.mobile.trim(), email: quickAdd.email.trim() || undefined })
      setDevotee(d)
      setQuickAdd(null); setDevResults(null); setDevQ('')
    } catch (ex) { setQaErr(ex.detail || tr('Could not create devotee.')) } finally { setQaBusy(false) }
  }
  async function search() {
    const q = devQ.trim()
    if (!q) return
    const r = await DevoteesAPI.list({ q, size: 8 }).catch(() => ({ items: [] }))
    setDevResults(r.items || [])
  }

  async function pay() {
    setError('')
    if (step1Issue) { setError(step1Issue); setStep(0); return }
    const ref = utr.trim()
    if (method === 'UPI/QR Code' && ref && !/^[A-Za-z0-9]{6,40}$/.test(ref)) {
      setError(tr('UTR must contain only letters and numbers.')); return
    }
    setBusy(true)
    try {
      const res = await BookingsAPI.quickCreate({
        devotee_id: devotee.id, devotee_name: devotee.name, mobile: devotee.mobile,
        pooja_id: pooja.id, plan_id: plan.id, plan_name: plan.plan_name, seva_name: pooja.name, category: pooja.category,
        amount: fee, scheduled_date: schedDate, time_slot: slot || undefined,
        poojari_id: poojariId ? Number(poojariId) : undefined,
        vehicle_no: pooja.category === 'Vehicle' ? (vehicleNo.trim() || undefined) : undefined,
        gothram: gothram.trim() || undefined, nakshatram: nakshatram.trim() || undefined, rasi: rasi.trim() || undefined,
        beneficiary_name: beneficiary.trim() || undefined,
        participants: participants.length ? JSON.stringify(participants) : undefined,
        special_notes: specialNotes.trim() || undefined,
        payment_method: method, txn_ref: method === 'UPI/QR Code' ? (ref || undefined) : undefined,
        source: 'Advance',
      })
      // Keep the devotee's saved Sankalpam up to date for future bookings
      const updates = {}
      if (gothram.trim() && gothram.trim() !== (devotee.gothram || '')) updates.gothram = gothram.trim()
      if (nakshatram.trim() && nakshatram.trim() !== (devotee.nakshatram || '')) updates.nakshatram = nakshatram.trim()
      if (rasi.trim() && rasi.trim() !== (devotee.rasi || '')) updates.rasi = rasi.trim()
      if (Object.keys(updates).length) {
        DevoteesAPI.update(devotee.id, updates).catch(() => toast(tr('Booking completed, but devotee details could not be saved.'), 'error'))
      }
      setTicket({ ...res, _paidAt: stampNow(), _method: method, _utr: method === 'UPI/QR Code' ? ref : '' })
      setStep(2)
    } catch (err) { setError(err.detail || tr('Payment failed. Please try again.')) } finally { setBusy(false) }
  }

  function startNew() {
    setStep(0); setDevotee(null); setDevQ(''); setDevResults(null); setQuickAdd(null)
    setPoojaId(''); setPlan(null); setSchedDate(addDaysISO(todayIST(), 1)); setSlot('')
    setPoojariId(''); setVehicleNo(''); setMethod('Cash'); setUtr(''); setTicket(null); setError('')
  }

  const modeLabel = (m) => tr(m === 'UPI/QR Code' ? 'UPI / QR Code' : m)
  const sankalpamText = [gothram, nakshatram, rasi].filter(Boolean).join(' · ')
  const poojariName = personName(poojaris.find((p) => String(p.id) === String(poojariId)), lang)

  const summaryRows = [
    { icon: User, k: tr('Devotee'), v: `${personName(devotee, lang)} (${devotee?.mobile})` },
    { icon: Landmark, k: tr('Pooja'), v: pooja ? (lang === 'te' && pooja.name_te ? pooja.name_te : tr(pooja.name)) : '' },
    { icon: CalendarDays, k: tr('Plan'), v: tr(plan?.plan_name || '') },
    { icon: Calendar, k: tr('Pooja Date'), v: fmtDate(schedDate) },
    ...(slot ? [{ icon: Clock, k: tr('Time Slot'), v: clock12(slot) }] : []),
    ...(poojariId ? [{ icon: User, k: tr('Poojari'), v: poojariName || '—' }] : []),
    ...(vehicleNo.trim() && pooja?.category === 'Vehicle' ? [{ icon: Car, k: tr('Vehicle No'), v: vehicleNo.trim() }] : []),
    ...(sankalpamText ? [{ icon: FileText, k: tr('Sankalpam'), v: sankalpamText }] : []),
    { icon: ShieldCheck, k: tr('Validity'), v: validityPreview(plan, schedDate) },
  ]

  return (
    <div>
      <div className="text-[0.75rem] text-gray-400 mb-1"><Link to="/admin/bookings" className="hover:text-maroon-600"><T>Pooja Management</T></Link> › <Link to="/admin/bookings" className="hover:text-maroon-600"><T>Bookings</T></Link> › <span className="text-gray-500"><T>Advance Pooja Booking</T></span></div>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="font-serif text-2xl font-bold text-maroon-700"><T>Advance Pooja Booking</T></h1>
          <p className="text-[0.78125rem] text-gray-500 mt-0.5"><T>Book a pooja for a chosen future date, time slot and poojari. For walk-up billing use Counter Billing.</T></p>
        </div>
        <button onClick={() => nav('/admin/bookings')} className="btn-outline !py-2.5"><ArrowLeft size={15} />{' '}<T>Back to Bookings</T></button>
      </div>

      <Stepper step={step} />
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">{error}</div>}

      {/* ── Step 1: Booking Details ── */}
      {step === 0 && (
        <div className="space-y-5">
          {/* 1. Devotee */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 sm:p-5">
            <div className="flex items-center gap-2 text-maroon-700 mb-4"><User size={18} aria-hidden="true" /><h3 className="font-serif text-base sm:text-lg font-bold">{tr('1. Devotee Search & Selection')}</h3></div>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1.2fr_auto] gap-4 sm:gap-5 items-start">
              <div>
                <label className="label"><T>Search By</T></label>
                <div className="flex flex-wrap gap-3 sm:gap-5 mb-3 mt-1" role="group" aria-label={tr('Search method')}>
                  {['Mobile Number', 'Devotee Name'].map((o) => (
                    <label key={o} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"><input type="radio" name="sby" className="accent-maroon-700" checked={searchBy === o} onChange={() => { setSearchBy(o); setDevQ(''); setDevResults(null) }} /> {tr(o)}</label>
                  ))}
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  {searchBy === 'Mobile Number' ? (
                    <div className="flex flex-1">
                      <CountryCodeSelect value={searchCountryCode} onChange={(e) => setSearchCountryCode(e.target.value)} />
                      <input className="input flex-1 !rounded-l-none" placeholder={tr('Enter Mobile Number')} aria-label={tr('Mobile number')} value={devQ} maxLength={getCountryDigits(searchCountryCode)} onChange={(e) => setDevQ(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && search()} />
                    </div>
                  ) : (
                    <input className="input flex-1" placeholder={tr('Enter Devotee Name')} aria-label={tr('Devotee name')} value={devQ} onChange={(e) => setDevQ(sanitizeName(e.target.value))} onKeyDown={(e) => e.key === 'Enter' && search()} />
                  )}
                  <button type="button" onClick={search} className="btn-maroon !px-4" aria-label={tr('Search devotee')}><Search size={15} aria-hidden="true" />{' '}<T>Search</T></button>
                </div>
              </div>
              <div className="hidden lg:flex flex-col items-center justify-center text-[0.75rem] text-gray-400 self-stretch"><div className="flex-1 w-px bg-gray-100" /><span className="py-1"><T>OR</T></span><div className="flex-1 w-px bg-gray-100" /></div>
              <div>
                <label className="label"><T>Select Devotee</T></label>
                {devotee ? (
                  <div className="flex items-center gap-3 border border-emerald-200 rounded-xl px-3.5 py-3 bg-emerald-50/40">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 grid place-items-center"><Check size={18} /></div>
                    <div className="flex-1">
                      <div className="font-bold text-gray-800">{personName(devotee, lang)}</div>
                      <div className="text-[0.75rem] text-gray-500">{devotee.mobile}{devotee.code ? ` · ${devotee.code}` : ''} · <span className="text-emerald-700"><T>Existing devotee</T></span></div>
                    </div>
                    <button type="button" onClick={() => { setDevotee(null); setDevQ('') }} className="text-gray-400 hover:text-red-600" aria-label={tr('Clear devotee')}><X size={16} /></button>
                  </div>
                ) : devResults === null ? (
                  <div className="border border-dashed border-gray-200 rounded-xl px-3.5 py-4 text-[0.8125rem] text-gray-400 text-center"><T>Search and select a devotee.</T></div>
                ) : (
                  <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-40 overflow-y-auto">
                    {devResults.map((d) => (
                      <button key={d.id} type="button" onClick={() => setDevotee(d)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50">
                        <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-700 grid place-items-center text-[0.75rem] font-bold">{d.name[0]}</div>
                        <div className="flex-1 min-w-0"><div className="font-semibold text-gray-800 text-[0.8125rem]">{personName(d, lang)}</div><div className="text-[0.6875rem] text-gray-400">{d.code} · {d.mobile}</div></div>
                      </button>
                    ))}
                    {devResults.length === 0 && (
                      <div className="px-3 py-4 text-center">
                        <div className="text-[0.8125rem] text-blue-700 mb-2 flex items-center justify-center gap-1.5"><UserPlus size={14} /> <T>New devotee</T> — {devQ}</div>
                        <button type="button" onClick={openQuickAdd} className="inline-flex items-center gap-1.5 text-[0.78125rem] font-semibold text-maroon-700 border border-maroon-200 rounded-lg px-3 py-1.5 hover:bg-maroon-50"><UserPlus size={14} /> <T>Register New Devotee</T></button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="self-end"><button type="button" onClick={openQuickAdd} className="btn-outline whitespace-nowrap"><UserPlus size={15} />{' '}<T>Register New Devotee</T></button></div>
            </div>

            {quickAdd && (
              <div className="mt-4 border border-maroon-200 bg-maroon-50/30 rounded-xl p-3 sm:p-4" role="region" aria-labelledby="quick-add-title">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-maroon-700"><UserPlus size={16} aria-hidden="true" /><h4 id="quick-add-title" className="font-semibold text-[0.8125rem] sm:text-[0.875rem]"><T>Quick Add Devotee</T></h4></div>
                  <button type="button" onClick={() => setQuickAdd(null)} className="text-gray-400 hover:text-red-600 rounded-lg p-1" aria-label={tr('Close')}><X size={16} aria-hidden="true" /></button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div><label className="label"><T>Full Name *</T></label><input autoFocus className="input" aria-label={tr('Full name')} placeholder={tr('Full Name')} value={quickAdd.name} onChange={(e) => setQuickAdd((q) => ({ ...q, name: sanitizeName(e.target.value) }))} /></div>
                  <div>
                    <label className="label"><T>Mobile Number *</T></label>
                    <div className="flex">
                      <CountryCodeSelect value={quickAdd.country_code || '+91'} onChange={(e) => { setQuickAdd((q) => ({ ...q, country_code: e.target.value })); setQaMobileError('') }} />
                      <input className={`input flex-1 !rounded-l-none ${qaMobileError ? 'border-red-400' : ''}`} aria-label={tr('Mobile number')} placeholder={tr('Enter Mobile Number')} value={quickAdd.mobile} maxLength={getCountryDigits(quickAdd.country_code || '+91')} onChange={(e) => {
                        const cleaned = sanitizePhone(e.target.value)
                        setQuickAdd((q) => ({ ...q, mobile: cleaned }))
                        if ((quickAdd.country_code || '+91') !== '+91') { setQaMobileError(''); return }
                        if (cleaned.length === 10) setQaMobileError(validatePhone(cleaned).valid ? '' : tr('Invalid Mobile Number'))
                        else setQaMobileError(cleaned.length ? tr('Please Enter 10 digits Mobile Number') : '')
                      }} />
                    </div>
                    {qaMobileError && <p className="text-[0.6875rem] text-red-600 mt-1 font-medium">{qaMobileError}</p>}
                  </div>
                  <div><label className="label"><T>Email (optional)</T></label><input className="input" aria-label={tr('Email')} placeholder={tr('email@example.com')} value={quickAdd.email} onChange={(e) => setQuickAdd((q) => ({ ...q, email: e.target.value }))} /></div>
                </div>
                {qaErr && <div className="text-[0.75rem] text-red-600 mt-2" role="alert">{qaErr}</div>}
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <button type="button" onClick={saveQuickAdd} disabled={qaBusy} className="btn-maroon !py-2 disabled:opacity-60"><Check size={15} aria-hidden="true" /> {qaBusy ? tr('Saving…') : tr('Add & Select')}</button>
                  <button type="button" onClick={() => setQuickAdd(null)} className="btn-outline !py-2"><T>Cancel</T></button>
                  <span className="text-[0.65rem] sm:text-[0.71875rem] text-gray-400 ml-1"><T>One devotee per mobile number. You can complete the full profile later from Devotee Management.</T></span>
                </div>
              </div>
            )}

            {/* Sankalpam — opens once a devotee is selected */}
            {devotee && (
              <div className="mt-4 border-t border-gray-100 pt-4">
                <div className="flex items-center gap-2 text-gray-700 mb-3"><FileText size={15} className="text-amber-600" /><span className="text-[0.8125rem] font-semibold"><T>Sankalpam Details</T></span><span className="text-[0.6875rem] text-gray-400">(<T>Optional</T>)</span></div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div><label className="label !text-[0.6875rem]"><T>Gothram</T></label><Combobox value={gothram} onChange={(e) => setGothram(e.target.value)} options={GOTHRAMS} placeholder={tr('Select')} className="!py-1.5 text-sm" /></div>
                  <div><label className="label !text-[0.6875rem]"><T>Nakshatram</T></label><Combobox value={nakshatram} onChange={(e) => setNakshatram(e.target.value)} options={NAKSHATRAMS} placeholder={tr('Select')} className="!py-1.5 text-sm" /></div>
                  <div><label className="label !text-[0.6875rem]"><T>Rasi</T></label><Combobox value={rasi} onChange={(e) => setRasi(e.target.value)} options={RASHIS} placeholder={tr('Select')} className="!py-1.5 text-sm" /></div>
                  <div><label className="label !text-[0.6875rem]"><T>Beneficiary</T></label><input className="input !py-2 text-sm" value={beneficiary} onChange={(e) => setBeneficiary(sanitizeName(e.target.value))} placeholder={tr('For whom')} /></div>
                  <div><label className="label !text-[0.6875rem]"><T>Participants</T></label><ParticipantsInput participants={participants} setParticipants={setParticipants} devotee={devotee} /></div>
                  <div><label className="label !text-[0.6875rem]"><T>Special Notes</T></label><input className="input !py-2 text-sm" value={specialNotes} onChange={(e) => setSpecialNotes(e.target.value)} placeholder={tr('Any special instructions...')} /></div>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.6fr] gap-5">
            {/* 2. Pooja */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 text-maroon-700 mb-4"><Flame size={18} /><h3 className="font-serif text-lg font-bold">{tr('2. Pooja Selection')}</h3></div>
              <label className="label"><T>Select Pooja *</T></label>
              <Select value={poojaId} onChange={(e) => choosePooja(e.target.value)} className="input"><option value="">{tr('Select a pooja…')}</option>{poojas.map((p) => <option key={p.id} value={p.id}>{p.name_te && lang === 'te' ? p.name_te : tr(p.name)}{p.category ? ` · ${tr(p.category)}` : ''}</option>)}</Select>
              {festInfo?.past && (
                <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-[0.78125rem] text-red-700 flex items-start gap-2"><AlertTriangle size={15} className="shrink-0 mt-0.5" /> <span><T>The festival window for this pooja is over</T> ({festInfo.windows}).</span></div>
              )}
              {fest && (
                <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-[0.78125rem] text-amber-800 flex items-start gap-2"><CalendarDays size={15} className="shrink-0 mt-0.5" /> <span>{fest.name}: {fmtDate(fest.start_date)} – {fmtDate(fest.end_date)}. <T>The pooja date must fall in this festival window.</T></span></div>
              )}
              {isMonthly && (
                <div className="mt-3 bg-blue-50/60 border border-blue-100 rounded-lg px-3 py-2 text-[0.78125rem] text-blue-800 flex items-start gap-2"><Moon size={15} className="shrink-0 mt-0.5" /> <T>Monthly poojas are booked on Pournami dates.</T></div>
              )}
            </div>

            {/* 3. Plan */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 text-maroon-700 mb-4"><CalendarDays size={18} /><h3 className="font-serif text-lg font-bold">{tr('3. Plan Selection')}</h3></div>
              {!pooja ? (
                <div className="border border-dashed border-gray-200 rounded-xl px-4 py-10 text-center text-gray-600 text-[0.8125rem]"><T>Select a pooja to view available plans.</T></div>
              ) : (
                <div className="border border-gray-100 rounded-xl overflow-hidden overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-gray-50/70 text-left text-[0.65625rem] uppercase tracking-wide text-gray-700"><th className="px-4 py-2.5"><T>Plan</T></th><th className="px-2 py-2.5 text-right"><T>Rate (₹)</T></th><th className="px-2 py-2.5"><T>Validity</T></th><th className="px-2 py-2.5"><T>Select</T></th></tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {(pooja.plans || []).map((pl) => {
                        const on = plan?.id === pl.id
                        const committeePrice = pl.committee_decided ? Number(fest?.plan_fees?.[String(pl.id)] || 0) : 0
                        return (
                          <tr key={pl.id} className={on ? 'bg-maroon-50/40' : 'hover:bg-gray-50/60'}>
                            <td className="px-4 py-3 font-semibold text-gray-800"><span className="inline-flex items-center gap-2"><span onClick={() => setPlan(pl)} className={`w-4 h-4 rounded-full border-2 grid place-items-center cursor-pointer ${on ? 'border-maroon-600' : 'border-gray-300'}`}>{on && <span className="w-2 h-2 rounded-full bg-maroon-600" />}</span>{tr(pl.plan_name)}</span></td>
                            <td className="px-2 py-3 text-right font-semibold text-gray-800">
                              {pl.committee_decided ? (committeePrice > 0 ? money2(committeePrice) : <span className="text-[0.75rem] text-amber-700 font-medium"><T>Awaiting committee</T></span>) : money2(pl.fee)}
                            </td>
                            <td className="px-2 py-3 text-gray-600 text-[0.8125rem]">{spanLabel(pl)}</td>
                            <td className="px-2 py-3">{on ? <span className="text-[0.75rem] font-semibold text-maroon-700 inline-flex items-center gap-1"><Check size={13} />{' '}<T>Selected</T></span> : <button type="button" onClick={() => setPlan(pl)} className="text-[0.75rem] font-semibold rounded-lg px-3 py-1 border border-maroon-200 text-maroon-700 hover:bg-maroon-50"><T>Select</T></button>}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {dupWarning && (
                <div className="mt-4 rounded-xl px-4 py-3.5 flex items-start gap-3 bg-red-50 border-2 border-red-400">
                  <AlertTriangle size={20} className="text-red-700 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-bold text-red-800"><T>Active Plan Exists - Booking Blocked</T></div>
                    <div className="text-[0.8125rem] mt-0.5 text-red-700">{tr(dupWarning.message)}</div>
                    {dupWarning.valid_until && <div className="text-[0.75rem] text-gray-600 mt-1"><T>Valid until</T>: {fmtDate(dupWarning.valid_until)} — <T>a renewal can start the next day.</T></div>}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 4. Date, slot, poojari */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 text-maroon-700 mb-4"><Calendar size={18} /><h3 className="font-serif text-lg font-bold">{tr('4. Pooja Date & Time')}</h3></div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
              <div>
                <label className="label"><T>Pooja Date *</T></label>
                {usePournami ? (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {monthlyDates.slice(0, 8).map((d) => (
                      <button key={d} type="button" onClick={() => setSchedDate(d)} className={`px-2.5 py-1.5 rounded-lg text-[0.75rem] font-medium border ${schedDate === d ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50'}`}>{fmtDate(d)}</button>
                    ))}
                  </div>
                ) : (
                  <DateField value={schedDate} min={minDate} max={maxDate} onChange={(e) => setSchedDate(e.target.value)} />
                )}
                <div className="text-[0.75rem] text-gray-400 mt-1.5">
                  {cfg.maxDays != null ? <>{tr('Bookings are open up to')} {fmtDate(limitDate)}.</> : <T>Any date from today onwards.</T>}
                </div>
                {plan && <div className="text-[0.75rem] text-emerald-700 mt-1"><T>Validity</T>: {validityPreview(plan, schedDate)}</div>}
              </div>
              <div>
                <label className="label"><T>Time Slot</T> <T>(Optional)</T></label>
                {cfg.slots.length === 0 ? (
                  <div className="text-[0.8125rem] text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2"><T>No time slots configured in Settings.</T></div>
                ) : slotsForDate.length === 0 ? (
                  <div className="text-[0.8125rem] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"><T>All time slots for this date are over. The booking will be saved without a time slot.</T></div>
                ) : (
                  <Select value={slot} onChange={(e) => setSlot(e.target.value)}><option value="">{tr('Not selected')}</option>{slotsForDate.map((s) => <option key={s} value={s}>{clock12(s)}</option>)}</Select>
                )}
                <div className="text-[0.75rem] text-gray-400 mt-1.5"><T>Slots are managed in Settings › Pooja Booking Settings.</T></div>
              </div>
              <div>
                <label className="label"><T>Assign Poojari (Optional)</T></label>
                <Select value={poojariId} onChange={(e) => setPoojariId(e.target.value)}><option value="">{tr('Not assigned')}</option>{poojaris.map((p) => <option key={p.id} value={p.id}>{personName(p, lang)}{p.specialization ? ` · ${tr(p.specialization)}` : ''}</option>)}</Select>
                {poojariClash.length > 0 ? (
                  <div className="text-[0.75rem] text-amber-700 mt-1.5 flex items-start gap-1"><AlertTriangle size={13} className="shrink-0 mt-0.5" /> <span><T>This poojari already has a booking in this slot</T>: {poojariClash.map((b) => b.booking_code).join(', ')}</span></div>
                ) : (
                  <div className="text-[0.75rem] text-gray-400 mt-1.5"><T>Optionally assign a poojari to perform this booking.</T></div>
                )}
              </div>
              {pooja?.category === 'Vehicle' && (
                <div>
                  <label className="label"><T>Vehicle No</T> <span className="text-gray-400 font-normal">(<T>Optional</T>)</span></label>
                  <input className="input" value={vehicleNo} maxLength={12} onChange={(e) => setVehicleNo(sanitizeVehicle(e.target.value))} placeholder="TS 09 AB 1234" />
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <button onClick={() => nav('/admin/bookings')} className="btn-outline"><T>Cancel</T></button>
            <div className="flex items-center gap-3">
              {step1Issue && <span className="text-[0.78125rem] text-amber-700 text-right">{dupChecking && <Loader2 size={13} className="inline animate-spin mr-1" />}{step1Issue}</span>}
              <button onClick={() => { setError(''); setStep(1) }} disabled={!!step1Issue} className="btn-maroon disabled:opacity-40">{tr('Next: Review & Payment')} <ArrowRight size={15} /></button>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 2: Review & Payment ── */}
      {step === 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-5">
          <div className="space-y-5">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 text-maroon-700 mb-4"><ClipboardList size={18} /><h3 className="font-serif text-lg font-bold">{tr('1. Booking Summary')}</h3></div>
              <div className="divide-y divide-gray-100">
                {summaryRows.map((r) => { const Icon = r.icon; return (
                  <div key={r.k} className="flex items-center gap-3 py-2.5 text-[0.84375rem]"><Icon size={15} className="text-gray-400 shrink-0" /><span className="text-gray-500 w-32 shrink-0">{r.k}</span><span className="text-gray-400">:</span><span className="text-gray-800 font-medium">{r.v}</span></div>
                ) })}
              </div>
              <div className="mt-3 bg-blue-50/60 border border-blue-100 rounded-lg px-3.5 py-2.5 text-[0.78125rem] text-gray-600 flex items-start gap-2"><Info size={15} className="text-blue-500 shrink-0 mt-0.5" />{' '}<T>Please verify all details before proceeding to payment.</T></div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 text-maroon-700 mb-4"><CreditCard size={18} /><h3 className="font-serif text-lg font-bold">{tr('2. Payment Details')}</h3></div>
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
              {method === 'UPI/QR Code' && (
                <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 items-start">
                  {cfg.upiId && fee > 0 && (
                    <div className="flex flex-col items-center bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <QRCodeSVG value={buildUpiUrl(cfg.upiId, cfg.upiPayee, fee)} size={120} level="M" />
                      <p className="text-[0.6875rem] text-gray-500 mt-1">{cfg.upiId}</p>
                    </div>
                  )}
                  <div>
                    <label className="label"><T>UTR / Transaction ID</T> <span className="text-gray-400 font-normal">(<T>Optional</T>)</span></label>
                    <input className="input" placeholder={tr('Enter UTR / Transaction ID')} value={utr} maxLength={40} onChange={(e) => setUtr(e.target.value.replace(/\s/g, ''))} />
                    <div className="text-[0.6875rem] text-gray-400 mt-1"><T>Saved with the booking for reconciliation when entered.</T></div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 text-maroon-700 mb-4"><IndianRupee size={18} /><h3 className="font-serif text-lg font-bold"><T>Booking Amount Summary</T></h3></div>
              {plan?.committee_decided ? (
                <div className="py-2">
                  <div className="flex justify-between text-[0.84375rem]"><span className="text-gray-500"><T>Committee Price</T>{fest ? ` (${fest.name})` : ''}</span><span className="font-bold text-gray-800">{money2(fee)}</span></div>
                  <div className="text-[0.6875rem] text-emerald-700 mt-1"><T>Set by the committee in the Festival Master.</T></div>
                </div>
              ) : (
                <div className="flex justify-between py-2 text-[0.84375rem]"><span className="text-gray-500"><T>Rate (₹)</T></span><span className="font-medium text-gray-800">{money2(fee)}</span></div>
              )}
              <div className="flex justify-between items-center py-3 mt-1 border-t border-gray-200"><span className="font-bold text-maroon-800"><T>Total Amount (₹)</T></span><span className="text-xl font-extrabold text-maroon-800">{money2(fee)}</span></div>
            </div>
            <div className="bg-amber-50/50 border border-amber-100 rounded-lg px-4 py-3 text-[0.78125rem] text-gray-600 flex items-start gap-2"><Info size={15} className="text-amber-600 shrink-0 mt-0.5" />{' '}<T>All payments are subject to temple rules and availability.</T></div>
          </div>

          <div className="lg:col-span-2 flex justify-between">
            <button onClick={() => setStep(0)} className="btn-outline"><ArrowLeft size={15} />{' '}<T>Previous</T></button>
            <button onClick={pay} disabled={busy || !!step1Issue} className="btn-maroon disabled:opacity-60">{busy ? <><Loader2 size={15} className="animate-spin" /> {tr('Processing…')}</> : <>{tr('Confirm Booking & Pay')} <ArrowRight size={15} /></>}</button>
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
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 text-maroon-700 mb-4"><ClipboardList size={18} /><h3 className="font-serif text-lg font-bold">{tr('Booking & Payment Details')}</h3></div>
              <div className="divide-y divide-gray-100 text-[0.84375rem]">
                <Detail k={tr('Booking ID')} v={<span className="font-mono">{ticket.booking_code}</span>} />
                <Detail k={tr('Ticket Number')} v={<span className="font-mono text-maroon-700 font-semibold">{ticket.ticket_no || ticket.receipt_no}</span>} />
                {summaryRows.filter((r) => r.k !== tr('Validity') && r.k !== tr('Poojari')).map((r) => <Detail key={r.k} k={r.k} v={r.v} />)}
                {ticket.poojari_name && <Detail k={tr('Poojari')} v={personName({ name: ticket.poojari_name }, lang)} />}
                <Detail k={tr('Validity')} v={ticketValidity(ticket)} />
                <Detail k={tr('Amount Paid (₹)')} v={money2(ticket.amount)} />
                <Detail k={tr('Payment Mode')} v={modeLabel(ticket._method)} />
                {ticket._utr && <Detail k={tr('UTR / Transaction ID')} v={<span className="text-emerald-700 font-mono">{ticket._utr}</span>} />}
                <Detail k={tr('Payment Date & Time')} v={ticket._paidAt} />
              </div>
            </div>

            <div id="print-area" className="print-modal">
              <TicketShell code={ticket.booking_code} after={
                <div className="text-[0.5625rem] text-gray-500 leading-relaxed border-t border-dashed border-amber-200 pt-3 mt-3">
                  <div className="font-semibold text-gray-600 mb-1"><T>Terms & Conditions</T>:</div>
                  <ol className="list-decimal list-inside space-y-0.5 pl-1">
                    {ticket.time_slot && <li><T>Please arrive 15 minutes before the scheduled pooja time.</T></li>}
                    <li><T>Ticket is valid only for the pooja date or validity period mentioned.</T></li>
                    <li><T>Refunds are subject to temple policy.</T></li>
                    <li><T>Temple is not responsible for lost or damaged tickets.</T></li>
                  </ol>
                </div>
              }>
                  <TField k={tr('Booking ID')} v={ticket.booking_code} mono />
                  <TField k={tr('Ticket Number')} v={ticket.ticket_no || ticket.receipt_no} mono />
                  <TField k={tr('Devotee')} v={<>{personName(devotee, lang)}<span className="block text-[0.6875rem] text-gray-500 font-normal">{devotee.mobile}</span></>} />
                  {(ticket.gothram || ticket.nakshatram || ticket.rasi) && <TField k={tr('Sankalpam')} v={[ticket.gothram, ticket.nakshatram, ticket.rasi].filter(Boolean).join(' · ')} />}
                  {ticket.beneficiary_name && <TField k={tr('In the name of')} v={ticket.beneficiary_name} />}
                  {participants.length > 0 && <TField k={tr('Participants')} v={participants.map((p) => personName({ name: p.name }, lang)).join(', ')} />}
                  <TField k={tr('Pooja')} v={lang === 'te' && pooja?.name_te ? pooja.name_te : tr(pooja?.name || ticket.seva_name)} />
                  <TField k={tr('Plan')} v={tr(ticket.plan_name)} />
                  <TField k={tr('Pooja Date')} v={fmtDate(ticket.scheduled_date)} />
                  {ticket.time_slot && <TField k={tr('Time Slot')} v={clock12(ticket.time_slot)} />}
                  {ticket.poojari_name && <TField k={tr('Poojari')} v={personName({ name: ticket.poojari_name }, lang)} />}
                  {pooja?.category === 'Vehicle' && vehicleNo.trim() && <TField k={tr('Vehicle No')} v={vehicleNo.trim()} />}
                  <TField k={tr('Validity')} v={ticketValidity(ticket)} />
                  {ticket.special_notes && <TField k={tr('Special Notes')} v={ticket.special_notes} />}
                  <div className="bg-amber-100/60 rounded-lg px-3 py-2 col-span-2 flex items-center justify-between"><span className="text-[0.6875rem] text-gray-500"><T>Amount Paid (₹)</T></span><span className="font-extrabold text-maroon-800">{money2(ticket.amount)}</span></div>
                  <TField k={tr('Payment Mode')} v={modeLabel(ticket._method)} />
                  <TField k={tr('Payment Date & Time')} v={ticket._paidAt} />
              </TicketShell>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 justify-center mt-6 no-print">
            <button onClick={() => window.print()} className="btn-outline"><Printer size={15} />{' '}<T>Print Ticket / Receipt</T></button>
            <button onClick={startNew} className="btn-outline"><Plus size={15} />{' '}<T>New Booking</T></button>
            <button onClick={() => nav('/admin/bookings')} className="btn-maroon"><ArrowLeft size={15} />{' '}<T>Back to Bookings</T></button>
          </div>
        </div>
      )}

      {step === 0 && (
        <div className="mt-4 flex items-center gap-2 text-[0.8125rem] text-gray-500 bg-blue-50/60 border border-blue-100 rounded-lg px-4 py-2.5">
          <ShieldCheck size={15} className="text-blue-500" />{' '}<T>All bookings are subject to temple rules and availability.</T>
        </div>
      )}
    </div>
  )
}

function Detail({ k, v }) {
  return <div className="flex items-center gap-3 py-2.5"><span className="text-gray-500 w-40 shrink-0">{k}</span><span className="text-gray-400">:</span><span className="text-gray-800 font-medium">{v}</span></div>
}
function TField({ k, v, mono }) {
  return <div><div className="text-[0.6875rem] text-gray-500">{k}</div><div className={`text-[0.8125rem] text-gray-800 font-semibold ${mono ? 'font-mono' : ''}`}>{v}</div></div>
}
