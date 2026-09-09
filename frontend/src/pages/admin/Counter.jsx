import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Printer, Plus, Trash2, Receipt as ReceiptIcon, Search, User, X, IndianRupee, Loader2, Eye, AlertTriangle,
  ArrowRight, ArrowLeft, Check, Flame, CalendarDays, Moon, Car, Info, ShieldCheck, FileText, Edit3,
} from 'lucide-react'
import { PageHeader } from '../../components/common/UI.jsx'
import { TicketShell, TF } from '../../components/admin/BookingTicket.jsx'
import { Select, DateField, Combobox, CountryCodeSelect, getCountryDigits } from '../../components/common/Field.jsx'
import { PoojasAPI, DevoteesAPI, BookingsAPI, PaymentsAPI, FestivalsAPI, PoojarisAPI, TithiAPI } from '../../api/client.js'
import { promptDialog } from '../../components/common/Dialog.jsx'
import { T, tr, useLang, personName, stamp, clock12 } from '../../i18n/LanguageContext.jsx'
import { sanitizePhone, sanitizeName } from '../../lib/validation.js'

const CATS = ['All', 'Daily', 'Monthly', 'Long-Term', 'Occasion', 'Festival', 'Vehicle']
const SLOTS = [
  '06:00 AM - 07:00 AM', '07:30 AM - 08:30 AM', '09:00 AM - 10:00 AM',
  '10:30 AM - 11:30 AM', '12:00 PM - 01:00 PM', '04:00 PM - 05:00 PM',
]

// Complete list of Hindu Gotras (52 Gotras from across India)
const GOTHRAMS = [
  'Agastya', 'Alambayana', 'Angirasa', 'Atri', 'Babhravya', 'Bharadwaja', 'Bhargava',
  'Bhrigu', 'Daksha', 'Dhananjaya', 'Garga', 'Gautama', 'Harita', 'Jamadagni',
  'Jamadagnya', 'Kanva', 'Kapi', 'Kapisthala', 'Kashyapa', 'Katyayana', 'Kaundinya',
  'Kaushika', 'Kousika', 'Kratu', 'Kutsa', 'Lohita', 'Mandavya', 'Marichi', 'Matanga',
  'Moudgalya', 'Mudgala', 'Nidruva', 'Parashara', 'Pulaha', 'Pulastya', 'Rouhitya',
  'Salihotra', 'Sandilya', 'Sankritya', 'Saunaka', 'Savarni', 'Shandilya', 'Srivatsa',
  'Upamanyu', 'Vadula', 'Vashishtha', 'Vatsa', 'Vatsya', 'Vishnu', 'Vishnuvriddha',
  'Vishwamitra', 'Yaska',
]

// 27 Nakshatras (Lunar Mansions) in order
const NAKSHATRAMS = [
  'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu',
  'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni', 'Hasta',
  'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha', 'Moola', 'Purva Ashadha',
  'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha', 'Purva Bhadrapada',
  'Uttara Bhadrapada', 'Revati',
]

// 12 Rashis (Zodiac Signs) in order - Hindu names with English equivalents
const RASHIS = [
  { value: 'Mesha', label: 'Mesha (Aries)' },
  { value: 'Vrishabha', label: 'Vrishabha (Taurus)' },
  { value: 'Mithuna', label: 'Mithuna (Gemini)' },
  { value: 'Karka', label: 'Karka (Cancer)' },
  { value: 'Simha', label: 'Simha (Leo)' },
  { value: 'Kanya', label: 'Kanya (Virgo)' },
  { value: 'Tula', label: 'Tula (Libra)' },
  { value: 'Vrishchika', label: 'Vrishchika (Scorpio)' },
  { value: 'Dhanu', label: 'Dhanu (Sagittarius)' },
  { value: 'Makara', label: 'Makara (Capricorn)' },
  { value: 'Kumbha', label: 'Kumbha (Aquarius)' },
  { value: 'Meena', label: 'Meena (Pisces)' },
]

const inr = (n) => '₹ ' + Number(n || 0).toLocaleString('en-IN')
const todayISO = () => new Date().toISOString().slice(0, 10)
const stampNow = () => stamp(new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }))
const fmtDate = (d) => {
  if (!d) return '—'
  const date = new Date(d)
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

// Calculate validity duration in days from plan name
const durDays = (planName) => {
  const n = (planName || '').toLowerCase()
  if (n.includes('life')) return null
  if (n.includes('daily') || n.includes('one')) return 1
  if (n.includes('monthly') || n.includes('month')) return 30
  if (n.includes('year')) return 365
  return 1
}

// Short validity label
const validityShort = (planName) => {
  const n = (planName || '').toLowerCase()
  if (n.includes('daily')) return '1 Day'
  if (n.includes('monthly') || n.includes('month')) return '1 Month'
  if (n.includes('life')) return 'Lifetime'
  if (n.includes('one')) return 'One-Time'
  if (n.includes('year')) return '1 Year'
  return 'Selected Date'
}

// Full validity range string
const validityRange = (planName, fromDate) => {
  const d = durDays(planName)
  if (d === null) return 'Lifetime'
  const to = addDays(fromDate, d - 1)
  return `${d} Day${d > 1 ? 's' : ''} (${fmtDate(fromDate)} to ${fmtDate(to)})`
}

// Calculate expiry date for display
const calcExpiry = (bookedDate, planName) => {
  if (!bookedDate) return null
  const d = new Date(bookedDate)
  if (isNaN(d.getTime())) return null
  const pn = (planName || '').toLowerCase()
  if (pn.includes('life')) return 'Lifetime'
  if (pn.includes('year')) { d.setFullYear(d.getFullYear() + 1); return fmtDate(d) }
  if (pn.includes('monthly') || pn.includes('month')) { d.setDate(d.getDate() + 30); return fmtDate(d) }
  return null
}

// Determine booking mode from category and plan
const getBookingMode = (category, planName) => {
  if (category === 'Daily' || category === 'Vehicle') return 'cart'
  if (category === 'Occasion') return 'ceremony'
  if (category === 'Festival') return 'festival'
  if (category === 'Monthly') return 'tithi'
  if (category === 'Long-Term') return 'registration'
  const pn = (planName || '').toLowerCase()
  if (pn.includes('life') || pn.includes('year')) return 'registration'
  if (pn.includes('monthly')) return 'tithi'
  return 'cart'
}

// Pournami dates are fetched from backend API using astronomical calculation (PyEphem)
// This works forever without manual date entry - no year limitation

export default function Counter() {
  const { lang } = useLang()
  const { role } = useOutletContext()
  const canBill = role !== 'Accountant'

  // ── Pooja catalogue ──
  const [catalog, setCatalog] = useState([])
  const [poojas, setPoojas] = useState([])
  const [sevaQ, setSevaQ] = useState('')
  const [catalogErr, setCatalogErr] = useState('')

  useEffect(() => {
    PoojasAPI.list()
      .then((r) => {
        setPoojas(r.items || [])
        const flat = []
        for (const p of (r.items || [])) {
          for (const pl of (p.plans || [])) {
            flat.push({
              key: `${p.id}-${pl.id}`,
              pooja_id: p.id, pooja_name: p.name, name_te: p.name_te, category: p.category,
              plan_id: pl.id, plan_name: pl.plan_name,
              committee: !!pl.committee_decided,
              fee: pl.fee == null ? null : Number(pl.fee),
              plans: p.plans,
            })
          }
        }
        setCatalog(flat)
      })
      .catch((e) => setCatalogErr(e.detail || 'Could not load the pooja catalogue.'))
  }, [])

  // Festival windows
  const [festivals, setFestivals] = useState([])
  useEffect(() => {
    FestivalsAPI.list().then((r) => setFestivals(r.items || r || [])).catch(() => {})
  }, [])

  // Poojaris for assignment
  const [poojaris, setPoojaris] = useState([])
  useEffect(() => {
    PoojarisAPI.list().then((d) => setPoojaris((Array.isArray(d) ? d : d?.items || []).filter((p) => p.active))).catch(() => {})
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

  // ── Category filter ──
  const [cat, setCat] = useState('All')
  const filtered = useMemo(() => {
    const q = sevaQ.trim().toLowerCase()
    return catalog.filter((s) => {
      // Filter by category/plan
      let catMatch = false
      if (cat === 'All') {
        catMatch = true
      } else if (cat === 'Daily') {
        // Show only Daily plans (plan_name contains 'Daily' or is 'Per Day')
        catMatch = s.category === 'Daily' && /daily|per day/i.test(s.plan_name || '')
      } else if (cat === 'Monthly') {
        // Show only Monthly plans
        catMatch = /monthly/i.test(s.plan_name || '')
      } else if (cat === 'Long-Term') {
        // Show Long-Term plans (Life Long, Yearly, etc.)
        catMatch = s.category === 'Long-Term' || /life|year|long/i.test(s.plan_name || '')
      } else {
        // For Occasion, Festival, Vehicle - filter by category
        catMatch = s.category === cat
      }
      // Filter by search query
      const queryMatch = !q || `${s.pooja_name} ${s.name_te || ''} ${s.plan_name} ${s.category || ''}`.toLowerCase().includes(q)
      return catMatch && queryMatch
    })
  }, [catalog, sevaQ, cat])

  // ── Devotee state (Phone-first flow) ──
  const [mobile, setMobile] = useState('')
  const [countryCode, setCountryCode] = useState('+91')
  const [name, setName] = useState('')
  const [mobileResults, setMobileResults] = useState(null)  // Devotees matching mobile
  const [showMobileDropdown, setShowMobileDropdown] = useState(false)
  const [devotee, setDevotee] = useState(null)  // Linked devotee (if selected from dropdown)
  const searchRef = useRef(0)

  // Sankalpam details
  const [gothram, setGothram] = useState('')
  const [nakshatram, setNakshatram] = useState('')
  const [rasi, setRasi] = useState('')
  const [beneficiary, setBeneficiary] = useState('')
  const [participants, setParticipants] = useState([])  // Array of { name, relation? }
  const [specialNotes, setSpecialNotes] = useState('')
  const [showSankalpamModal, setShowSankalpamModal] = useState(false)

  // Search devotees by mobile number (when 6+ digits)
  useEffect(() => {
    const m = mobile.trim()
    if (m.length < 6 || devotee) { setMobileResults(null); setShowMobileDropdown(false); return }
    const seq = ++searchRef.current
    const t = setTimeout(() => {
      DevoteesAPI.list({ q: m, size: 8 })
        .then((r) => {
          if (seq === searchRef.current) {
            const matches = (r.items || []).filter(d => d.mobile && d.mobile.includes(m))
            setMobileResults(matches)
            setShowMobileDropdown(matches.length > 0)
          }
        })
        .catch(() => { if (seq === searchRef.current) { setMobileResults([]); setShowMobileDropdown(false) } })
    }, 250)
    return () => clearTimeout(t)
  }, [mobile, devotee])

  const pickDevotee = (d) => {
    setDevotee(d)
    setMobile(d.mobile || '')
    setName(d.name)
    setGothram(d.gothram || '')
    setNakshatram(d.nakshatram || '')
    setMobileResults(null)
    setShowMobileDropdown(false)
  }

  const clearDevotee = () => {
    setDevotee(null)
    setMobile('')
    setName('')
    setGothram('')
    setNakshatram('')
    setRasi('')
    setBeneficiary('')
    setParticipants([])
    setSpecialNotes('')
    setMobileResults(null)
    setShowMobileDropdown(false)
  }

  // When user changes mobile after selecting a devotee, unlink devotee
  const handleMobileChange = (val) => {
    const cleaned = sanitizePhone(val)
    setMobile(cleaned)
    if (devotee && cleaned !== devotee.mobile) {
      setDevotee(null)  // Unlink if mobile changed
    }
  }

  // When user changes name after selecting a devotee, unlink if different
  const handleNameChange = (val) => {
    const cleaned = sanitizeName(val)
    setName(cleaned)
    if (devotee && cleaned !== devotee.name) {
      setDevotee(null)  // Unlink if name changed (different family member)
    }
  }

  // Auto-create devotee on successful booking (if new mobile+name combination)
  const autoCreateDevotee = async (bookingMobile, bookingName) => {
    if (!bookingMobile || !bookingName || bookingMobile.length !== 10) return null
    try {
      // Check if this exact mobile+name combination exists
      const existing = await DevoteesAPI.list({ q: bookingMobile, size: 10 })
      const exact = (existing.items || []).find(d =>
        d.mobile === bookingMobile && d.name.toLowerCase() === bookingName.toLowerCase()
      )
      if (exact) return exact  // Already exists

      // Create new devotee
      const newDev = await DevoteesAPI.create({
        name: bookingName,
        mobile: bookingMobile,
      })
      return newDev
    } catch {
      return null  // Silently fail - booking already succeeded
    }
  }

  // ── Booking Mode State ──
  const [selectedEntry, setSelectedEntry] = useState(null)
  const [selectedPlan, setSelectedPlan] = useState(null)
  const bookingMode = useMemo(() => {
    if (!selectedEntry) return 'cart'
    return getBookingMode(selectedEntry.category, selectedEntry.plan_name)
  }, [selectedEntry])

  // ── Form mode state ──
  const [schedDate, setSchedDate] = useState(todayISO())
  const [slot, setSlot] = useState(SLOTS[0])
  const [poojariId, setPoojariId] = useState('')
  const [committeeAmt, setCommitteeAmt] = useState('')

  // Pournami dates for Monthly poojas - fetched from backend using Swiss Ephemeris Panchang calculation
  const [pournamiDates, setPournamiDates] = useState([])
  useEffect(() => {
    TithiAPI.upcoming('Pournami', 3)  // Current month + next 2 months
      .then((r) => setPournamiDates((r.dates || []).map((d) => d.date)))
      .catch(() => setPournamiDates([]))
  }, [])

  // ── Cart state ──
  const lineSeq = useRef(0)
  const [cart, setCart] = useState([])

  // ── Payment state ──
  const [mode, setMode] = useState('Cash')
  const [utr, setUtr] = useState('')
  const [busy, setBusy] = useState(false)
  const [billingProgress, setBillingProgress] = useState(null)
  const [error, setError] = useState('')
  const [bill, setBill] = useState(null)

  // ── Duplicate warnings ──
  const [dupWarnings, setDupWarnings] = useState([])
  const [formDupWarning, setFormDupWarning] = useState(null)
  const [dupConfirmed, setDupConfirmed] = useState({})  // { lineId: true/false } for cart mode
  const [formDupConfirmed, setFormDupConfirmed] = useState(false)  // for form mode

  // Check if all duplicate warnings are confirmed
  const allDupConfirmed = dupWarnings.length === 0 || dupWarnings.every(w => dupConfirmed[w.lineId])

  const cartKey = cart.map(c => `${c.pooja_id}-${c.plan_id}`).join(',')
  useEffect(() => {
    if (!devotee?.id || !cart.length) { setDupWarnings([]); return }
    const monthlyItems = cart.filter((x) =>
      x.category === 'Monthly' || x.category === 'Long-Term' ||
      /monthly|life|year/i.test(x.plan_name || '')
    )
    if (!monthlyItems.length) { setDupWarnings([]); return }

    const checkAll = async () => {
      const warnings = []
      for (const item of monthlyItems) {
        try {
          const res = await BookingsAPI.checkDuplicate({ devotee_id: devotee.id, pooja_id: item.pooja_id, plan_id: item.plan_id })
          if (res.has_duplicate) {
            warnings.push({
              lineId: item.lineId,
              pooja_name: item.pooja_name,
              plan_name: item.plan_name,
              existing_ticket: res.ticket_no || res.existing_booking,
              booked_on: res.booked_on,
              valid_until: res.valid_until || calcExpiry(res.booked_on, item.plan_name),
            })
          }
        } catch { /* ignore */ }
      }
      setDupWarnings(warnings)
      setDupConfirmed({})  // Reset confirmations when warnings change
    }
    checkAll()
  }, [devotee?.id, cartKey])

  useEffect(() => {
    if (!devotee?.id || !selectedEntry || bookingMode === 'cart') { setFormDupWarning(null); setFormDupConfirmed(false); return }
    const plan = selectedPlan || selectedEntry
    const isLongTerm = selectedEntry.category === 'Monthly' || selectedEntry.category === 'Long-Term' ||
      /monthly|life|year/i.test(plan.plan_name || '')
    if (!isLongTerm) { setFormDupWarning(null); setFormDupConfirmed(false); return }

    BookingsAPI.checkDuplicate({ devotee_id: devotee.id, pooja_id: selectedEntry.pooja_id, plan_id: plan.plan_id || plan.id })
      .then((res) => { setFormDupWarning(res.has_duplicate ? res : null); setFormDupConfirmed(false) })
      .catch(() => { setFormDupWarning(null); setFormDupConfirmed(false) })
  }, [devotee?.id, selectedEntry?.pooja_id, selectedPlan?.id, bookingMode])

  // ── Handle pooja selection ──
  const selectPooja = async (entry) => {
    const mode = getBookingMode(entry.category, entry.plan_name)

    if (mode === 'cart') {
      await addToCart(entry)
    } else {
      setSelectedEntry(entry)
      setSelectedPlan(null)
      setCommitteeAmt('')
      setError('')

      if (entry.category === 'Festival') {
        const fw = festivalFor(entry)
        if (fw?.date) setSchedDate(fw.date)
      } else if (entry.category === 'Monthly') {
        if (pournamiDates.length > 0) setSchedDate(pournamiDates[0])
      } else {
        setSchedDate(todayISO())
      }
    }
  }

  // ── Add to cart ──
  const addToCart = async (entry) => {
    let amount = entry.fee
    let scheduled_date
    let vehicle_no

    if (entry.category === 'Festival') {
      const fw = festivalFor(entry)
      if (fw?.past) {
        setError(`The festival window for this pooja is over (${fw.windows}).`)
        return
      }
      if (fw?.date) scheduled_date = fw.date
      const festFee = Number(fw?.fest?.plan_fees?.[String(entry.plan_id)] || 0)
      if (festFee > 0) amount = festFee
    }

    if (entry.category === 'Vehicle') {
      const res = await promptDialog({
        title: tr('Vehicle Pooja'),
        confirmLabel: tr('Add to Bill'),
        fields: [{ k: 'vehicle', label: tr('Vehicle Number'), placeholder: 'e.g. TS09 AB 1234', note: 'Optional — printed on the receipt.' }],
      })
      if (!res) return
      vehicle_no = res.vehicle.trim().toUpperCase() || undefined
    }

    if ((entry.committee || entry.fee == null) && !(Number(amount) > 0)) {
      const res = await promptDialog({
        title: `${entry.pooja_name} · ${entry.plan_name}`,
        message: 'Please enter the amount for this pooja.',
        confirmLabel: tr('Add to Bill'),
        fields: [{ k: 'amount', label: tr('Amount (₹)'), type: 'number', required: true }],
      })
      if (!res) return
      amount = Number(res.amount)
      if (!(amount > 0)) { setError('Enter a valid amount.'); return }
      setError('')
    }

    if (devotee?.id && (entry.category === 'Monthly' || entry.category === 'Long-Term' || /monthly|life|year/i.test(entry.plan_name || ''))) {
      try {
        const dupCheck = await BookingsAPI.checkDuplicate({ devotee_id: devotee.id, pooja_id: entry.pooja_id, plan_id: entry.plan_id })
        if (dupCheck.has_duplicate) {
          const proceed = await promptDialog({
            title: tr('Duplicate Booking Found'),
            message: tr(dupCheck.message || `Active ${entry.plan_name} booking exists.`),
            confirmLabel: tr('Add Anyway'),
            cancelLabel: tr('Cancel'),
            tone: 'warning',
          })
          if (!proceed) return
        }
      } catch { /* ignore */ }
    }

    setCart((c) => [...c, { ...entry, amount, scheduled_date, vehicle_no, lineId: ++lineSeq.current }])
  }

  const removeFromCart = (lineId) => setCart((c) => c.filter((x) => x.lineId !== lineId))
  const total = cart.reduce((s, x) => s + Number(x.amount || 0), 0)

  const clearSelection = () => {
    setSelectedEntry(null)
    setSelectedPlan(null)
    setCommitteeAmt('')
    setSchedDate(todayISO())
    setSlot(SLOTS[0])
    setPoojariId('')
    setBeneficiary('')
    setRasi('')
    setParticipants([])
    setSpecialNotes('')
    setFormDupWarning(null)
    setError('')
  }

  // ── Checkout (cart mode) - OPTIMIZED: single API call for all items ──
  const checkout = async () => {
    setError('')
    if (!canBill) { setError('View-only access.'); return }
    if (!name.trim()) { setError('Enter the devotee / payer name.'); return }
    if (!mobile.trim() || !/^\d{10}$/.test(mobile.trim())) { setError('Enter a valid 10-digit mobile number.'); return }
    if (!cart.length) { setError('Add at least one pooja to the bill.'); return }
    if (mode === 'UPI/QR Code' && !utr.trim()) { setError('Enter the UTR / Transaction ID.'); return }

    const lt = cart.find((x) => /life|year/i.test(x.plan_name || ''))
    if (lt && !devotee) {
      setError(`"${lt.pooja_name} · ${lt.plan_name}" requires a registered devotee.`)
      return
    }

    setBusy(true)
    setBillingProgress({ current: 1, total: cart.length })

    const sum = (ls) => ls.reduce((s, x) => s + Number(x.amount || 0), 0)

    // Capture cart items before async operation (React state may change)
    const originalCartItems = [...cart]

    try {
      // Prepare all items for bulk creation
      const items = originalCartItems.map((item) => ({
        devotee_id: devotee?.id ?? undefined,
        devotee_name: name.trim(),
        mobile: mobile.trim(),
        pooja_id: item.pooja_id,
        plan_id: item.plan_id,
        plan_name: item.plan_name,
        seva_name: item.pooja_name,
        category: item.category || undefined,
        amount: Number(item.amount),
        scheduled_date: item.scheduled_date || todayISO(),
        vehicle_no: item.vehicle_no,
        source: 'Counter',
      }))

      // Single API call for all bookings (replaces 4 × N calls)
      const result = await BookingsAPI.bulkQuickCreate({
        items,
        payment_method: mode,
      })

      // Map results back to cart items (use originalCartItems, not cart state)
      const done = result.success.map((s) => {
        const cartItem = originalCartItems[s.index] || {}
        return {
          ...cartItem,
          pooja_name: cartItem.pooja_name || s.seva_name || 'Seva',
          plan_name: cartItem.plan_name || s.plan_name || 'Daily',
          amount: cartItem.amount || s.amount || 0,
          booking: {
            id: s.id,
            booking_code: s.booking_code,
            ticket_no: s.ticket_no,
            receipt_no: s.receipt_no,
            seva_name: s.seva_name,
            plan_name: s.plan_name,
            amount: s.amount,
            valid_until: s.valid_until,
            scheduled_date: s.scheduled_date,
          },
        }
      })

      const failedCount = result.failed_count

      setBill({
        lines: done,
        total: sum(done),
        name: name.trim(),
        mobile: mobile.trim(),
        mode,
        utr: utr.trim(),
        ref: done[0]?.booking?.receipt_no || done[0]?.booking?.booking_code,
        paidAt: stampNow(),
        failed: failedCount,
      })

      // Auto-create devotee if new mobile+name (only if booking succeeded)
      if (done.length > 0 && !devotee) {
        autoCreateDevotee(mobile.trim(), name.trim())  // Fire and forget
      }

      if (failedCount) {
        // Show first error message for debugging
        const firstError = result.failed?.[0]?.error || 'Unknown error'
        setError(`${done.length} item(s) billed; ${failedCount} failed. Error: ${firstError}`)
      } else {
        setCart([])
        clearDevotee()
        setUtr('')
      }
    } catch (err) {
      setError(err.detail || 'Billing failed. Please try again.')
    }

    setBusy(false)
    setBillingProgress(null)
  }

  // ── Book (form mode) - OPTIMIZED: single API call ──
  const bookForm = async () => {
    setError('')
    if (!canBill) { setError('View-only access.'); return }
    if (!name.trim()) { setError('Enter the devotee name.'); return }
    if (!mobile.trim() || !/^\d{10}$/.test(mobile.trim())) { setError('Enter a valid 10-digit mobile number.'); return }
    if (!schedDate) { setError('Select a booking date.'); return }
    if (mode === 'UPI/QR Code' && !utr.trim()) { setError('Enter the UTR / Transaction ID.'); return }

    if (bookingMode === 'registration' && !devotee) {
      setError('Long-term poojas require a registered devotee.')
      return
    }

    const plan = selectedPlan || selectedEntry
    let amount = plan.fee

    if (plan.committee || plan.fee == null) {
      if (selectedEntry.category === 'Festival') {
        const fw = festivalFor(selectedEntry)
        const festFee = Number(fw?.fest?.plan_fees?.[String(plan.plan_id || plan.id)] || 0)
        if (festFee > 0) amount = festFee
      }
      if (!(Number(amount) > 0)) {
        amount = Number(committeeAmt)
        if (!(amount > 0)) { setError('Enter the committee-decided amount.'); return }
      }
    }

    setBusy(true)
    try {
      // Single API call (replaces 4 sequential calls)
      const booking = await BookingsAPI.quickCreate({
        devotee_id: devotee?.id ?? undefined,
        devotee_name: name.trim(),
        mobile: mobile.trim(),
        pooja_id: selectedEntry.pooja_id,
        plan_id: plan.plan_id || plan.id,
        plan_name: plan.plan_name,
        seva_name: selectedEntry.pooja_name,
        category: selectedEntry.category,
        amount: Number(amount),
        scheduled_date: schedDate,
        time_slot: slot,
        gothram: gothram.trim() || undefined,
        nakshatram: nakshatram.trim() || undefined,
        beneficiary_name: beneficiary.trim() || undefined,
        source: 'Counter',
        payment_method: mode,
      })

      // Poojari assignment (optional, best-effort)
      if (poojariId) {
        try { await PoojarisAPI.assign(booking.id, Number(poojariId)) } catch { /* best-effort */ }
      }

      const assignedPoojari = poojaris.find((p) => String(p.id) === String(poojariId)) || null

      setBill({
        lines: [{
          ...selectedEntry,
          ...plan,
          amount,
          booking,
          _gothram: gothram,
          _nakshatram: nakshatram,
          _rasi: rasi,
          _beneficiary: beneficiary,
          _participants: participants,
          _specialNotes: specialNotes,
          _slot: slot,
          _poojari: assignedPoojari?.name,
          _schedDate: schedDate,
        }],
        total: amount,
        name: name.trim(),
        mobile: mobile.trim(),
        mode,
        utr: utr.trim(),
        ref: booking.receipt_no || booking.booking_code,
        paidAt: stampNow(),
        failed: 0,
        isFormBooking: true,
      })

      // Auto-create devotee if new mobile+name (only for non-registration bookings)
      if (!devotee && bookingMode !== 'registration') {
        autoCreateDevotee(mobile.trim(), name.trim())  // Fire and forget
      }

      clearSelection()
      clearDevotee()
      setUtr('')
    } catch (err) {
      setError(err.detail || 'Booking failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const modeLabel = (m) => tr(m === 'UPI/QR Code' ? 'UPI / QR Code' : m)

  const getCurrentFee = () => {
    if (!selectedEntry) return 0
    const plan = selectedPlan || selectedEntry
    if (plan.committee || plan.fee == null) {
      if (selectedEntry.category === 'Festival') {
        const fw = festivalFor(selectedEntry)
        const festFee = Number(fw?.fest?.plan_fees?.[String(plan.plan_id || plan.id)] || 0)
        if (festFee > 0) return festFee
      }
      return Number(committeeAmt) || 0
    }
    return Number(plan.fee) || 0
  }

  return (
    <div>
      <PageHeader
        title={tr("Counter Billing")}
        subtitle={tr("One screen for all pooja bookings — daily, ceremonies, festivals, registrations")}
        action={<span className="badge bg-saffron-50 text-saffron-700">{tr('Counter')} 1 · {tr(role)}</span>}
      />

      {catalogErr && <div className="mt-4 rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm px-4 py-2.5">{catalogErr}</div>}
      {!canBill && (
        <div className="mt-4 rounded-lg bg-blue-50 border border-blue-100 text-blue-700 text-sm px-4 py-2.5 flex items-center gap-2">
          <Eye size={15} className="shrink-0" />
          <T>View-only access — the Accountant role cannot issue receipts.</T>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mt-5">
        {/* ── Left Panel: Pooja Picker ── */}
        <div className="md:col-span-1 lg:col-span-2 card p-5 sm:p-6">
          {/* Phone-first devotee entry */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
            {/* Mobile FIRST */}
            <div className="relative">
              <label className="label"><T>Mobile</T> *</label>
              <div className="flex">
                <CountryCodeSelect value={countryCode} onChange={(e) => setCountryCode(e.target.value)} />
                <input
                  value={mobile}
                  onChange={(e) => handleMobileChange(e.target.value)}
                  placeholder={tr("Enter Mobile Number")}
                  maxLength={getCountryDigits(countryCode)}
                  className="input flex-1 !rounded-l-none"
                  autoFocus
                  aria-label={tr("Mobile number")}
                  aria-describedby="mobile-hint"
                />
              </div>
              <p id="mobile-hint" className="text-[0.625rem] text-gray-400 mt-1"><T>Type to search existing devotees</T></p>
              {/* Dropdown showing matching devotees by mobile */}
              {showMobileDropdown && mobileResults && mobileResults.length > 0 && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                  <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 text-[0.6875rem] text-gray-500 font-medium">
                    <T>Select to auto-fill</T>
                  </div>
                  {mobileResults.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => pickDevotee(d)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-saffron-50 flex items-center justify-between border-b border-gray-50 last:border-0"
                    >
                      <span className="font-medium text-gray-800">{personName(d, lang)}</span>
                      <span className="text-gray-400 text-xs">{d.mobile}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Name SECOND */}
            <div>
              <label className="label"><T>Name</T> *</label>
              <input
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder={tr("Devotee / Payer name")}
                className="input"
              />
            </div>
          </div>

          {/* Linked devotee indicator */}
          {devotee && (
            <div className="mb-5 flex items-center justify-between bg-emerald-50 border-2 border-emerald-200 rounded-xl px-4 py-3">
              <div className="flex items-center gap-3 text-sm text-emerald-800">
                <div className="w-8 h-8 rounded-full bg-emerald-100 grid place-items-center">
                  <User size={16} className="text-emerald-600" />
                </div>
                <div>
                  <span className="font-semibold">{personName(devotee, lang)}</span>
                  {devotee.gothram && <span className="text-emerald-600 text-xs ml-2">· {devotee.gothram}</span>}
                  <div className="text-[0.6875rem] text-emerald-600">{devotee.mobile}</div>
                </div>
              </div>
              <button onClick={clearDevotee} className="text-emerald-600 hover:text-red-600 text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-red-50 transition"><T>Clear</T></button>
            </div>
          )}

          {/* Category chips */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
            <h3 className="font-bold text-gray-900 text-lg"><T>Select Pooja</T></h3>
            <div className="relative w-full sm:w-72">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={sevaQ} onChange={(e) => setSevaQ(e.target.value)} placeholder={tr("Search pooja / plan…")} className="input !pl-10 !py-2.5" aria-label={tr("Search poojas")} />
            </div>
          </div>
          <div className="flex gap-2 sm:gap-2.5 mb-5 overflow-x-auto pb-2 -mx-1 px-1 sm:flex-wrap sm:overflow-visible scrollbar-thin" role="group" aria-label="Pooja categories">
            {CATS.map((c) => (
              <button key={c} onClick={() => setCat(c)}
                aria-pressed={cat === c}
                className={`px-4 py-2 rounded-full text-sm font-semibold border-2 transition whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-maroon-500 focus:ring-offset-1 ${cat === c ? 'bg-maroon-700 text-cream border-maroon-700 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-maroon-300 hover:bg-maroon-50'}`}>
                {tr(c)}
              </button>
            ))}
          </div>

          {/* Category hints */}
          {cat === 'Occasion' && (
            <div className="text-[0.8125rem] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 flex items-start gap-3">
              <Info size={16} className="shrink-0 mt-0.5" />
              <T>Ceremony poojas open a detailed form with date, time slot, sankalpam details and poojari selection.</T>
            </div>
          )}
          {cat === 'Festival' && (
            <div className="text-[0.8125rem] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 flex items-start gap-3">
              <Info size={16} className="shrink-0 mt-0.5" />
              <T>Festival poojas are scheduled within their festival window from Festival Master.</T>
            </div>
          )}
          {cat === 'Monthly' && (
            <div className="text-[0.8125rem] text-blue-700 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-4 flex items-start gap-3">
              <Moon size={16} className="shrink-0 mt-0.5" />
              <span><T>Monthly poojas like Sai Vratam are performed on Pournami days.</T>{' '}
              <span className="font-semibold"><T>Upcoming</T>: {pournamiDates.slice(0, 3).map(d => fmtDate(d)).join(', ')}</span></span>
            </div>
          )}
          {cat === 'Long-Term' && (
            <div className="text-[0.8125rem] text-maroon-700 bg-maroon-50 border border-maroon-200 rounded-xl px-4 py-3 mb-4 flex items-start gap-3">
              <ShieldCheck size={16} className="shrink-0 mt-0.5" />
              <T>Long-term poojas (Life Long, Yearly) require a registered devotee.</T>
            </div>
          )}

          {/* Pooja grid */}
          {catalogErr && <div className="text-red-600 text-sm text-center py-6" role="alert">{catalogErr}</div>}
          {!catalogErr && catalog.length === 0 && (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <Loader2 size={24} className="animate-spin mr-3" />
              <span className="text-base"><T>Loading poojas...</T></span>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[32rem] overflow-y-auto pr-1 scrollbar-thin" role="list" aria-label={tr("Available poojas")}>
            {filtered.map((s) => {
              const poojaMode = getBookingMode(s.category, s.plan_name)
              const isCartMode = poojaMode === 'cart'
              return (
                <button key={s.key} onClick={() => selectPooja(s)}
                  role="listitem"
                  aria-label={`${s.pooja_name}, ${s.plan_name}, ₹${Number(s.fee || 0)}`}
                  className="flex items-center justify-between border-2 border-gray-200 rounded-xl px-4 py-3.5 text-left hover:border-saffron-400 hover:bg-saffron-50 hover:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-saffron-500 focus:ring-offset-1">
                  <div className="min-w-0">
                    <div className="text-[0.9375rem] font-semibold text-gray-800 leading-tight">{lang === 'te' && s.name_te ? s.name_te : tr(s.pooja_name)}</div>
                    <div className="text-[0.75rem] text-gray-500 leading-tight flex items-center gap-1.5 mt-1">
                      {s.category === 'Vehicle' && <Car size={12} aria-hidden="true" />}
                      {s.category === 'Festival' && <CalendarDays size={12} aria-hidden="true" />}
                      {s.category === 'Occasion' && <Flame size={12} aria-hidden="true" />}
                      {s.category === 'Monthly' && <Moon size={12} aria-hidden="true" />}
                      {tr(s.plan_name)}
                    </div>
                  </div>
                  <span className="flex items-center gap-1.5 text-saffron-700 font-bold text-base shrink-0 ml-2">
                    {isCartMode ? <Plus size={16} aria-hidden="true" /> : <ArrowRight size={16} aria-hidden="true" />}
                    {`₹${Number(s.fee || 0).toLocaleString('en-IN')}`}
                  </span>
                </button>
              )
            })}
            {filtered.length === 0 && catalog.length > 0 && <p className="text-base text-gray-400 col-span-full text-center py-12"><T>No matching poojas.</T></p>}
          </div>
        </div>

        {/* ── Right Panel ── */}
        <div className="card p-5 sm:p-6 flex flex-col">
          {/* Cart Mode */}
          {(!selectedEntry || bookingMode === 'cart') && (
            <>
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-9 h-9 rounded-full bg-saffron-100 grid place-items-center">
                  <ReceiptIcon size={18} className="text-saffron-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-lg">{lang === 'te' ? 'రసీదు' : 'Bill / రసీదు'}</h3>
                  <p className="text-[0.75rem] text-gray-400"><T>Add daily poojas or vehicle poojas to the bill</T></p>
                </div>
              </div>

              <div className="flex-1 space-y-3 min-h-[6rem] max-h-[20rem] overflow-y-auto mt-4 mb-4">
                {cart.length === 0 && (
                  <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-xl">
                    <ReceiptIcon size={32} className="mx-auto text-gray-300 mb-2" />
                    <p className="text-sm text-gray-400"><T>No items added. Select a pooja from the left.</T></p>
                  </div>
                )}
                {cart.map((x) => (
                  <div key={x.lineId} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-800 leading-tight">{x.pooja_name}</div>
                      <div className="text-[0.75rem] text-gray-500 leading-tight mt-0.5">
                        {x.plan_name}
                        {x.vehicle_no && ` · ${x.vehicle_no}`}
                        {x.scheduled_date && x.scheduled_date !== todayISO() && ` · ${fmtDate(x.scheduled_date)}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-bold text-gray-800 text-base">₹{Number(x.amount || 0).toLocaleString('en-IN')}</span>
                      <button onClick={() => removeFromCart(x.lineId)} className="w-8 h-8 rounded-lg bg-white border border-gray-200 grid place-items-center text-gray-400 hover:text-red-500 hover:border-red-300 hover:bg-red-50 transition"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>

              {dupWarnings.length > 0 && (
                <div className="mt-3 space-y-2">
                  {dupWarnings.map((w) => (
                    <div key={w.lineId} className={`rounded-lg px-3 py-2.5 shadow-sm border-2 ${dupConfirmed[w.lineId] ? 'bg-emerald-50 border-emerald-400' : 'bg-orange-100 border-orange-400'}`}>
                      <div className="flex items-start gap-2">
                        <AlertTriangle size={16} className={`shrink-0 mt-0.5 ${dupConfirmed[w.lineId] ? 'text-emerald-600' : 'text-orange-600'}`} />
                        <div className="text-xs flex-1">
                          <div className={`font-bold text-sm ${dupConfirmed[w.lineId] ? 'text-emerald-800' : 'text-orange-900'}`}><T>Active Plan Exists</T></div>
                          <div className="font-semibold text-gray-800 mt-0.5">{w.pooja_name} ({w.plan_name})</div>
                          <div className="mt-1 space-y-0.5 text-gray-700">
                            {w.booked_on && <div><span className="font-medium text-gray-600"><T>Booked</T>:</span> {fmtDate(w.booked_on)}</div>}
                            {w.valid_until && <div><span className="font-medium text-gray-600"><T>Valid Until</T>:</span> {typeof w.valid_until === 'string' && w.valid_until.includes('-') ? fmtDate(w.valid_until) : w.valid_until}</div>}
                          </div>
                          {w.existing_ticket && <div className="text-[0.6875rem] text-gray-500 mt-1"><T>Ticket</T>: {w.existing_ticket}</div>}

                          {/* Confirmation checkbox */}
                          <label className={`mt-2 flex items-start gap-2 cursor-pointer p-2 rounded-lg border ${dupConfirmed[w.lineId] ? 'bg-emerald-100 border-emerald-300' : 'bg-white border-orange-200 hover:bg-orange-50'}`}>
                            <input
                              type="checkbox"
                              checked={!!dupConfirmed[w.lineId]}
                              onChange={(e) => setDupConfirmed(prev => ({ ...prev, [w.lineId]: e.target.checked }))}
                              className="mt-0.5 w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                            />
                            <span className={`text-[0.6875rem] leading-tight ${dupConfirmed[w.lineId] ? 'text-emerald-700' : 'text-gray-600'}`}>
                              <T>I have informed the devotee about the existing active plan and they wish to proceed with a new booking.</T>
                            </span>
                          </label>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Payment Method Selection */}
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-3"><T>Payment Method</T></label>
                <div className="grid grid-cols-2 gap-3">
                  {['Cash', 'UPI/QR Code'].map((m) => (
                    <button key={m} onClick={() => setMode(m)}
                      className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 py-4 px-3 font-semibold transition-all ${mode === m
                        ? 'border-saffron-500 bg-saffron-50 text-saffron-800 shadow-sm'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'}`}>
                      <div className={`w-10 h-10 rounded-full grid place-items-center ${mode === m ? 'bg-saffron-200' : 'bg-gray-100'}`}>
                        <IndianRupee size={20} />
                      </div>
                      <span className="text-sm">{modeLabel(m)}</span>
                    </button>
                  ))}
                </div>
              </div>
              {mode === 'UPI/QR Code' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-600 mb-2"><T>UTR / Transaction ID</T> *</label>
                  <input value={utr} onChange={(e) => setUtr(e.target.value)} placeholder={tr("Enter UTR or Transaction ID")} className="input !py-3 text-base" />
                </div>
              )}

              {/* Total & Checkout */}
              <div className="border-t-2 border-gray-100 pt-4 mt-auto">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-base font-semibold text-gray-600">{lang === 'te' ? 'మొత్తం' : 'Total / మొత్తం'}</span>
                  <span className="text-2xl font-extrabold text-maroon-700">{inr(total)}</span>
                </div>
                {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3 text-sm text-red-700 font-medium text-center">{error}</div>}
                {dupWarnings.length > 0 && !allDupConfirmed && (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mb-3 text-sm text-orange-700 font-medium text-center">
                    <T>Please confirm the duplicate plan acknowledgement above to proceed.</T>
                  </div>
                )}
                <button onClick={checkout} disabled={busy || !cart.length || !canBill || !allDupConfirmed} className="btn-primary w-full py-4 text-base disabled:bg-gray-300 justify-center rounded-xl">
                  {busy
                    ? <><Loader2 size={18} className="animate-spin" /> {billingProgress ? `${tr('Processing')} ${billingProgress.current}/${billingProgress.total}…` : <T>Processing…</T>}</>
                    : !canBill ? <><Eye size={18} /> <T>View Only</T></>
                    : <><ReceiptIcon size={18} /> <T>Complete Billing</T></>}
                </button>
              </div>
            </>
          )}

          {/* Form Mode */}
          {selectedEntry && bookingMode !== 'cart' && (
            <>
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-100">
                <div className="flex items-center gap-3 text-maroon-700">
                  <div className={`w-10 h-10 rounded-full grid place-items-center ${
                    bookingMode === 'ceremony' ? 'bg-orange-100' :
                    bookingMode === 'festival' ? 'bg-amber-100' :
                    bookingMode === 'registration' ? 'bg-maroon-100' : 'bg-blue-100'
                  }`}>
                    {bookingMode === 'ceremony' && <Flame size={20} />}
                    {bookingMode === 'festival' && <CalendarDays size={20} />}
                    {bookingMode === 'registration' && <ShieldCheck size={20} />}
                    {bookingMode === 'tithi' && <Moon size={20} />}
                  </div>
                  <h3 className="font-serif text-lg font-bold leading-tight">{tr(selectedEntry.pooja_name)}</h3>
                </div>
                <button onClick={clearSelection} className="w-9 h-9 rounded-lg border border-gray-200 grid place-items-center text-gray-400 hover:text-red-600 hover:border-red-300 hover:bg-red-50 transition"><X size={18} /></button>
              </div>

              {/* Plan selection */}
              {selectedEntry.plans && selectedEntry.plans.length > 1 && (
                <div className="mb-5">
                  <label className="label text-sm font-semibold"><T>Select Plan</T></label>
                  <div className="space-y-2 max-h-36 overflow-y-auto mt-2">
                    {selectedEntry.plans.map((pl) => {
                      const isSelected = (selectedPlan?.id || selectedEntry.plan_id) === pl.id
                      return (
                        <button key={pl.id} onClick={() => setSelectedPlan(pl)}
                          className={`w-full flex items-center justify-between border-2 rounded-xl px-4 py-3 transition ${isSelected ? 'border-maroon-400 bg-maroon-50' : 'border-gray-200 hover:border-maroon-300 hover:bg-gray-50'}`}>
                          <div className="flex items-center gap-3">
                            <span className={`w-4 h-4 rounded-full border-2 ${isSelected ? 'border-maroon-600 bg-maroon-600' : 'border-gray-300'}`} />
                            <div className="text-left">
                              <span className="font-semibold text-gray-800">{tr(pl.plan_name)}</span>
                              <span className="text-[0.75rem] text-gray-500 ml-2">{validityShort(pl.plan_name)}</span>
                            </div>
                          </div>
                          <span className="font-bold text-gray-800 text-base">
                            {`₹${Number(pl.fee || 0).toLocaleString('en-IN')}`}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Registration: require devotee */}
              {bookingMode === 'registration' && !devotee && (
                <div className="border-2 border-dashed border-maroon-200 rounded-xl p-4 text-center mb-4">
                  <User size={28} className="mx-auto text-maroon-300 mb-2" />
                  <div className="font-semibold text-maroon-700 text-sm"><T>Devotee Required</T></div>
                  <div className="text-[0.6875rem] text-gray-500 mt-1"><T>Search and link a devotee above.</T></div>
                </div>
              )}

              {/* Sankalpam details - clickable card opens modal */}
              {(bookingMode === 'ceremony' || bookingMode === 'festival' || bookingMode === 'tithi' || bookingMode === 'registration') && (
                <button
                  type="button"
                  onClick={() => setShowSankalpamModal(true)}
                  className="mb-4 w-full p-3 bg-amber-50/50 border border-amber-100 rounded-lg text-left hover:border-amber-300 hover:bg-amber-50 transition-colors group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText size={16} className="text-amber-600" />
                      <span className="font-semibold text-amber-800 text-sm"><T>Sankalpam Details</T></span>
                    </div>
                    <Edit3 size={14} className="text-amber-400 group-hover:text-amber-600" />
                  </div>
                  {/* Show summary if any field is filled */}
                  {(gothram || nakshatram || rasi || beneficiary || participants.length > 0 || specialNotes) ? (
                    <div className="mt-2 text-[0.75rem] text-amber-700 space-y-0.5">
                      {gothram && <div><span className="text-amber-500">{tr('Gothram')}:</span> {gothram}</div>}
                      {nakshatram && <div><span className="text-amber-500">{tr('Nakshatram')}:</span> {nakshatram}</div>}
                      {rasi && <div><span className="text-amber-500">{tr('Rasi')}:</span> {rasi}</div>}
                      {beneficiary && <div><span className="text-amber-500">{tr('In name of')}:</span> {beneficiary}</div>}
                      {participants.length > 0 && (
                        <div><span className="text-amber-500">{tr('Participants')}:</span> {participants.map(p => p.name).join(', ')}</div>
                      )}
                      {specialNotes && <div><span className="text-amber-500">{tr('Notes')}:</span> {specialNotes.slice(0, 30)}{specialNotes.length > 30 ? '...' : ''}</div>}
                    </div>
                  ) : (
                    <div className="mt-1.5 text-[0.6875rem] text-amber-500">
                      <T>Click to add Sankalpam details, participants & notes</T>
                    </div>
                  )}
                </button>
              )}

              {/* Festival window */}
              {bookingMode === 'festival' && (() => {
                const fw = festivalFor(selectedEntry)
                if (!fw || fw.none || fw.past) return null
                return (
                  <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 text-amber-800">
                      <CalendarDays size={14} />
                      <span className="text-sm font-semibold">{fw.name}</span>
                    </div>
                    <div className="text-[0.6875rem] text-amber-600 mt-0.5">
                      {fmtDate(fw.fest?.start_date)} – {fmtDate(fw.fest?.end_date)}
                    </div>
                  </div>
                )
              })()}

              {/* Pournami dates */}
              {bookingMode === 'tithi' && (
                <div className="mb-3 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 text-blue-800 mb-2">
                    <Moon size={14} />
                    <span className="text-sm font-semibold"><T>Pournami Dates</T></span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {pournamiDates.map((d) => (
                      <button key={d} onClick={() => setSchedDate(d)}
                        className={`px-2.5 py-1 rounded text-[0.6875rem] font-medium transition ${schedDate === d ? 'bg-blue-600 text-white' : 'bg-white border border-blue-200 text-blue-700 hover:bg-blue-100'}`}>
                        {fmtDate(d)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Date & Slot */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="label text-sm font-medium"><T>Date</T> *</label>
                  <DateField value={schedDate}
                    min={bookingMode === 'festival' ? (festivalFor(selectedEntry)?.fest?.start_date || todayISO()) : todayISO()}
                    max={bookingMode === 'festival' ? festivalFor(selectedEntry)?.fest?.end_date : undefined}
                    onChange={(e) => setSchedDate(e.target.value)}
                    className="!py-2.5" />
                </div>
                <div>
                  <label className="label text-sm font-medium"><T>Time Slot</T> *</label>
                  <Select value={slot} onChange={(e) => setSlot(e.target.value)} className="!py-2.5">
                    {SLOTS.map((s) => <option key={s} value={s}>{clock12(s)}</option>)}
                  </Select>
                </div>
              </div>

              {/* Poojari */}
              <div className="mb-4">
                <label className="label text-sm font-medium"><T>Assign Poojari</T></label>
                <Select value={poojariId} onChange={(e) => setPoojariId(e.target.value)} className="!py-2.5">
                  <option value="">{tr("Not assigned (optional)")}</option>
                  {poojaris.map((p) => <option key={p.id} value={p.id}>{personName(p, lang)}{p.specialization ? ` · ${tr(p.specialization)}` : ''}</option>)}
                </Select>
              </div>

              {/* Validity */}
              <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <div className="flex items-center justify-between">
                  <span className="text-emerald-700 font-medium"><T>Validity</T></span>
                  <span className="font-semibold text-emerald-800">{validityRange((selectedPlan || selectedEntry).plan_name, schedDate)}</span>
                </div>
              </div>

              {/* Committee amount */}
              {((selectedPlan || selectedEntry).committee || (selectedPlan || selectedEntry).fee == null) && (() => {
                if (selectedEntry.category === 'Festival') {
                  const fw = festivalFor(selectedEntry)
                  const festFee = Number(fw?.fest?.plan_fees?.[String((selectedPlan || selectedEntry).plan_id || (selectedPlan || selectedEntry).id)] || 0)
                  if (festFee > 0) return null
                }
                return (
                  <div className="mb-3">
                    <label className="label"><T>Amount</T> (₹) *</label>
                    <input type="number" value={committeeAmt} onChange={(e) => setCommitteeAmt(e.target.value.replace(/[^\d.]/g, ''))} placeholder={tr("Enter amount")} className="input" />
                  </div>
                )
              })()}

              {/* Duplicate warning */}
              {formDupWarning && (
                <div className={`mb-3 rounded-lg px-3 py-2.5 shadow-sm border-2 ${formDupConfirmed ? 'bg-emerald-50 border-emerald-400' : 'bg-orange-100 border-orange-400'}`}>
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={16} className={`shrink-0 mt-0.5 ${formDupConfirmed ? 'text-emerald-600' : 'text-orange-600'}`} />
                    <div className="text-xs flex-1">
                      <div className={`font-bold text-sm ${formDupConfirmed ? 'text-emerald-800' : 'text-orange-900'}`}><T>Active Plan Exists</T></div>
                      <div className="font-semibold text-gray-800 mt-0.5">{tr(formDupWarning.message)}</div>
                      <div className="mt-1 space-y-0.5 text-gray-700">
                        {formDupWarning.booked_on && <div><span className="font-medium text-gray-600"><T>Booked</T>:</span> {fmtDate(formDupWarning.booked_on)}</div>}
                        {formDupWarning.valid_until && <div><span className="font-medium text-gray-600"><T>Valid Until</T>:</span> {typeof formDupWarning.valid_until === 'string' && formDupWarning.valid_until.includes('-') ? fmtDate(formDupWarning.valid_until) : formDupWarning.valid_until}</div>}
                      </div>
                      {formDupWarning.ticket_no && <div className="text-[0.6875rem] text-gray-500 mt-1"><T>Ticket</T>: {formDupWarning.ticket_no}</div>}

                      {/* Confirmation checkbox */}
                      <label className={`mt-2 flex items-start gap-2 cursor-pointer p-2 rounded-lg border ${formDupConfirmed ? 'bg-emerald-100 border-emerald-300' : 'bg-white border-orange-200 hover:bg-orange-50'}`}>
                        <input
                          type="checkbox"
                          checked={formDupConfirmed}
                          onChange={(e) => setFormDupConfirmed(e.target.checked)}
                          className="mt-0.5 w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className={`text-[0.6875rem] leading-tight ${formDupConfirmed ? 'text-emerald-700' : 'text-gray-600'}`}>
                          <T>I have informed the devotee about the existing active plan and they wish to proceed with a new booking.</T>
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Payment Method */}
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-3"><T>Payment Method</T></label>
                <div className="grid grid-cols-2 gap-3">
                  {['Cash', 'UPI/QR Code'].map((m) => (
                    <button key={m} onClick={() => setMode(m)}
                      className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 py-4 px-3 font-semibold transition-all ${mode === m
                        ? 'border-saffron-500 bg-saffron-50 text-saffron-800 shadow-sm'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'}`}>
                      <div className={`w-10 h-10 rounded-full grid place-items-center ${mode === m ? 'bg-saffron-200' : 'bg-gray-100'}`}>
                        <IndianRupee size={20} />
                      </div>
                      <span className="text-sm">{modeLabel(m)}</span>
                    </button>
                  ))}
                </div>
              </div>
              {mode === 'UPI/QR Code' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-600 mb-2"><T>UTR / Transaction ID</T> *</label>
                  <input value={utr} onChange={(e) => setUtr(e.target.value)} placeholder={tr("Enter UTR or Transaction ID")} className="input !py-3 text-base" />
                </div>
              )}

              {/* Amount & Book */}
              <div className="border-t-2 border-gray-100 pt-4 mt-auto">
                <div className="flex items-center justify-between mb-4">
                  <span className="font-semibold text-gray-600"><T>Total Amount</T></span>
                  <span className="text-2xl font-extrabold text-maroon-800">{inr(getCurrentFee())}</span>
                </div>
                {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3 text-sm text-red-700 font-medium text-center">{error}</div>}
                {formDupWarning && !formDupConfirmed && (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mb-3 text-sm text-orange-700 font-medium text-center">
                    <T>Please confirm the duplicate plan acknowledgement above to proceed.</T>
                  </div>
                )}
                <div className="flex gap-3">
                  <button onClick={clearSelection} className="btn-outline flex-1 justify-center py-3 rounded-xl">
                    <ArrowLeft size={16} /> <T>Back</T>
                  </button>
                  <button onClick={bookForm} disabled={busy || !canBill || (bookingMode === 'registration' && !devotee) || (formDupWarning && !formDupConfirmed)} className="btn-maroon flex-1 justify-center py-3 rounded-xl disabled:opacity-50">
                    {busy ? <><Loader2 size={18} className="animate-spin" /> <T>Processing…</T></> : <><Check size={18} /> <T>Book & Pay</T></>}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {bill && <BillReceiptModal bill={bill} onClose={() => setBill(null)} />}

      {/* Sankalpam Details Modal */}
      {showSankalpamModal && (
        <SankalpamModal
          gothram={gothram}
          setGothram={setGothram}
          nakshatram={nakshatram}
          setNakshatram={setNakshatram}
          rasi={rasi}
          setRasi={setRasi}
          beneficiary={beneficiary}
          setBeneficiary={setBeneficiary}
          participants={participants}
          setParticipants={setParticipants}
          specialNotes={specialNotes}
          setSpecialNotes={setSpecialNotes}
          devotee={devotee}
          onClose={() => setShowSankalpamModal(false)}
        />
      )}
    </div>
  )
}

// ── Sankalpam Details Modal ──
// Comprehensive popup for Sankalpam details including family members and special notes.
function SankalpamModal({
  gothram, setGothram,
  nakshatram, setNakshatram,
  rasi, setRasi,
  beneficiary, setBeneficiary,
  participants, setParticipants,
  specialNotes, setSpecialNotes,
  devotee,
  onClose
}) {
  const { lang } = useLang()
  const [newParticipant, setNewParticipant] = useState('')
  const [familyMembers, setFamilyMembers] = useState([])
  const [loadingFamily, setLoadingFamily] = useState(false)

  // Pre-fill from linked devotee if available
  const prefillFromDevotee = () => {
    if (devotee) {
      if (devotee.gothram && !gothram) setGothram(devotee.gothram)
      if (devotee.nakshatram && !nakshatram) setNakshatram(devotee.nakshatram)
    }
  }

  // Fetch family members when devotee is linked
  useEffect(() => {
    prefillFromDevotee()
    if (devotee?.id) {
      setLoadingFamily(true)
      DevoteesAPI.get(devotee.id)
        .then((d) => setFamilyMembers(d.family || []))
        .catch(() => setFamilyMembers([]))
        .finally(() => setLoadingFamily(false))
    } else {
      setFamilyMembers([])
    }
  }, [devotee?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const addParticipant = (name, relation) => {
    if (!name.trim()) return
    const exists = participants.some(p => p.name.toLowerCase() === name.trim().toLowerCase())
    if (exists) return
    setParticipants([...participants, { name: name.trim(), relation: relation || '' }])
  }

  const removeParticipant = (index) => {
    setParticipants(participants.filter((_, i) => i !== index))
  }

  const addFromFamily = (member) => {
    addParticipant(member.name, member.relation)
  }

  const handleAddCustom = () => {
    if (newParticipant.trim()) {
      addParticipant(newParticipant.trim(), '')
      setNewParticipant('')
    }
  }

  const clearAll = () => {
    setGothram('')
    setNakshatram('')
    setRasi('')
    setBeneficiary('')
    setParticipants([])
    setSpecialNotes('')
  }

  const hasFilled = gothram || nakshatram || rasi || beneficiary || participants.length > 0 || specialNotes

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl shadow-xl w-full max-w-lg my-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <FileText size={20} className="text-amber-600" />
            <h3 className="font-bold text-gray-900"><T>Sankalpam Details</T></h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-maroon-700"><X size={18} /></button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Linked devotee hint */}
          {devotee && (devotee.gothram || devotee.nakshatram) && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 text-[0.75rem]">
              <div className="flex items-center justify-between">
                <div className="text-emerald-700">
                  <span className="font-medium"><T>From devotee record</T>:</span>{' '}
                  {[devotee.gothram, devotee.nakshatram].filter(Boolean).join(' · ')}
                </div>
                {(!gothram && !nakshatram) && (
                  <button
                    type="button"
                    onClick={prefillFromDevotee}
                    className="text-emerald-600 font-semibold hover:text-emerald-800"
                  >
                    <T>Use</T>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Section: Astrological Details */}
          <div className="bg-amber-50/30 border border-amber-100 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-amber-800 mb-3 flex items-center gap-2">
              <Moon size={14} />
              <T>Astrological Details</T>
            </h4>
            <div className="grid grid-cols-2 gap-3">
              {/* Gothram */}
              <div>
                <label className="label text-[0.6875rem]"><T>Gothram</T></label>
                <Combobox
                  value={gothram}
                  onChange={(e) => setGothram(e.target.value)}
                  options={GOTHRAMS}
                  placeholder={tr("Select Gothram")}
                  className="!py-1.5 text-sm"
                />
              </div>

              {/* Nakshatram */}
              <div>
                <label className="label text-[0.6875rem]"><T>Nakshatram</T></label>
                <Combobox
                  value={nakshatram}
                  onChange={(e) => setNakshatram(e.target.value)}
                  options={NAKSHATRAMS}
                  placeholder={tr("Select Nakshatram")}
                  className="!py-1.5 text-sm"
                />
              </div>

              {/* Rasi */}
              <div className="col-span-2">
                <label className="label text-[0.6875rem]"><T>Rasi (Zodiac)</T></label>
                <Combobox
                  value={rasi}
                  onChange={(e) => setRasi(e.target.value)}
                  options={RASHIS}
                  placeholder={tr("Select Rasi")}
                  className="!py-1.5 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Section: Beneficiary */}
          <div>
            <label className="label"><T>In the name of</T> <span className="text-gray-400 font-normal">({tr('optional')})</span></label>
            <input
              value={beneficiary}
              onChange={(e) => setBeneficiary(e.target.value)}
              placeholder={tr("Primary person for whom pooja is performed")}
              className="input"
            />
          </div>

          {/* Section: Participants / Family Members */}
          <div className="border-t border-dashed border-gray-200 pt-4">
            <label className="label flex items-center gap-2">
              <User size={14} />
              <T>Additional Participants</T>
              <span className="text-gray-400 font-normal">({tr('optional')})</span>
            </label>

            {/* Current participants */}
            {participants.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {participants.map((p, i) => (
                  <span key={i} className="inline-flex items-center gap-1 bg-maroon-50 text-maroon-700 px-2.5 py-1 rounded-full text-sm">
                    {p.name}
                    {p.relation && <span className="text-maroon-400 text-[0.6875rem]">({p.relation})</span>}
                    <button onClick={() => removeParticipant(i)} className="ml-0.5 text-maroon-400 hover:text-red-600">
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Family members from devotee record */}
            {devotee && familyMembers.length > 0 && (
              <div className="mb-3">
                <p className="text-[0.6875rem] text-gray-500 mb-1.5"><T>Click to add from family</T>:</p>
                <div className="flex flex-wrap gap-1.5">
                  {familyMembers.map((m, i) => {
                    const alreadyAdded = participants.some(p => p.name.toLowerCase() === m.name.toLowerCase())
                    return (
                      <button
                        key={i}
                        onClick={() => !alreadyAdded && addFromFamily(m)}
                        disabled={alreadyAdded}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm border transition ${
                          alreadyAdded
                            ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        }`}
                      >
                        <Plus size={12} />
                        {m.name}
                        {m.relation && <span className="text-[0.6875rem] opacity-70">({m.relation})</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {loadingFamily && devotee && (
              <div className="text-[0.75rem] text-gray-400 mb-3 flex items-center gap-1">
                <Loader2 size={12} className="animate-spin" />
                <T>Loading family members...</T>
              </div>
            )}

            {/* Add custom participant */}
            <div className="flex gap-2">
              <input
                value={newParticipant}
                onChange={(e) => setNewParticipant(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddCustom())}
                placeholder={tr("Type name and press Enter")}
                className="input flex-1 !py-1.5 text-sm"
              />
              <button
                onClick={handleAddCustom}
                disabled={!newParticipant.trim()}
                className="btn-outline !py-1.5 !px-3 text-sm disabled:opacity-50"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* Section: Special Notes */}
          <div className="border-t border-dashed border-gray-200 pt-4">
            <label className="label"><T>Special Instructions</T> <span className="text-gray-400 font-normal">({tr('optional')})</span></label>
            <textarea
              value={specialNotes}
              onChange={(e) => setSpecialNotes(e.target.value)}
              placeholder={tr("Any special requests or notes for the poojari...")}
              rows={2}
              className="input resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
          <button
            onClick={clearAll}
            className="btn-outline flex-1 justify-center text-sm"
            disabled={!hasFilled}
          >
            <X size={14} /> <T>Clear All</T>
          </button>
          <button onClick={onClose} className="btn-maroon flex-1 justify-center text-sm">
            <Check size={14} /> <T>Done</T>
          </button>
        </div>
      </div>
    </div>
  )
}

function BillReceiptModal({ bill, onClose }) {
  const { lang } = useLang()
  const line = bill.lines?.[0] || {}
  const booking = line?.booking || {}
  const isMultiItem = (bill.lines?.length || 0) > 1
  const isDailyOnly = bill.lines?.every((l) => l.category === 'Daily') ?? false
  const modeLabel = bill.mode === 'UPI/QR Code' ? 'UPI / QR Code' : bill.mode

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto print-modal" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-auto max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 print:hidden">
          {bill.failed
            ? <span className="text-sm font-semibold text-amber-700">⚠ Partial — {bill.failed} item(s) not billed</span>
            : <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-emerald-600 text-white grid place-items-center"><Check size={14} /></div>
                <span className="text-sm font-semibold text-emerald-700"><T>Booking Successful!</T></span>
              </div>}
          <button onClick={onClose} className="text-gray-400 hover:text-maroon-700"><X size={18} /></button>
        </div>

        {/* Ticket */}
        <div className="p-5" id="print-area">
          <TicketShell code={booking?.booking_code || bill.ref}>
            {/* Booking & Ticket Numbers */}
            <TF label={tr("Receipt No")} value={bill.ref} mono />
            <TF label={tr("Ticket No")} value={booking?.ticket_no || booking?.booking_code} mono />

            {/* Devotee Info */}
            <TF label={tr("Devotee")} value={<>{bill.name}<span className="block text-[0.6875rem] text-gray-500 font-normal">{bill.mobile}</span></>} />

            {/* Sankalpam (for form bookings) */}
            {bill.isFormBooking && (line._gothram || line._nakshatram || line._rasi) && (
              <TF label={tr("Sankalpam")} value={[line._gothram, line._nakshatram, line._rasi].filter(Boolean).join(' · ')} wide />
            )}
            {bill.isFormBooking && line._beneficiary && (
              <TF label={tr("In the name of")} value={line._beneficiary} />
            )}
            {bill.isFormBooking && line._participants?.length > 0 && (
              <TF label={tr("Participants")} value={line._participants.map(p => p.name).join(', ')} wide />
            )}
            {bill.isFormBooking && line._specialNotes && (
              <TF label={tr("Special Notes")} value={line._specialNotes} wide />
            )}

            {/* Pooja Details - Single Item */}
            {!isMultiItem && (
              <>
                <TF label={tr("Pooja")} value={lang === 'te' && line.name_te ? line.name_te : tr(line.pooja_name || booking?.seva_name || 'Seva')} />
                <TF label={tr("Plan")} value={tr(line.plan_name || booking?.plan_name || 'Daily')} />
                {line.vehicle_no && <TF label={tr("Vehicle No")} value={line.vehicle_no} />}
              </>
            )}

            {/* Pooja Details - Multiple Items */}
            {isMultiItem && (
              <div className="col-span-2 bg-amber-50/50 rounded-lg p-3 -mx-1">
                <div className="text-[0.6875rem] text-gray-500 mb-2">{tr("Poojas Booked")}</div>
                <div className="space-y-1.5">
                  {bill.lines.map((l, i) => (
                    <div key={i} className="flex items-center justify-between text-[0.8125rem]">
                      <span className="text-gray-800">
                        {lang === 'te' && l.name_te ? l.name_te : tr(l.pooja_name || l.booking?.seva_name || 'Seva')}
                        <span className="text-gray-400 text-[0.6875rem] ml-1">· {tr(l.plan_name || l.booking?.plan_name || 'Daily')}</span>
                        {l.vehicle_no && <span className="text-gray-400 text-[0.6875rem] ml-1">· {l.vehicle_no}</span>}
                      </span>
                      <span className="font-semibold text-gray-700">₹{Number(l.amount || l.booking?.amount || 0).toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Schedule (for form bookings) */}
            {bill.isFormBooking && line._schedDate && (
              <TF label={tr("Booking Date")} value={fmtDate(line._schedDate)} />
            )}
            {bill.isFormBooking && line._slot && (
              <TF label={tr("Time Slot")} value={clock12(line._slot)} />
            )}
            {bill.isFormBooking && line._poojari && (
              <TF label={tr("Poojari")} value={line._poojari} />
            )}

            {/* Amount */}
            <div className="bg-amber-100/60 rounded-lg px-3 py-2 col-span-2 flex items-center justify-between">
              <span className="text-[0.6875rem] text-gray-500"><T>Total Amount (₹)</T></span>
              <span className="font-extrabold text-maroon-800 text-lg">₹ {Number(bill.total || 0).toLocaleString('en-IN')}</span>
            </div>

            {/* Payment Info */}
            <TF label={tr("Payment Mode")} value={tr(modeLabel)} />
            <TF label={tr("Payment Date & Time")} value={bill.paidAt} />
            {bill.utr && <TF label={tr("UTR / Transaction ID")} value={bill.utr} mono wide />}

            {/* Multiple ticket numbers */}
            {isMultiItem && (
              <div className="col-span-2 text-[0.6875rem] text-gray-500">
                <span className="font-medium">{tr("Ticket Numbers")}:</span>{' '}
                <span className="font-mono text-gray-700">
                  {bill.lines.map((l) => l.booking?.ticket_no || l.booking?.booking_code).filter(Boolean).join(', ')}
                </span>
              </div>
            )}

            {/* Validity Notice based on Plan Type */}
            {(() => {
              const planName = (line.plan_name || booking?.plan_name || '').toLowerCase()
              const validUntil = booking?.valid_until || line.booking?.valid_until
              const schedDate = booking?.scheduled_date || line.booking?.scheduled_date || line._schedDate

              // Life Long - no expiry
              if (planName.includes('life')) {
                return (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 col-span-2 text-center">
                    <div className="text-[0.6875rem] font-semibold text-emerald-700">✨ <T>Validity</T>: <T>Lifetime</T></div>
                  </div>
                )
              }

              // Monthly/Yearly - show validity period
              if ((planName.includes('month') || planName.includes('year')) && (validUntil || schedDate)) {
                const fromDate = schedDate ? fmtDate(schedDate) : fmtDate(new Date())
                const toDate = validUntil ? fmtDate(validUntil) : null
                return (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 col-span-2">
                    <div className="flex items-center justify-between text-[0.6875rem]">
                      <span className="text-blue-600 font-medium"><T>Validity Period</T>:</span>
                      <span className="font-semibold text-blue-800">
                        {fromDate} → {toDate || <T>As per plan</T>}
                      </span>
                    </div>
                  </div>
                )
              }

              // Daily - same day only
              if (isDailyOnly) {
                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 col-span-2 text-center">
                    <div className="text-[0.6875rem] font-semibold text-amber-700">⚠️ <T>Valid for same day only</T></div>
                  </div>
                )
              }

              return null
            })()}

            {/* Terms & Conditions */}
            <div className="col-span-2 text-[0.5625rem] text-gray-500 leading-relaxed border-t border-dashed border-amber-200 pt-3 mt-1">
              <div className="font-semibold text-gray-600 mb-1"><T>Terms & Conditions</T>:</div>
              <ol className="list-decimal list-inside space-y-0.5 pl-1">
                <li><T>Please arrive 15 minutes before the scheduled pooja time.</T></li>
                <li><T>Ticket is valid only for the date mentioned.</T></li>
                <li><T>Refunds are subject to temple policy.</T></li>
                <li><T>Temple is not responsible for lost or damaged tickets.</T></li>
              </ol>
            </div>
          </TicketShell>
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-5 py-4 border-t border-gray-100 print:hidden">
          <button onClick={() => window.print()} className="btn-outline flex-1 justify-center"><Printer size={15} /> <T>Print Ticket</T></button>
          <button onClick={onClose} className="btn-maroon flex-1 justify-center"><Plus size={15} /> <T>New Booking</T></button>
        </div>
      </div>
    </div>
  )
}
