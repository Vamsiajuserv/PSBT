import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  Search, UserPlus, User, ArrowLeft, Check, X, Calendar, Clock, Flame, CalendarDays, ShieldCheck,
  IndianRupee, Printer, Plus, CreditCard, Ticket, Moon, Car, AlertTriangle, FileText, Loader2, ShoppingBag, Trash2,
} from 'lucide-react'
import PaymentQr from '../../components/common/PaymentQr.jsx'
import { DevoteesAPI, PoojasAPI, BookingsAPI, PoojarisAPI, FestivalsAPI, AlmanacAPI, SettingsAPI } from '../../api/client.js'
import { fmtDate } from '../../components/admin/ui.jsx'
import { TicketShell } from '../../components/admin/BookingTicket.jsx'
import { toast, confirmDialog } from '../../components/common/Dialog.jsx'
import { Select, MultiSelect, DateField, CountryCodeSelect, getCountryDigits, Combobox } from '../../components/common/Field.jsx'
import ParticipantsInput from '../../components/common/ParticipantsInput.jsx'
import ResetButton from '../../components/common/ResetButton.jsx'
import usePickList from '../../hooks/usePickList.js'
import { T, tr, clock12, useLang, personName, teTerm } from '../../i18n/LanguageContext.jsx'
import { sanitizePhone, sanitizeName, validatePhone, validateEmail, sanitizeVehicle } from '../../lib/validation.js'
import { GOTHRAMS, NAKSHATRAMS, RASHIS } from '../../lib/sankalpam.js'
import { addDaysISO, planValidUntil, planSpan } from '../../lib/planTerms.js'
import { festDaysLeftMsg, festTicketNote } from '../../lib/festivalPlan.js'
import { useActivePlans, activeTag } from '../../lib/activePlans.js'
import { planSlots, slotIsOver, slotPeriod, isRange, isTempleHours, NOTE_VEHICLE, closedSlotMsg } from '../../lib/slots.js'
import { halfLabel, halfRange, halfPeriod, PERIODS } from '../../lib/halfSlots.js'

// ── Advance Booking (redesigned 2026-11-15 — docs/plans/ADVANCE-BOOKING-FINDINGS.md) ──
// Counter = today, next open slot. Advance = choose the date (and time), pay now, get the ticket.
// The devotee and Sankalpam are entered once; poojas are added to a booking list (several poojas
// and dates in one visit) and paid together — every line is booked, or none. The list is the
// review, so there is no separate review step. No payment mode is pre-selected; Online needs the
// UTR. The poojari the Poojari Schedule will assign is shown before paying.

const POOJA_CATS = ['Daily', 'Monthly', 'Long-Term', 'Occasion', 'Festival', 'Vehicle']   // groups in the pooja dropdown
const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const DEFAULT_MAX_DAYS = 90   // the server's default when Settings leaves it blank
const money2 = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const stampNow = () => new Date().toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
const isLifetime = (planName) => /life\s*long|life\s*time|lifetime/i.test(planName || '')

// Validity preview before booking — same calculation as the server, so it matches the ticket
function validityPreview(pl, from, festEnd) {
  if (!pl || !from) return ''
  let end = planValidUntil(pl, from)
  if (festEnd && end && end > festEnd) end = festEnd      // a festival plan ends with the festival
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

export default function NewBooking() {
  const langCtx = useLang()
  const lang = langCtx?.lang || 'en'
  const nav = useNavigate()

  // ── Reference data ──
  const [poojas, setPoojas] = useState([])
  const [festivals, setFestivals] = useState([])
  const [poojaris, setPoojaris] = useState([])
  const [pournamiDates, setPournamiDates] = useState([])
  const [cfg, setCfg] = useState({ maxDays: DEFAULT_MAX_DAYS })
  useEffect(() => {
    PoojasAPI.list().then((d) => setPoojas(d.items || [])).catch(() => toast(tr('Failed to load poojas'), 'error'))
    FestivalsAPI.list().then((r) => setFestivals(r.items || r || [])).catch(() => toast(tr('Failed to load festivals'), 'error'))
    PoojarisAPI.list().then((d) => setPoojaris((Array.isArray(d) ? d : d?.items || []).filter((p) => p.active))).catch(() => toast(tr('Failed to load poojaris'), 'error'))
    AlmanacAPI.pournamis(todayIST(), addDaysISO(todayIST(), 400)).then((r) => setPournamiDates(r.items || [])).catch(() => setPournamiDates([]))
    SettingsAPI.config()
      .then((c) => setCfg({
        maxDays: Number.isInteger(c?.advance_booking_max_days) ? c.advance_booking_max_days : DEFAULT_MAX_DAYS,
      }))
      .catch(() => toast(tr('Failed to load booking settings'), 'error'))
  }, [])

  // ── Devotee ──
  const [searchBy, setSearchBy] = useState('Mobile Number')
  const [devQ, setDevQ] = useState('')
  const [searchCountryCode, setSearchCountryCode] = useState('+91')
  const [devResults, setDevResults] = useState(null)
  const [devotee, setDevotee] = useState(null)
  // First match highlighted; ↑ / ↓ move, Enter picks (client 2026-11-25). Enter on a changed query searches again.
  const searchedQ = useRef('')
  const devPick = usePickList(devResults, (d) => setDevotee(d), { open: !devotee })
  const [quickAdd, setQuickAdd] = useState(null)   // null | {name, mobile, email, country_code}
  const [qaBusy, setQaBusy] = useState(false)
  const [qaErr, setQaErr] = useState('')
  const [qaMobileError, setQaMobileError] = useState('')
  const [qaEmailError, setQaEmailError] = useState('')   // email is optional, but if typed it must look like name@gmail.com
  useEffect(() => {   // debounced search; a full mobile match is linked straight away (one devotee per phone)
    if (devotee) return undefined
    const q = devQ.trim()
    if (q.length < 4) { setDevResults(null); return undefined }
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

  // ── Sankalpam (prefilled from the devotee's saved details; shared by every line) ──
  const [gothram, setGothram] = useState('')
  const [nakshatram, setNakshatram] = useState('')
  const [rasi, setRasi] = useState('')
  const [beneficiary, setBeneficiary] = useState('')
  const [participants, setParticipants] = useState([])
  const [specialNotes, setSpecialNotes] = useState('')
  useEffect(() => {
    setGothram(devotee?.gothram || ''); setNakshatram(devotee?.nakshatram || ''); setRasi(devotee?.rasi || '')
    setBeneficiary(''); setParticipants([]); setSpecialNotes('')
  }, [devotee])

  // ── The pooja being added ──
  const [poojaId, setPoojaId] = useState('')
  const [plan, setPlan] = useState(null)
  const [schedDate, setSchedDate] = useState(() => addDaysISO(todayIST(), 1))
  const [slot, setSlot] = useState('')
  const [batch, setBatch] = useState('')            // half-hour list picked; '' = the earliest open one
  const [batchOpt, setBatchOpt] = useState(null)
  const [poojariId, setPoojariId] = useState('')
  const [vehicleNo, setVehicleNo] = useState('')
  const [moreDates, setMoreDates] = useState(['', ''])   // Yearly Thrice: the 2nd and 3rd pooja dates
  const pooja = poojas.find((p) => String(p.id) === String(poojaId)) || null

  // ── Several poojas at once (2026-11-20): the Pooja dropdown is multi-select, one option per pooja
  // by name (2026-11-26; Daily / Monthly is picked in Plan below), grouped by category. Ticked options wait in `picked`; the form below opens them one at a time
  // (date, time, poojari…) and "Add to booking" moves on to the next, keeping the date — so every line
  // still gets all the checks of a single pooja.
  const [picked, setPicked] = useState([])          // [{ key, pooja, plan }] in the order ticked
  const [curKey, setCurKey] = useState('')          // the ticked option open in the form
  // One option per pooja, by name only (client, 2026-11-26) — the Plan buttons below pick Daily / Monthly
  // and show the price. A pooja with a single plan has it chosen already.
  const tiles = poojas.filter((p) => (p.plans || []).length > 0)
    .map((p) => ({ key: String(p.id), pooja: p, plan: p.plans.length === 1 ? p.plans[0] : null }))

  const today = todayIST()
  const limitDate = addDaysISO(today, cfg.maxDays)

  const festivalsOf = (p) => festivals.filter((f) => f.status === 'Active' && f.start_date && f.end_date && (f.pooja_ids || []).includes(p.id))
  // Festival window for a Festival-category pooja: current, next upcoming, or all over
  const festInfo = (() => {
    if (!pooja || pooja.category !== 'Festival') return null
    const linked = festivalsOf(pooja)
    if (!linked.length) return null
    const current = linked.find((f) => f.start_date <= today && today <= f.end_date)
    if (current) return { fest: current }
    const upcoming = linked.filter((f) => f.start_date > today).sort((a, b) => a.start_date.localeCompare(b.start_date))[0]
    if (upcoming) return { fest: upcoming }
    return { past: true, windows: linked.map((f) => `${teTerm(f.name)} (${fmtDate(f.start_date)} – ${fmtDate(f.end_date)})`).join(', ') }
  })()
  const fest = festInfo?.fest || null

  // Pournami plans (Sai Vratam) are performed on Pournami — only the almanac's Pournami days
  const isPournamiPlan = (pl) => pl?.tithi_type === 'Pournami'
  const allPournami = (p) => (p?.plans || []).length > 0 && p.plans.every(isPournamiPlan)
  const usePournami = plan ? isPournamiPlan(plan) : allPournami(pooja)
  // Today is Pournami but its fixed time (Sai Vratam 9:00 AM) is over → today is not offered; the
  // screen says the slot expired and to book the next Pournami in advance (client, 2026-11-25)
  const tithiSlots = planSlots(plan || (pooja?.plans || []).find(isPournamiPlan))
  const todayTithiOver = usePournami && tithiSlots.length > 0 && tithiSlots.every((s) => slotIsOver(s, today))
  const pournamiExpired = todayTithiOver && pournamiDates.some((d) => d.event_date === today)
  const pournamiChoices = pournamiDates.filter((d) => d.event_date >= today && d.event_date <= limitDate && !(todayTithiOver && d.event_date === today))
  const monthlyDates = pournamiChoices.map((d) => d.event_date)

  // A festival plan can start any day of the festival (client, 2026-11-26): full fee, valid from that
  // day to the festival's last day — Karthika Masam Full Month on 26 Nov runs 26 Nov → 9 Dec
  const minDate = fest && fest.start_date > today ? fest.start_date : today
  const maxDate = [fest?.end_date, limitDate].filter(Boolean).sort()[0]

  const defaultDateFor = (p) => {
    if (!p) return addDaysISO(today, 1)
    if (allPournami(p) && monthlyDates.length) return monthlyDates[0]
    if (p.category === 'Festival') {
      const linked = festivalsOf(p)
      if (linked.find((f) => f.start_date <= today && today <= f.end_date)) return today
      const next = linked.filter((f) => f.start_date > today).sort((a, b) => a.start_date.localeCompare(b.start_date))[0]
      if (next) return next.start_date
    }
    return addDaysISO(today, 1)
  }
  // Open a ticked tile in the form. The date carries over from the line before (several poojas on one
  // day is common), except festival and Pournami poojas, which move to a date they can take.
  const openPick = (t) => {
    const special = t.pooja.category === 'Festival' || allPournami(t.pooja) || isPournamiPlan(t.plan)
    setCurKey(t.key); setPoojaId(String(t.pooja.id)); setPlan(t.plan)
    setVehicleNo(''); setSlot(''); setBatch(''); setPoojariId('')
    if (special || !schedDate || schedDate < today) setSchedDate(defaultDateFor(t.pooja))
  }
  const clearForm = () => { setCurKey(''); setPoojaId(''); setPlan(null); setSlot(''); setBatch(''); setPoojariId(''); setVehicleNo('') }
  // The dropdown hands back every ticked key: drop the unticked ones, add the new ones in order
  // (at most 20 poojas a booking; a vehicle pooja first shows its poojari-availability note).
  const setPickedKeys = async (keys) => {
    const want = new Set(keys)
    const kept = picked.filter((x) => want.has(x.key))
    if (curKey && !want.has(curKey)) clearForm()
    const added = []
    for (const k of keys) {
      if (kept.some((x) => x.key === k) || added.some((x) => x.key === k)) continue
      const t = tiles.find((x) => x.key === k)
      if (!t) continue
      if (lines.length + kept.length + added.length >= 20) { toast(tr('A booking can hold at most 20 poojas.'), 'error'); break }
      if (t.pooja.category === 'Vehicle' && !(await confirmDialog({ title: tr('Vehicle Pooja'), message: tr(NOTE_VEHICLE) + '\n\n' + tr('Please inform the devotee before booking.'), confirmLabel: tr('OK, Continue') }))) continue
      added.push(t)
    }
    setPicked([...kept, ...added])
  }
  const optionLabel = (t) => poojaName(t.pooja)
  useEffect(() => {   // nothing open in the form: open the next ticked tile
    if (!curKey && picked.length) openPick(picked[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curKey, picked])
  useEffect(() => {   // choosing a Pournami plan moves the date onto the first Pournami day
    if (plan && isPournamiPlan(plan) && monthlyDates.length && !monthlyDates.includes(schedDate)) setSchedDate(monthlyDates[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.id])
  useEffect(() => {   // a festival plan's date stays inside the window it can still fit
    if (fest && plan && schedDate > maxDate) setSchedDate(maxDate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.id, fest?.id])

  // Yearly Thrice: three pooja dates fixed at booking — the first is the Pooja Date, the other two
  // within its year (decision D5); the booking is due only on these days.
  const thrice = /thrice/i.test(plan?.plan_name || '')
  const yearEnd = addDaysISO(schedDate, 364)
  useEffect(() => { setMoreDates(['', '']) }, [plan?.id])
  const datesIssue = (() => {
    if (!thrice) return ''
    if (moreDates.some((d) => !d)) return tr('Pick the 2nd and 3rd pooja dates.')
    if (moreDates.some((d) => d <= schedDate || d > yearEnd)) return tr('The other pooja dates must fall after the first date and within its year.')
    if (moreDates[0] === moreDates[1]) return tr('Pick three different pooja dates.')
    return ''
  })()

  // Fixed timings (Pooja Master): only its own slots, one must be taken
  const fixedSlots = planSlots(plan)
  const hasFixed = fixedSlots.length > 0
  const slotsForDate = hasFixed ? fixedSlots.filter((s) => !slotIsOver(s, schedDate)) : []
  useEffect(() => {
    if (hasFixed && fixedSlots.length === 1) { setSlot(slotsForDate[0] || ''); return }
    if (slot && !slotsForDate.includes(slot)) setSlot('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedDate, plan?.id])
  // Half-hour lists for this time on the chosen date, and the poojari the schedule will assign
  useEffect(() => {
    setBatch('')
    if (!plan || (hasFixed && !slot) || ['Festival', 'Vehicle'].includes(pooja?.category)) { setBatchOpt(null); return undefined }
    let live = true
    BookingsAPI.batchOptions({ day: schedDate, time_slot: slot || undefined, pooja_id: pooja?.id })
      .then((d) => live && setBatchOpt(d)).catch(() => live && setBatchOpt(null))
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.id, schedDate, slot, hasFixed])
  // Only the clock closes a time (client, 2026-11-20 — lists are just printed, no "Print & Send")
  const batchChoices = (batchOpt?.options || []).filter((o) => !o.over)
  const batchShown = batch || batchOpt?.auto || ''

  // Pricing — committee plans need the committee's festival price
  const fee = plan?.committee_decided ? Number(fest?.plan_fees?.[String(plan.id)] || 0) : Number(plan?.fee || 0)
  const pricingAwaited = !!plan && !(fee > 0)

  // ── Booking list (cart) ──
  const lineSeq = useRef(0)
  const [lines, setLines] = useState([])
  const total = lines.reduce((s, l) => s + Number(l.fee || 0), 0)

  // Active-plan check for the pooja being added (renewals that start after the current plan ends are allowed)
  const [dupWarning, setDupWarning] = useState(null)
  // Poojas this devotee already holds a plan for: tagged in the list, red when ticked (2026-11-26)
  const heldPlans = useActivePlans(devotee?.id, devotee?.mobile)
  const heldTags = Object.fromEntries(tiles.map((t) => [t.key, activeTag(heldPlans, t.pooja.id, fmtDate)]).filter(([, v]) => v))
  const flaggedKeys = new Set([...picked.map((x) => x.key).filter((k) => heldTags[k]), ...(dupWarning && curKey ? [curKey] : [])])
  const [dupChecking, setDupChecking] = useState(false)
  const [sameDayWarn, setSameDayWarn] = useState(null)
  useEffect(() => {
    if (!devotee?.id || !pooja?.id || !plan?.id || !schedDate) { setDupWarning(null); setSameDayWarn(null); setDupChecking(false); return undefined }
    let cancelled = false
    setDupChecking(true)
    BookingsAPI.checkDuplicate({ devotee_id: devotee.id, mobile: devotee.mobile, pooja_id: pooja.id, plan_id: plan.id, scheduled_date: schedDate })
      .then((res) => { if (!cancelled) { setDupWarning(res.has_duplicate ? res : null); setSameDayWarn(!res.has_duplicate && res.same_day ? res.same_day : null) } })
      .catch(() => { if (!cancelled) setDupWarning(null) })
      .finally(() => { if (!cancelled) setDupChecking(false) })
    return () => { cancelled = true }
  }, [devotee?.id, devotee?.mobile, pooja?.id, plan?.id, schedDate])

  // The same pooja already in the list on that date, or covered by a multi-day line of it
  const cartClash = (() => {
    if (!pooja || !plan || !schedDate) return ''
    for (const l of lines) {
      if (l.pooja.id !== pooja.id) continue
      if (l.date === schedDate && l.plan.id === plan.id) return tr('This pooja is already in the list for that date.')
      const until = planValidUntil(l.plan, l.date)
      if (planSpan(plan).days === 1 && planSpan(l.plan).days > 1 && l.date <= schedDate && (until === null || schedDate <= until)) {
        return tr('The {plan} plan in this list already covers that date.').replace('{plan}', tr(l.plan.plan_name))
      }
    }
    return ''
  })()

  // Poojari clash: already booked for the same date and slot (allowed — one poojari performs a list; a note only)
  const [poojariClash, setPoojariClash] = useState([])
  useEffect(() => {
    if (!poojariId || !schedDate || !slot) { setPoojariClash([]); return undefined }
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

  // ── What stops "Add to booking" (first problem, shown beside the button) ──
  const addIssue = (() => {
    if (!devotee) return tr('Select or register the devotee.')
    if (!pooja) return tr('Select a pooja.')
    if (festInfo?.past) return tr('The festival window for this pooja is over') + ` (${festInfo.windows}).`
    if (!plan) return tr('Select a plan.')
    if (pricingAwaited) return tr('Awaiting committee decision on pricing.')
    if (!schedDate) return tr('Select the pooja date.')
    if (schedDate < minDate) return tr('The pooja date cannot be before') + ` ${fmtDate(minDate)}.`
    if (maxDate && schedDate > maxDate) return tr('The pooja date cannot be after') + ` ${fmtDate(maxDate)}.`
    if (usePournami && !monthlyDates.includes(schedDate)) return tr('Select a Pournami date for this monthly pooja.')
    if (hasFixed && slotsForDate.length === 0) return tr("Today's time slot for this pooja is over. Choose another date.")
    if (hasFixed && !slot) return tr('Select a time slot.')
    if (datesIssue) return datesIssue
    if (dupChecking) return tr('Checking existing plans, please wait.')
    if (dupWarning) return tr('Booking blocked: An active plan already exists for this devotee and pooja.')
    if (cartClash) return cartClash
    if (lines.length >= 20) return tr('A booking can hold at most 20 poojas.')
    return ''
  })()

  function addLine() {
    if (addIssue) return
    const poojariName = poojariId ? personName(poojaris.find((p) => String(p.id) === String(poojariId)), lang) : ''
    setLines((ls) => [...ls, {
      lineId: ++lineSeq.current, pooja, plan, fee, date: schedDate, slot, festEnd: fest?.end_date || null,
      festLeft: festDaysLeftMsg(plan, schedDate, fest, fmtDate, fest && teTerm(fest.name)),
      batch: (!batchOpt?.fixed && batch) || '', batchShown, poojariId, poojariName,
      vehicleNo: pooja.category === 'Vehicle' ? vehicleNo.trim() : '', sameDay: sameDayWarn,
      performDates: thrice ? [schedDate, ...moreDates].sort() : null,
    }])
    // ready for the next ticked pooja (opened by the effect above); the date is kept
    setPicked((ps) => ps.filter((x) => x.key !== curKey))
    clearForm()
    setError('')
  }
  const removeLine = (id) => setLines((ls) => ls.filter((l) => l.lineId !== id))

  // ── Payment & result ──
  const [method, setMethod] = useState('')          // nothing pre-selected — ask the devotee
  const [utr, setUtr] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)        // { tickets: [...], paidAt, method, utr, total }

  const payIssue = (() => {
    if (!devotee) return tr('Select or register the devotee.')
    // ticked in the dropdown but not added yet: say which button to press (2026-11-20)
    if (!lines.length) return picked.length ? tr('Click "Add to booking" to add the ticked poojas.') : tr('Add at least one pooja to the booking.')
    if (picked.length) return tr('{n} ticked pooja(s) not added yet — add them or untick them.').replace('{n}', picked.length)
    if (!method) return tr('Choose how the devotee paid.')
    if (method === 'UPI/QR Code' && !/^[A-Za-z0-9]{6,40}$/.test(utr.trim())) return tr('Enter the UPI transaction ID (UTR) — 6 to 40 letters and digits.')
    return ''
  })()

  // Leaving with a filled booking asks first (decision D8)
  const dirty = !result && (lines.length > 0 || !!poojaId || picked.length > 0)
  useEffect(() => {
    if (!dirty) return undefined
    const warn = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  const leave = async () => {
    if (dirty && !(await confirmDialog({ title: tr('Leave this booking?'), message: tr('The poojas added here are not booked yet and will be lost.'), confirmLabel: tr('Leave'), tone: 'danger' }))) return
    nav('/admin/bookings')
  }

  function openQuickAdd() {
    const q = devQ.trim()
    const isMobile = /^\d{6,}$/.test(q)
    setQaErr(''); setQaMobileError(''); setQaEmailError('')
    setQuickAdd({ name: isMobile ? '' : q, mobile: isMobile ? q : '', email: '', country_code: '+91' })
  }
  async function saveQuickAdd() {
    setQaErr('')
    if (!quickAdd.name.trim() || !quickAdd.mobile.trim()) { setQaErr(tr('Name and mobile are required.')); return }
    // Mobile and email are both checked, so both show together when both are wrong (client, 2026-11-26)
    let mob = ''
    if ((quickAdd.country_code || '+91') === '+91') {
      if (!/^\d{10}$/.test(quickAdd.mobile.trim())) mob = tr('Please Enter 10 digits Mobile Number')
      else if (!validatePhone(quickAdd.mobile.trim()).valid) mob = tr('Invalid Mobile Number')
    }
    const em = validateEmail(quickAdd.email).error || ''
    setQaMobileError(mob); setQaEmailError(em)
    if (mob || em) { setQaErr(mob && em ? tr('Please fix the errors above.') : (mob || em)); return }
    setQaBusy(true)
    try {
      const d = await DevoteesAPI.create({ name: quickAdd.name.trim(), mobile: quickAdd.mobile.trim(), email: quickAdd.email.trim() || undefined })
      setDevotee(d); setQuickAdd(null); setDevResults(null); setDevQ('')
    } catch (ex) { setQaErr(ex.detail || tr('Could not create devotee.')) } finally { setQaBusy(false) }
  }
  async function search() {
    const q = devQ.trim()
    if (!q) return
    const r = await DevoteesAPI.list({ q, size: 8 }).catch(() => ({ items: [] }))
    searchedQ.current = q
    setDevResults(r.items || [])
  }
  const devKey = (e) => {
    if (devQ.trim() === searchedQ.current && devPick.onKeyDown(e)) return
    if (e.key === 'Enter') search()
  }
  const changeDevotee = async () => {
    if (lines.length && !(await confirmDialog({ title: tr('Change the devotee?'), message: tr('The poojas added for this devotee will be removed from the list.'), confirmLabel: tr('Change') }))) return
    setLines([]); setDevotee(null); setDevQ('')
  }

  async function pay() {
    setError('')
    if (payIssue) { setError(payIssue); return }
    const repeats = lines.filter((l) => l.sameDay)
    if (repeats.length && !(await confirmDialog({ title: tr('Already booked'), confirmLabel: tr('Book again'),
      message: repeats.map((l) => tr(l.sameDay.message)).join('\n') + '\n\n' + tr('Book this pooja again?') }))) return
    setBusy(true)
    try {
      const res = await BookingsAPI.bulkQuickCreate({
        source: 'Advance', atomic: true, payment_method: method,
        txn_ref: method === 'UPI/QR Code' ? utr.trim() : undefined,
        items: lines.map((l) => ({
          devotee_id: devotee.id, devotee_name: devotee.name, mobile: devotee.mobile,
          pooja_id: l.pooja.id, plan_id: l.plan.id, plan_name: l.plan.plan_name, seva_name: l.pooja.name, category: l.pooja.category,
          amount: l.fee, scheduled_date: l.date, time_slot: l.slot || undefined, batch_slot: l.batch || undefined,
          poojari_id: l.poojariId ? Number(l.poojariId) : undefined, vehicle_no: l.vehicleNo || undefined,
          perform_dates: l.performDates || undefined,
          gothram: gothram.trim() || undefined, nakshatram: nakshatram.trim() || undefined, rasi: rasi.trim() || undefined,
          beneficiary_name: beneficiary.trim() || undefined,
          participants: participants.length ? JSON.stringify(participants) : undefined,
          special_notes: specialNotes.trim() || undefined, source: 'Advance',
        })),
      })
      if (!res?.success?.length) {
        const f = res?.failed?.[0]
        const line = f ? lines[f.index] : null
        setError(`${line ? `${teTerm(line.pooja.name)} (${fmtDate(line.date)}): ` : ''}${tr(f?.error || 'Payment failed. Please try again.')} ${tr('Nothing was booked.')}`)
        return
      }
      // Keep the devotee's saved Sankalpam up to date for future bookings
      const updates = {}
      if (gothram.trim() && gothram.trim() !== (devotee.gothram || '')) updates.gothram = gothram.trim()
      if (nakshatram.trim() && nakshatram.trim() !== (devotee.nakshatram || '')) updates.nakshatram = nakshatram.trim()
      if (rasi.trim() && rasi.trim() !== (devotee.rasi || '')) updates.rasi = rasi.trim()
      if (Object.keys(updates).length) DevoteesAPI.update(devotee.id, updates).catch(() => toast(tr('Booking completed, but devotee details could not be saved.'), 'error'))
      setResult({
        tickets: res.success.map((s) => ({ ...s, _line: lines[s.index] })),
        paidAt: stampNow(), method, utr: method === 'UPI/QR Code' ? utr.trim() : '',
        total: res.success.reduce((t, s) => t + Number(s.amount || 0), 0),
      })
    } catch (err) {
      setError(`${tr(err.detail || 'Payment failed. Please try again.')} ${tr('Nothing was booked.')}`)
    } finally { setBusy(false) }
  }

  function startNew() {
    setDevotee(null); setDevQ(''); setDevResults(null); setQuickAdd(null)
    clearForm(); setPicked([]); setSchedDate(addDaysISO(todayIST(), 1))
    setLines([]); setMethod(''); setUtr(''); setResult(null); setError('')
  }

  const modeLabel = (m) => tr(m === 'UPI/QR Code' ? 'Online' : m)
  const poojaName = (p) => (lang === 'te' && p?.name_te ? p.name_te : tr(p?.name || ''))

  // ══ Result: one ticket per pooja ══
  if (result) {
    return (
      <div>
        <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl px-6 py-4 flex flex-wrap items-center gap-4 mb-5 no-print">
          <div className="w-12 h-12 rounded-full bg-emerald-600 text-white grid place-items-center shrink-0"><Check size={26} /></div>
          <div className="flex-1 min-w-[14rem]"><h2 className="font-serif text-xl font-bold text-emerald-700"><T>Booking Successful!</T></h2>
            <p className="text-[0.8125rem] text-gray-600">{personName(devotee, lang)} · {result.tickets.length} {tr(result.tickets.length === 1 ? 'pooja' : 'poojas')} · <b>₹{money2(result.total)}</b> {tr('paid by')} {modeLabel(result.method)}{result.utr ? ` (UTR ${result.utr})` : ''} · {result.paidAt}</p></div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => window.print()} className="btn-outline"><Printer size={15} />{' '}{tr('Print Ticket / Receipt')}</button>
            <button onClick={startNew} className="btn-outline"><Plus size={15} />{' '}<T>New Booking</T></button>
            <button onClick={() => nav('/admin/bookings')} className="btn-maroon"><ArrowLeft size={15} />{' '}<T>Back to Bookings</T></button>
          </div>
        </div>
        <div id="print-tickets" className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {/* Several poojas: ONE ticket — the QR is the Bill No., Verify Ticket lists every pooja (client, 2026-11-26) */}
          {result.tickets.length > 1 && (() => {
            const first = result.tickets[0]
            const cats = result.tickets.map((t) => t._line?.pooja?.category).filter(Boolean)
            return (
              <div className="ticket-page">
                <TicketShell code={first.bill_no || first.booking_code} categories={cats} after={
                  <div className="text-[0.5625rem] text-gray-500 leading-relaxed border-t border-dashed border-amber-200 pt-3 mt-3">
                    <div className="font-semibold text-gray-600 mb-1"><T>Terms & Conditions</T>:</div>
                    <ol className="list-decimal list-inside space-y-0.5 pl-1">
                      {result.tickets.some((t) => t.time_slot) && <li><T>Please arrive 15 minutes before the scheduled pooja time.</T></li>}
                      <li><T>Ticket is valid only for the pooja date or validity period mentioned.</T></li>
                      <li><T>Refunds are subject to temple policy.</T></li>
                      <li><T>Temple is not responsible for lost or damaged tickets.</T></li>
                    </ol>
                  </div>
                }>
                  <TField k={tr('Bill No')} v={first.bill_no || first.receipt_no} mono />
                  <TField k={tr('Poojas')} v={`${result.tickets.length} ${tr('poojas')} · ${tr('one QR for all')}`} />
                  <TField k={tr('Devotee')} v={<>{personName(devotee, lang)}<span className="block text-[0.6875rem] text-gray-500 font-normal">{devotee.mobile}</span></>} />
                  {(first.gothram || first.nakshatram || first.rasi) && <TField k={tr('Sankalpam')} v={[first.gothram, first.nakshatram, first.rasi].filter(Boolean).join(' · ')} />}
                  {first.beneficiary_name && <TField k={tr('In the name of')} v={first.beneficiary_name} />}
                  {participants.length > 0 && <TField k={tr('Participants')} v={participants.map((p) => personName({ name: p.name }, lang)).join(', ')} />}
                  <div className="col-span-2 bg-amber-50/50 rounded-lg p-3 -mx-1">
                    <div className="text-[0.6875rem] text-gray-700 mb-2">{tr('Poojas Booked')}</div>
                    <div className="space-y-2">
                      {result.tickets.map((t, i) => {
                        const l = t._line || {}
                        return (
                          <div key={t.id} className="flex items-start justify-between gap-3 text-[0.8125rem]">
                            <span className="text-gray-800 min-w-0">
                              <span className="font-semibold">{i + 1}. {poojaName(l.pooja) || tr(t.seva_name)}</span>
                              <span className="text-gray-600 text-[0.6875rem] ml-1">· {tr(t.plan_name)}</span>
                              <span className="block text-gray-600 text-[0.6875rem]">
                                {(t.perform_dates || '').includes(',') ? t.perform_dates.split(',').map((d) => fmtDate(d)).join(' · ') : ticketValidity(t)}
                                {t.time_slot ? ` · ${clock12(t.time_slot)}` : ''}{t.batch_slot ? ` · ${halfLabel(t.batch_slot)}` : ''}
                                {` · ${tr('Poojari')}: ${t.poojari_name ? personName({ name: t.poojari_name }, lang) : tr('All poojaris')}`}
                                {t.vehicle_no ? ` · ${t.vehicle_no}` : ''}
                              </span>
                              {festTicketNote(t, fmtDate) && <span className="block text-amber-800 text-[0.6875rem] font-semibold">{festTicketNote(t, fmtDate)}</span>}
                              {t.special_notes && <span className="block text-gray-500 text-[0.6875rem]">{t.special_notes}</span>}
                              <span className="block font-mono text-gray-500 text-[0.625rem]">#{t.ticket_no}</span>
                            </span>
                            <span className="font-semibold text-gray-700 shrink-0">{money2(t.amount)}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  <div className="bg-amber-100/60 rounded-lg px-3 py-2 col-span-2 flex items-center justify-between"><span className="text-[0.6875rem] text-gray-500"><T>Amount Paid (₹)</T></span><span className="font-extrabold text-maroon-800">{money2(result.total)}</span></div>
                  <TField k={tr('Payment Mode')} v={`${modeLabel(result.method)}${result.utr ? ` · UTR ${result.utr}` : ''}`} />
                  <TField k={tr('Payment Date & Time')} v={result.paidAt} />
                </TicketShell>
              </div>
            )
          })()}
          {result.tickets.length === 1 && result.tickets.map((t) => {
            const l = t._line || {}
            return (
              <div key={t.id} className="ticket-page">
                <TicketShell code={t.booking_code} categories={l.pooja?.category} after={
                  <div className="text-[0.5625rem] text-gray-500 leading-relaxed border-t border-dashed border-amber-200 pt-3 mt-3">
                    <div className="font-semibold text-gray-600 mb-1"><T>Terms & Conditions</T>:</div>
                    <ol className="list-decimal list-inside space-y-0.5 pl-1">
                      {t.time_slot && <li><T>Please arrive 15 minutes before the scheduled pooja time.</T></li>}
                      <li><T>Ticket is valid only for the pooja date or validity period mentioned.</T></li>
                      <li><T>Refunds are subject to temple policy.</T></li>
                      <li><T>Temple is not responsible for lost or damaged tickets.</T></li>
                    </ol>
                  </div>
                }>
                  <TField k={tr('Receipt No')} v={t.receipt_no} mono />
                  <TField k={tr('Ticket Number')} v={t.ticket_no} mono />
                  <TField k={tr('Devotee')} v={<>{personName(devotee, lang)}<span className="block text-[0.6875rem] text-gray-500 font-normal">{devotee.mobile}</span></>} />
                  {(t.gothram || t.nakshatram || t.rasi) && <TField k={tr('Sankalpam')} v={[t.gothram, t.nakshatram, t.rasi].filter(Boolean).join(' · ')} />}
                  {t.beneficiary_name && <TField k={tr('In the name of')} v={t.beneficiary_name} />}
                  {participants.length > 0 && <TField k={tr('Participants')} v={participants.map((p) => personName({ name: p.name }, lang)).join(', ')} />}
                  <TField k={tr('Pooja')} v={poojaName(l.pooja) || tr(t.seva_name)} />
                  <TField k={tr('Plan')} v={tr(t.plan_name)} />
                  {(t.perform_dates || '').includes(',')
                    ? <TField k={tr('Pooja dates')} v={t.perform_dates.split(',').map((d) => fmtDate(d)).join(' · ')} />
                    : <TField k={tr('Pooja Date')} v={fmtDate(t.scheduled_date)} />}
                  {t.time_slot && <TField k={tr('Time Slot')} v={clock12(t.time_slot)} />}
                  {t.batch_slot && <TField k={tr('Pooja slot')} v={halfLabel(t.batch_slot)} />}
                  <TField k={tr('Poojari')} v={t.poojari_name ? personName({ name: t.poojari_name }, lang) : tr('All poojaris')} />
                  {t.vehicle_no && <TField k={tr('Vehicle No')} v={t.vehicle_no} />}
                  <TField k={tr('Validity')} v={ticketValidity(t)} />
                  {festTicketNote(t, fmtDate) && <TField k={tr('Festival plan')} v={festTicketNote(t, fmtDate)} />}
                  {t.special_notes && <TField k={tr('Special Notes')} v={t.special_notes} />}
                  <div className="bg-amber-100/60 rounded-lg px-3 py-2 col-span-2 flex items-center justify-between"><span className="text-[0.6875rem] text-gray-500"><T>Amount Paid (₹)</T></span><span className="font-extrabold text-maroon-800">{money2(t.amount)}</span></div>
                  <TField k={tr('Payment Mode')} v={modeLabel(result.method)} />
                  <TField k={tr('Payment Date & Time')} v={result.paidAt} />
                </TicketShell>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ══ Booking form + list ══
  return (
    <div>
      <div className="text-[0.75rem] text-gray-400 mb-1"><Link to="/admin/bookings" className="hover:text-maroon-600"><T>Pooja Management</T></Link> › <Link to="/admin/bookings" className="hover:text-maroon-600"><T>Bookings</T></Link> › <span className="text-gray-500"><T>Advance Pooja Booking</T></span></div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <h1 className="font-serif text-2xl font-bold text-maroon-700"><T>Advance Pooja Booking</T></h1>
          <p className="text-[0.78125rem] text-gray-500 mt-0.5"><T>Book poojas for chosen dates — add several to one booking and pay once. For today's walk-ins use Counter Billing.</T></p>
        </div>
        <button onClick={leave} className="btn-outline !py-2.5"><ArrowLeft size={15} />{' '}<T>Back to Bookings</T></button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_24rem] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          {/* 1. Devotee */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 sm:p-5">
            <div className="flex items-center gap-2 text-maroon-700 mb-4"><User size={18} aria-hidden="true" /><h3 className="font-serif text-base sm:text-lg font-bold">{tr('1. Devotee')}</h3></div>
            {devotee ? (
              <div className="flex items-center gap-3 border border-emerald-200 rounded-xl px-3.5 py-3 bg-emerald-50/40">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 grid place-items-center shrink-0"><Check size={18} /></div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-gray-800">{personName(devotee, lang)}</div>
                  <div className="text-[0.75rem] text-gray-500">{devotee.mobile}{devotee.code ? ` · ${devotee.code}` : ''}</div>
                </div>
                <button type="button" onClick={changeDevotee} className="text-[0.75rem] font-semibold text-maroon-700 hover:underline"><T>Change</T></button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-4 items-start">
                <div>
                  <div className="flex flex-wrap gap-3 sm:gap-5 mb-2" role="group" aria-label={tr('Search method')}>
                    {['Mobile Number', 'Devotee Name'].map((o) => (
                      <label key={o} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"><input type="radio" name="sby" className="accent-maroon-700" checked={searchBy === o} onChange={() => { setSearchBy(o); setDevQ(''); setDevResults(null) }} /> {tr(o)}</label>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    {searchBy === 'Mobile Number' ? (
                      <div className="flex flex-1 min-w-0">
                        <CountryCodeSelect value={searchCountryCode} onChange={(e) => setSearchCountryCode(e.target.value)} />
                        <input className="input flex-1 min-w-0 !rounded-l-none" placeholder={tr('Enter Mobile Number')} aria-label={tr('Mobile number')} value={devQ} maxLength={getCountryDigits(searchCountryCode)} onChange={(e) => setDevQ(e.target.value.replace(/\D/g, ''))} onKeyDown={devKey} />
                      </div>
                    ) : (
                      <input className="input flex-1 min-w-0" placeholder={tr('Enter Devotee Name')} aria-label={tr('Devotee name')} value={devQ} onChange={(e) => setDevQ(sanitizeName(e.target.value))} onKeyDown={devKey} />
                    )}
                    <button type="button" onClick={search} className="btn-maroon !px-3.5" aria-label={tr('Search devotee')}><Search size={15} aria-hidden="true" /></button>
                  </div>
                </div>
                <div>
                  {devResults === null ? (
                    <div className="border border-dashed border-gray-200 rounded-xl px-3.5 py-3 text-[0.8125rem] text-gray-400 flex flex-wrap items-center justify-between gap-2">
                      <span><T>Search and select a devotee.</T></span>
                      <button type="button" onClick={openQuickAdd} className="inline-flex items-center gap-1.5 text-[0.78125rem] font-semibold text-maroon-700 hover:underline"><UserPlus size={14} /> <T>Register New Devotee</T></button>
                    </div>
                  ) : (
                    <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-44 overflow-y-auto">
                      {devResults.map((d, i) => (
                        <button key={d.id} type="button" onClick={() => setDevotee(d)} {...devPick.rowProps(i)} className={`pick-row ${devPick.rowClass(i)} w-full flex items-center gap-3 px-3 py-2.5 text-left`}>
                          <div className="pick-avatar w-8 h-8 rounded-full bg-amber-50 text-amber-700 grid place-items-center text-[0.75rem] font-bold transition-colors">{d.name[0]}</div>
                          <div className="flex-1 min-w-0"><div className="pick-name font-semibold text-gray-800 text-[0.8125rem]">{personName(d, lang)}</div><div className="text-[0.6875rem] text-gray-400">{d.code} · {d.mobile}</div></div>
                        </button>
                      ))}
                      <div className="px-3 py-2.5 text-center">
                        {devResults.length === 0 && <div className="text-[0.8125rem] text-blue-700 mb-1.5"><T>New devotee</T> — {devQ}</div>}
                        <button type="button" onClick={openQuickAdd} className="inline-flex items-center gap-1.5 text-[0.78125rem] font-semibold text-maroon-700 border border-maroon-200 rounded-lg px-3 py-1.5 hover:bg-maroon-50"><UserPlus size={14} /> <T>Register New Devotee</T></button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {quickAdd && !devotee && (
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
                      <input className={`input flex-1 min-w-0 !rounded-l-none ${qaMobileError ? 'border-red-400' : ''}`} aria-label={tr('Mobile number')} placeholder={tr('Enter Mobile Number')} value={quickAdd.mobile} maxLength={getCountryDigits(quickAdd.country_code || '+91')} onChange={(e) => {
                        const cleaned = sanitizePhone(e.target.value)
                        setQuickAdd((q) => ({ ...q, mobile: cleaned }))
                        if ((quickAdd.country_code || '+91') !== '+91') { setQaMobileError(''); return }
                        if (cleaned.length === 10) setQaMobileError(validatePhone(cleaned).valid ? '' : tr('Invalid Mobile Number'))
                        else setQaMobileError(cleaned.length ? tr('Please Enter 10 digits Mobile Number') : '')
                      }} />
                    </div>
                    {qaMobileError && <p className="text-[0.6875rem] text-red-600 mt-1 font-medium">{qaMobileError}</p>}
                  </div>
                  <div><label className="label"><T>Email (optional)</T></label><input type="text" inputMode="email" autoComplete="email" className={`input ${qaEmailError ? 'border-red-400' : ''}`} aria-label={tr('Email')} placeholder={tr('email@example.com')} value={quickAdd.email}
                    onChange={(e) => { const v = e.target.value; setQuickAdd((q) => ({ ...q, email: v })); if (qaEmailError) setQaEmailError(validateEmail(v).error || '') }}
                    onBlur={(e) => setQaEmailError(validateEmail(e.target.value).error || '')} />
                    {qaEmailError && <p className="text-[0.6875rem] text-red-600 mt-1 font-medium">{qaEmailError}</p>}</div>
                </div>
                {qaErr && <div className="text-[0.75rem] text-red-600 mt-2" role="alert">{qaErr}</div>}
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <button type="button" onClick={saveQuickAdd} disabled={qaBusy} className="btn-maroon !py-2 disabled:opacity-60"><Check size={15} aria-hidden="true" /> {qaBusy ? tr('Saving…') : tr('Add & Select')}</button>
                  <button type="button" onClick={() => setQuickAdd(null)} className="btn-outline !py-2"><T>Cancel</T></button>
                  <span className="text-[0.65rem] sm:text-[0.71875rem] text-gray-400 ml-1"><T>One devotee per mobile number. You can complete the full profile later from Devotee Management.</T></span>
                </div>
              </div>
            )}

            {devotee && (
              <div className="mt-4 border-t border-gray-100 pt-4">
                <div className="flex items-center gap-2 text-gray-700 mb-3"><FileText size={15} className="text-amber-600" /><span className="text-[0.8125rem] font-semibold"><T>Sankalpam Details</T></span><span className="text-[0.6875rem] text-gray-400">(<T>Optional</T> · <T>for every pooja in this booking</T>)</span></div>
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

          {/* 2. Add a pooja */}
          <div className={`bg-white rounded-xl border border-gray-100 shadow-sm p-4 sm:p-5 ${devotee ? '' : 'opacity-60'}`}>
            <div className="flex flex-wrap items-center gap-2 text-maroon-700 mb-4"><Flame size={18} /><h3 className="font-serif text-base sm:text-lg font-bold">{tr(lines.length ? '2. Add another pooja' : '2. Add a pooja')}</h3>
              {!devotee && <span className="text-[0.75rem] text-gray-500 font-normal">— <T>select the devotee first</T></span>}</div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="min-w-0">
                <label className="label"><T>Pooja *</T></label>
                <MultiSelect value={picked.map((x) => x.key)} onChange={(e) => setPickedKeys(e.target.value)} disabled={!devotee}
                  selectAll={false} placeholder={tr('Select one or more poojas…')}
                  chips flagged={flaggedKeys} doneButton className="!h-auto min-h-[2.625rem]">
                  {POOJA_CATS.map((c) => {
                    const group = tiles.filter((t) => t.pooja.category === c)
                    return group.length > 0 && <optgroup key={c} label={tr(c)}>{group.map((t) => <option key={t.key} value={t.key}>{optionLabel(t)}</option>)}</optgroup>
                  })}
                </MultiSelect>
                {/* No tags in the list itself (client, 2026-11-26): a pooja the devotee already holds a plan for is
                    flagged only once ticked — red chip above, its name and plan here */}
                {picked.filter((x) => heldTags[x.key]).map((x) => (
                  <div key={x.key} className="mt-1 text-[0.75rem] font-semibold text-red-700 flex items-start gap-1">
                    <AlertTriangle size={13} className="shrink-0 mt-0.5" />{poojaName(x.pooja)}: {heldTags[x.key]}
                  </div>
                ))}
                {picked.length > 1 && pooja && (
                  <div className="text-[0.75rem] text-gray-500 mt-1">{tr('Now adding')}: <b className="text-maroon-800">{poojaName(pooja)}</b> · {picked.length - 1} {tr('more waiting')}</div>
                )}
                {festInfo?.past && <div className="mt-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-[0.78125rem] text-red-700 flex items-start gap-2"><AlertTriangle size={15} className="shrink-0 mt-0.5" /> <span><T>The festival window for this pooja is over</T> ({festInfo.windows}).</span></div>}
                {fest && <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-[0.78125rem] text-amber-800 flex items-start gap-2"><CalendarDays size={15} className="shrink-0 mt-0.5" /> <span>{teTerm(fest.name)}: {fmtDate(fest.start_date)} – {fmtDate(fest.end_date)}. <T>A plan booked during the festival is valid until its last day.</T></span></div>}
                {usePournami && <div className="mt-2 bg-blue-50/60 border border-blue-100 rounded-lg px-3 py-2 text-[0.78125rem] text-blue-800 flex items-start gap-2"><Moon size={15} className="shrink-0 mt-0.5" /> <T>Monthly poojas are booked on Pournami dates.</T></div>}
                {pooja && (
                  <div className="mt-3">
                    <label className="label"><T>Plan *</T></label>
                    <div className="border border-gray-100 rounded-xl divide-y divide-gray-100" role="radiogroup" aria-label={tr('Plan')}>
                      {(pooja.plans || []).map((pl) => {
                        const on = plan?.id === pl.id
                        const committeePrice = pl.committee_decided ? Number(fest?.plan_fees?.[String(pl.id)] || 0) : 0
                        return (
                          <button key={pl.id} type="button" role="radio" aria-checked={on} onClick={() => setPlan(pl)}
                            className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left ${on ? 'bg-maroon-50/50' : 'hover:bg-gray-50'}`}>
                            <span className={`w-4 h-4 rounded-full border-2 grid place-items-center shrink-0 ${on ? 'border-maroon-600' : 'border-gray-300'}`}>{on && <span className="w-2 h-2 rounded-full bg-maroon-600" />}</span>
                            <span className="flex-1 font-semibold text-gray-800 text-[0.875rem]">{tr(pl.plan_name)}<span className="ml-2 text-[0.75rem] font-normal text-gray-500">{spanLabel(pl)}</span></span>
                            <span className="font-semibold text-gray-800 text-[0.875rem] tabular-nums">{pl.committee_decided ? (committeePrice > 0 ? `₹${money2(committeePrice)}` : <span className="text-[0.75rem] text-amber-700 font-medium"><T>Awaiting committee</T></span>) : `₹${money2(pl.fee)}`}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
                {dupWarning && (
                  <div className="mt-3 rounded-xl px-3.5 py-3 flex items-start gap-2.5 bg-red-50 border-2 border-red-300">
                    <AlertTriangle size={18} className="text-red-700 shrink-0 mt-0.5" />
                    <div className="text-[0.8125rem] text-red-700"><b><T>Active Plan Exists - Booking Blocked</T></b><div>{tr(dupWarning.message)}</div>
                      <div className="font-semibold mt-0.5">{tr('Untick {pooja} or choose another plan.').replace('{pooja}', poojaName(pooja))}</div>
                      {dupWarning.valid_until && <div className="text-[0.75rem] text-gray-600 mt-0.5"><T>Valid until</T>: {fmtDate(dupWarning.valid_until)} — <T>a renewal can start the next day.</T></div>}</div>
                  </div>
                )}
                {!dupWarning && sameDayWarn && (
                  <div className="mt-3 rounded-xl px-3.5 py-2.5 flex items-start gap-2.5 bg-amber-50 border border-amber-300 text-[0.8125rem] text-amber-800"><AlertTriangle size={16} className="shrink-0 mt-0.5" /><span><b><T>Already booked</T>:</b> {tr(sameDayWarn.message)} <T>You will be asked to confirm.</T></span></div>
                )}
              </div>

              <div className="min-w-0 space-y-4">
                <div>
                  <label className="label"><T>Pooja Date *</T></label>
                  {usePournami ? (
                    pournamiChoices.length === 0 ? (
                      <div className="text-[0.8125rem] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-1"><T>Pournami dates could not be loaded. Refresh the page.</T></div>
                    ) : (<>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {pournamiChoices.slice(0, 8).map((d) => (
                          <button key={d.event_date} type="button" onClick={() => setSchedDate(d.event_date)}
                            title={`${lang === 'te' && d.name_te ? d.name_te : tr(d.name)}${d.provisional ? ` · ${tr('Provisional — awaiting confirmation against TTD')}` : ''}`}
                            className={`px-2.5 py-1.5 rounded-lg text-[0.75rem] font-medium border ${d.provisional ? 'border-dashed' : ''} ${schedDate === d.event_date ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50'}`}>{fmtDate(d.event_date)}{d.provisional ? ' *' : ''}</button>
                        ))}
                      </div>
                      {pournamiChoices.slice(0, 8).some((d) => d.provisional) && <div className="text-[0.6875rem] text-gray-500 mt-1">* <T>Provisional — awaiting confirmation against TTD</T></div>}
                    </>)
                  ) : (
                    <DateField value={schedDate} min={minDate} max={maxDate} onChange={(e) => setSchedDate(e.target.value)} disabled={!devotee} />
                  )}
                  {usePournami && pournamiExpired && (
                    <div className="mt-1.5 text-[0.75rem] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-1.5" role="status"><AlertTriangle size={14} className="shrink-0 mt-0.5" /><span>{closedSlotMsg(pooja?.name, tithiSlots, pournamiChoices[0] ? fmtDate(pournamiChoices[0].event_date) : '')}</span></div>
                  )}
                  <div className="text-[0.75rem] text-gray-400 mt-1">{usePournami ? <T>Only Pournami days can be booked for this pooja.</T> : <>{tr('Bookings are open up to')} {fmtDate(limitDate)}.</>}</div>
                  {plan && <div className="text-[0.75rem] text-emerald-700 mt-0.5"><T>Validity</T>: {validityPreview(plan, schedDate, fest?.end_date)}</div>}
                  {festDaysLeftMsg(plan, schedDate, fest, fmtDate, fest && teTerm(fest.name)) && <div className="mt-1 bg-amber-50 border border-amber-300 rounded-lg px-3 py-1.5 text-[0.75rem] font-semibold text-amber-800 flex items-start gap-1.5"><AlertTriangle size={13} className="shrink-0 mt-0.5" />{festDaysLeftMsg(plan, schedDate, fest, fmtDate, teTerm(fest.name))}</div>}
                </div>

                {thrice && (
                  <div>
                    <label className="label"><T>2nd and 3rd pooja dates *</T></label>
                    <div className="grid grid-cols-2 gap-2">
                      {[0, 1].map((i) => (
                        <DateField key={i} value={moreDates[i]} min={addDaysISO(schedDate, 1)} max={yearEnd} placeholder={tr(i ? '3rd date' : '2nd date')}
                          onChange={(e) => setMoreDates((m) => m.map((x, j) => (j === i ? e.target.value : x)))} />))}
                    </div>
                    <div className="text-[0.75rem] text-gray-500 mt-1"><T>The pooja is performed only on these three days — the first is the Pooja Date.</T></div>
                  </div>
                )}

                {plan && hasFixed && (
                  <div><FixedSlotPicker slots={fixedSlots} date={schedDate} value={slot} onChange={setSlot}
                    vehicle={pooja?.category === 'Vehicle'} onTomorrow={() => setSchedDate(addDaysISO(today, 1))} /></div>
                )}

                {batchOpt && (
                  <div>
                    <label className="label"><T>Pooja slot (half-hour)</T></label>
                    {batchOpt.error
                      ? <div className="text-[0.8125rem] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{tr(batchOpt.error)}</div>
                      : batchOpt.fixed || batchChoices.length <= 1
                        ? <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-[0.875rem] font-semibold text-maroon-800"><Clock size={15} className="text-maroon-700" />{halfLabel(batchShown)}</div>
                        : <HalfChips options={batchChoices} value={batchShown} onChange={setBatch} />}
                    <div className="text-[0.75rem] text-gray-400 mt-1">{batchOpt.fixed ? tr('Fixed-time pooja: on its own half-hour list.') : tr('The poojari gets the list of this half-hour.')}</div>
                  </div>
                )}

                {plan && (
                  <div>
                    <label className="label"><T>Poojari</T> <span className="text-gray-400 font-normal">(<T>Optional</T>)</span></label>
                    <Select value={poojariId} onChange={(e) => setPoojariId(e.target.value)}>
                      <option value="">{tr('All poojaris')}</option>
                      {poojaris.map((p) => <option key={p.id} value={p.id}>{personName(p, lang)}{p.specialization ? ` · ${tr(p.specialization)}` : ''}</option>)}</Select>
                    {poojariClash.length > 0
                      ? <div className="text-[0.75rem] text-amber-700 mt-1 flex items-start gap-1"><AlertTriangle size={13} className="shrink-0 mt-0.5" /> <span><T>This poojari already has a booking in this slot</T>: {poojariClash.map((b) => b.booking_code).join(', ')}</span></div>
                      : <div className="text-[0.75rem] text-gray-400 mt-1">{poojariId ? tr('Only this poojari gets this booking.') : tr('Goes to all poojaris — choose one only for a special pooja.')}</div>}
                  </div>
                )}

                {pooja?.category === 'Vehicle' && (
                  <div>
                    <label className="label"><T>Vehicle No</T> <span className="text-gray-400 font-normal">(<T>Optional</T>)</span></label>
                    <input className="input" value={vehicleNo} maxLength={12} onChange={(e) => setVehicleNo(sanitizeVehicle(e.target.value))} placeholder={tr('e.g. TS 09 AB 1234')} />
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-gray-100 flex flex-wrap items-center justify-end gap-3">
              {addIssue && devotee && <span className="text-[0.78125rem] text-amber-700 text-right">{dupChecking && <Loader2 size={13} className="inline animate-spin mr-1" />}{addIssue}</span>}
              {plan && !pricingAwaited && <span className="text-[0.875rem] font-bold text-maroon-800 tabular-nums">₹{money2(fee)}</span>}
              <button type="button" onClick={addLine} disabled={!!addIssue} className={`btn-maroon disabled:opacity-40 ${picked.length && !addIssue ? 'ring-2 ring-amber-400 ring-offset-2' : ''}`}><Plus size={15} />{' '}{picked.length > 1 ? tr('Add to booking & next') : tr('Add to booking')}</button>
            </div>
          </div>
        </div>

        {/* 3. The booking list + payment (stays in view on a wide screen) */}
        <div className="xl:sticky xl:top-[5.25rem] bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-maroon-800 text-cream flex items-center gap-2">
            <ShoppingBag size={17} /><h3 className="font-serif text-[1.0625rem] font-bold flex-1">{tr('3. This booking')}</h3>
            <span className="text-[0.8125rem] text-cream/80">{lines.length} {tr(lines.length === 1 ? 'pooja' : 'poojas')}</span>
          </div>
          <div className="divide-y divide-gray-100 max-h-[22rem] overflow-y-auto">
            {lines.length === 0 && <div className="px-4 py-8 text-center text-[0.8125rem] text-gray-400"><T>Poojas you add appear here. Add as many as the devotee wants, for any dates.</T></div>}
            {lines.map((l) => (
              <div key={l.lineId} className="px-4 py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0 text-[0.8125rem]">
                  <div className="font-semibold text-gray-800">{poojaName(l.pooja)} <span className="text-[0.75rem] font-normal text-gray-500">· {tr(l.plan.plan_name)}</span></div>
                  <div className="text-gray-600 flex items-center gap-1"><Calendar size={12} className="text-gray-400" />{fmtDate(l.date)}{l.slot ? ` · ${isTempleHours(l.slot) ? tr('Temple hours') : clock12(l.slot)}` : ''}</div>
                  {l.batchShown && <div className="text-[0.75rem] text-gray-500"><T>Pooja slot</T>: {halfLabel(l.batchShown)}</div>}
                  <div className="text-[0.75rem] text-gray-500"><T>Poojari</T>: {l.poojariName || tr('All poojaris')}</div>
                  {l.vehicleNo && <div className="text-[0.75rem] text-gray-500 flex items-center gap-1"><Car size={12} />{l.vehicleNo}</div>}
                  {l.performDates
                    ? <div className="text-[0.75rem] text-emerald-700"><T>Pooja dates</T>: {l.performDates.map((d) => fmtDate(d)).join(' · ')}</div>
                    : planSpan(l.plan).days !== 1 && <div className="text-[0.75rem] text-emerald-700"><T>Validity</T>: {validityPreview(l.plan, l.date, l.festEnd)}</div>}
                  {l.festLeft && <div className="text-[0.75rem] font-semibold text-amber-700 flex items-start gap-1"><AlertTriangle size={12} className="shrink-0 mt-0.5" />{l.festLeft}</div>}
                  {l.sameDay && <div className="text-[0.75rem] text-amber-700 flex items-center gap-1"><AlertTriangle size={12} /><T>Already booked that day — you will be asked to confirm.</T></div>}
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-gray-800 tabular-nums text-[0.875rem]">₹{money2(l.fee)}</div>
                  <button type="button" onClick={() => removeLine(l.lineId)} aria-label={`${tr('Remove')} ${poojaName(l.pooja)}`} title={tr('Remove')} className="mt-1 text-gray-400 hover:text-red-600"><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
          </div>

          <div className="px-4 py-3 border-t border-gray-200 bg-gray-50/60">
            <div className="flex items-center justify-between"><span className="font-bold text-maroon-800"><T>Total Amount (₹)</T></span><span className="text-xl font-extrabold text-maroon-800 tabular-nums">{money2(total)}</span></div>
          </div>

          <div className="px-4 py-3 border-t border-gray-100">
            <label className="label"><T>How did the devotee pay? *</T></label>
            <div className="grid grid-cols-2 gap-2 mt-1" role="radiogroup" aria-label={tr('Payment mode')}>
              {['Cash', 'UPI/QR Code'].map((m) => { const on = method === m; return (
                <button type="button" key={m} role="radio" aria-checked={on} onClick={() => { setMethod(m); setError('') }} className={`flex items-center gap-2 border rounded-lg px-3 py-2.5 ${on ? 'border-maroon-400 bg-maroon-50/40 ring-1 ring-maroon-200' : 'border-gray-200 hover:border-maroon-300'}`}>
                  <span className={`w-4 h-4 rounded-full border-2 grid place-items-center shrink-0 ${on ? 'border-maroon-600' : 'border-gray-300'}`}>{on && <span className="w-2 h-2 rounded-full bg-maroon-600" />}</span>
                  {m === 'Cash' ? <IndianRupee size={15} className="text-emerald-600" /> : <Ticket size={15} className="text-blue-600" />}
                  <span className="text-[0.8125rem] font-semibold text-gray-700">{modeLabel(m)}</span>
                </button>
              ) })}
            </div>
            {method === 'UPI/QR Code' && (
              <div className="mt-3 space-y-2">
                {total > 0 && <PaymentQr amount={total} size={140} />}
                <div>
                  <label className="label"><T>UTR / Transaction ID *</T></label>
                  <input className="input" placeholder={tr('Enter UTR / Transaction ID')} value={utr} maxLength={40} onChange={(e) => setUtr(e.target.value.replace(/[^A-Za-z0-9]/g, ''))} />
                  <div className="text-[0.6875rem] text-gray-400 mt-1"><T>One online payment can be used for one booking only.</T></div>
                </div>
              </div>
            )}
          </div>

          <div className="px-4 py-3 border-t border-gray-100 space-y-2">
            {error && <div className="bg-red-50 border border-red-200 text-red-700 text-[0.8125rem] rounded-lg px-3 py-2" role="alert">{error}</div>}
            {!error && payIssue && (lines.length > 0 || picked.length > 0) && <div className="text-[0.75rem] text-amber-700">{payIssue}</div>}
            <button onClick={pay} disabled={busy || !!payIssue} className="btn-maroon w-full justify-center !py-3 disabled:opacity-50">
              {busy ? <><Loader2 size={15} className="animate-spin" /> {tr('Processing…')}</> : <><CreditCard size={15} /> {tr('Confirm & Pay')} ₹{money2(total)}</>}</button>
            <div className="flex items-center gap-2">
              {/* Reset (client, 2026-11-20): Start over — clears the whole booking on screen (no API call) */}
              <ResetButton label={tr('Start over')} disabled={busy} dirty={dirty || !!devotee} className="justify-center shrink-0 !py-1.5 text-[0.8125rem]"
                onReset={() => { startNew(); setGothram(''); setNakshatram(''); setRasi(''); setBeneficiary(''); setParticipants([]); setSpecialNotes('') }} />
              <button onClick={leave} className="flex-1 text-[0.8125rem] text-gray-500 hover:text-maroon-700 py-1"><T>Cancel</T></button>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 text-[0.8125rem] text-gray-500 bg-blue-50/60 border border-blue-100 rounded-lg px-4 py-2.5">
        <ShieldCheck size={15} className="text-blue-500" />{' '}<T>All bookings are subject to temple rules and availability.</T>
      </div>
    </div>
  )
}

// Half-hour lists still open for this time on that date — chips grouped Morning / Afternoon / Evening
// (the same look as Counter Billing); the earliest is the default.
function HalfChips({ options, value, onChange }) {
  const groups = PERIODS.map((g) => [g, options.filter((o) => halfPeriod(o.start) === g)]).filter(([, l]) => l.length)
  return (
    <div className="space-y-1" role="radiogroup" aria-label={tr('Pooja slot (half-hour)')}>
      {groups.map(([g, list]) => (
        <div key={g} className="flex items-start gap-1.5">
          <span className="text-[0.6875rem] font-semibold text-gray-500 w-16 pt-1 shrink-0">{tr(g)}</span>
          <div className="flex flex-wrap gap-1">
            {list.map((o) => {
              const on = o.start === value
              return <button key={o.start} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.start)}
                className={`px-2 py-1 rounded-md text-[0.75rem] font-semibold border tabular-nums ${on ? 'bg-maroon-700 text-cream border-maroon-700' : 'bg-white text-maroon-700 border-maroon-200 hover:bg-maroon-50'}`}>{halfRange(o.start)}</button>
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// Time slot of a plan with fixed timings: one slot is shown locked, several are
// chips grouped Morning / Evening (today's passed ones greyed out).
function FixedSlotPicker({ slots, date, value, onChange, vehicle, onTomorrow }) {
  const open = slots.filter((s) => !slotIsOver(s, date))
  const nextFree = open[0]
  const label = (s) => (isTempleHours(s) ? `${tr('Temple hours')} ${clock12(s)}` : clock12(s))
  if (open.length === 0) {
    return (<>
      <label className="label"><T>Time Slot</T> *</label>
      <div className="text-[0.8125rem] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-1.5">
        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
        <span>{tr("Today's time slot for this pooja is over")} ({slots.map(clock12).join(', ')}). <T>Please choose another date.</T></span>
      </div>
      <button type="button" onClick={onTomorrow} className="mt-2 text-[0.75rem] font-semibold rounded-lg px-3 py-1.5 border border-maroon-200 text-maroon-700 hover:bg-maroon-50"><T>Book for Tomorrow</T></button>
    </>)
  }
  if (slots.length === 1) {
    return (<>
      <label className="label"><T>Time Slot</T></label>
      <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-[0.875rem] font-semibold text-amber-900">
        <Clock size={15} className="text-amber-600" />{label(slots[0])}<span className="ml-auto text-[0.6875rem] font-medium text-amber-700">{isRange(slots[0]) ? tr('Time window') : tr('Fixed')}</span>
      </div>
      <div className={`text-[0.75rem] mt-1 flex items-start gap-1 ${vehicle ? 'text-amber-700' : 'text-gray-500'}`}>
        {vehicle ? <><AlertTriangle size={13} className="shrink-0 mt-0.5" />{tr('Subject to poojari availability.')}</> : isTempleHours(slots[0]) ? tr('Valid during temple hours.') : tr('Pooja timings are fixed and cannot be changed.')}
      </div>
    </>)
  }
  const groups = ['Morning', 'Evening'].map((g) => [g, slots.filter((s) => slotPeriod(s) === g)]).filter(([, l]) => l.length)
  return (<>
    <label className="label"><T>Time Slot</T> *</label>
    <div className="space-y-1.5">
      {groups.map(([g, list]) => (
        <div key={g} className="flex items-start gap-1.5">
          <span className="text-[0.6875rem] font-semibold text-gray-500 w-16 pt-1.5 shrink-0">{tr(g)}</span>
          <div className="flex flex-wrap gap-1.5">
            {list.map((s) => {
              const over = slotIsOver(s, date), on = value === s, hint = !value && s === nextFree
              return <button key={s} type="button" disabled={over} onClick={() => onChange(s)} aria-pressed={on}
                title={over ? tr("Today's time slot for this pooja is over") : hint ? tr('Next available') : undefined}
                className={`px-2.5 py-1.5 rounded-lg text-[0.75rem] font-medium border ${on ? 'bg-maroon-700 text-cream border-maroon-700' : over ? 'bg-gray-50 text-gray-300 border-gray-100 line-through cursor-not-allowed' : hint ? 'bg-amber-50 text-maroon-800 border-amber-400 ring-1 ring-amber-300 hover:bg-amber-100' : 'bg-white text-maroon-700 border-maroon-200 hover:bg-maroon-50'}`}>{clock12(s)}{hint && <span className="ml-1 text-[0.5625rem] font-bold uppercase text-amber-700">{tr('Next')}</span>}</button>
            })}
          </div>
        </div>
      ))}
    </div>
    <div className="text-[0.75rem] text-gray-500 mt-1"><T>Pooja timings are fixed and cannot be changed.</T></div>
  </>)
}

function TField({ k, v, mono }) {
  return <div><div className="text-[0.6875rem] text-gray-500">{k}</div><div className={`text-[0.8125rem] text-gray-800 font-semibold ${mono ? 'font-mono' : ''}`}>{v}</div></div>
}
