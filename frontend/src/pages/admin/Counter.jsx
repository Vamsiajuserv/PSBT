import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Printer, Plus, Trash2, Receipt as ReceiptIcon, Search, User, X, IndianRupee, Loader2, Eye, AlertTriangle,
  Check, Flame, CalendarDays, Moon, Car, ShieldCheck, FileText, Clock, RotateCcw, ChevronDown, ChevronUp, CheckCircle2,
} from 'lucide-react'
import { PageHeader } from '../../components/common/UI.jsx'
import { TicketShell, TF } from '../../components/admin/BookingTicket.jsx'
import { Select, DateField, Combobox, CountryCodeSelect, getCountryDigits } from '../../components/common/Field.jsx'
import { PoojasAPI, DevoteesAPI, BookingsAPI, FestivalsAPI, PoojarisAPI, TithiAPI, SettingsAPI } from '../../api/client.js'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from '../../components/common/Dialog.jsx'
import { T, tr, useLang, personName, stamp, clock12 } from '../../i18n/LanguageContext.jsx'
import { sanitizePhone, sanitizeName, validatePhone, sanitizeVehicle } from '../../lib/validation.js'

// ── Constants ──
const CATS = ['All', 'Daily', 'Monthly', 'Long-Term', 'Occasion', 'Festival', 'Vehicle']
const SLOTS = [
  '06:00 AM - 07:00 AM', '07:30 AM - 08:30 AM', '09:00 AM - 10:00 AM',
  '10:30 AM - 11:30 AM', '12:00 PM - 01:00 PM', '04:00 PM - 05:00 PM',
]

// Filter out past time slots for today's bookings
const getAvailableSlots = (date) => {
  if (date !== todayISO()) return SLOTS

  // Get current time in IST
  const now = new Date()
  const nowIST = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))

  return SLOTS.filter(slot => {
    const timeMatch = slot.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
    if (!timeMatch) return true
    let hours = parseInt(timeMatch[1], 10)
    const minutes = parseInt(timeMatch[2], 10)
    const period = timeMatch[3].toUpperCase()
    if (period === 'PM' && hours !== 12) hours += 12
    if (period === 'AM' && hours === 12) hours = 0

    const slotDate = new Date(nowIST)
    slotDate.setHours(hours, minutes, 0, 0)
    return slotDate > nowIST
  })
}

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

const NAKSHATRAMS = [
  'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu',
  'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni', 'Hasta',
  'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha', 'Moola', 'Purva Ashadha',
  'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha', 'Purva Bhadrapada',
  'Uttara Bhadrapada', 'Revati',
]

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

// ── Utility Functions ──
const inr = (n) => '₹ ' + Number(n || 0).toLocaleString('en-IN')
const todayISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) // Returns YYYY-MM-DD in IST
const stampNow = () => stamp(new Date().toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }))
const fmtDate = (d) => {
  if (!d) return '—'
  const date = new Date(d)
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })
}
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

const buildUpiUrl = (upiId, payeeName, amount, note = 'Temple Booking') => {
  if (!upiId) return ''
  const params = new URLSearchParams({ pa: upiId, pn: payeeName || 'Temple', am: String(Number(amount) || 0), cu: 'INR', tn: note })
  return `upi://pay?${params.toString()}`
}

const durDays = (planName) => {
  const n = (planName || '').toLowerCase()
  if (n.includes('life')) return null
  if (n.includes('daily') || n.includes('one')) return 1
  if (n.includes('monthly') || n.includes('month')) return 30
  if (n.includes('year')) return 365
  return 1
}

const validityShort = (planName) => {
  const n = (planName || '').toLowerCase()
  if (n.includes('daily')) return tr('1 Day')
  if (n.includes('monthly') || n.includes('month')) return tr('1 Month')
  if (n.includes('life')) return tr('Lifetime')
  if (n.includes('one')) return tr('One-Time')
  if (n.includes('year')) return tr('1 Year')
  return tr('Selected Date')
}

const validityRange = (planName, fromDate) => {
  const d = durDays(planName)
  if (d === null) return tr('Lifetime')
  const to = addDays(fromDate, d - 1)
  return `${d} ${tr(d > 1 ? 'Days' : 'Day')} (${stamp(fmtDate(fromDate))} ${tr('to')} ${stamp(fmtDate(to))})`
}

const calcExpiry = (bookedDate, planName) => {
  if (!bookedDate) return null
  const d = new Date(bookedDate)
  if (isNaN(d.getTime())) return null
  const pn = (planName || '').toLowerCase()
  if (pn.includes('life')) return tr('Lifetime')
  if (pn.includes('year')) { d.setFullYear(d.getFullYear() + 1); return fmtDate(d) }
  if (pn.includes('monthly') || pn.includes('month')) { d.setDate(d.getDate() + 30); return fmtDate(d) }
  return null
}

// Determine if pooja requires additional booking details
const requiresBookingDetails = (category, planName) => {
  if (category === 'Monthly' || category === 'Festival' || category === 'Occasion' || category === 'Long-Term') return true
  const pn = (planName || '').toLowerCase()
  if (pn.includes('life') || pn.includes('year') || pn.includes('monthly')) return true
  return false
}

const isLifetimePlan = (planName) => /life\s*long|life\s*time|lifetime/i.test(planName || '')

// ── Main Component ──
export default function Counter() {
  const { lang } = useLang()
  const { role } = useOutletContext()
  const canBill = role !== 'Accountant'

  // ── UPI Config ──
  const [upiConfig, setUpiConfig] = useState({ upi_id: '', upi_payee_name: '' })
  useEffect(() => {
    SettingsAPI.config()
      .then((c) => setUpiConfig({ upi_id: c?.upi_id || '', upi_payee_name: c?.upi_payee_name || '' }))
      .catch(() => toast(tr('Failed to load UPI settings'), 'error'))
  }, [])

  // ── Pooja Catalogue ──
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
              plans: p.plans,
            })
          }
        }
        setCatalog(flat)
      })
      .catch((e) => setCatalogErr(e.detail || tr('Could not load the pooja catalogue.')))
  }, [])

  // ── Festival Windows ──
  const [festivals, setFestivals] = useState([])
  useEffect(() => {
    FestivalsAPI.list().then((r) => setFestivals(r.items || r || [])).catch(() => {})
  }, [])

  const festivalFor = (entry) => {
    if (entry.category !== 'Festival') return null
    const t = todayISO()
    const linked = festivals.filter((f) => f.status === 'Active' && f.start_date && f.end_date && (f.pooja_ids || []).includes(entry.pooja_id))
    if (!linked.length) return { none: true }
    const current = linked.find((f) => f.start_date <= t && t <= f.end_date)
    if (current) return { date: t, name: current.name, fest: current }
    const upcoming = linked.filter((f) => f.start_date > t).sort((a, b) => a.start_date.localeCompare(b.start_date))[0]
    if (upcoming) return { date: upcoming.start_date, name: upcoming.name, fest: upcoming }
    return { past: true, windows: linked.map((f) => `${f.name} (${f.start_date} – ${f.end_date})`).join(', ') }
  }

  // ── Poojaris ──
  const [poojaris, setPoojaris] = useState([])
  useEffect(() => {
    PoojarisAPI.list().then((d) => setPoojaris((Array.isArray(d) ? d : d?.items || []).filter((p) => p.active))).catch(() => {})
  }, [])

  // ── Pournami Dates ──
  const [pournamiDates, setPournamiDates] = useState([])
  useEffect(() => {
    TithiAPI.upcoming('Pournami', 3)
      .then((r) => setPournamiDates((r.dates || []).map((d) => d.date)))
      .catch(() => setPournamiDates([]))
  }, [])

  // ── Category Filter ──
  const [cat, setCat] = useState('All')
  const filtered = useMemo(() => {
    const q = sevaQ.trim().toLowerCase()
    return catalog.filter((s) => {
      let catMatch = false
      if (cat === 'All') catMatch = true
      else if (cat === 'Daily') catMatch = s.category === 'Daily' && /daily|per day/i.test(s.plan_name || '')
      else if (cat === 'Monthly') catMatch = /monthly/i.test(s.plan_name || '')
      else if (cat === 'Long-Term') catMatch = s.category === 'Long-Term' || /life|year|long/i.test(s.plan_name || '')
      else catMatch = s.category === cat
      const queryMatch = !q || `${s.pooja_name} ${s.name_te || ''} ${s.plan_name} ${s.category || ''}`.toLowerCase().includes(q)
      return catMatch && queryMatch
    })
  }, [catalog, sevaQ, cat])

  // ── Devotee State ──
  const [mobile, setMobile] = useState('')
  const [mobileError, setMobileError] = useState('')
  const [countryCode, setCountryCode] = useState('+91')
  const [name, setName] = useState('')
  const [mobileResults, setMobileResults] = useState(null)
  const [showMobileDropdown, setShowMobileDropdown] = useState(false)
  const [devotee, setDevotee] = useState(null)
  const searchRef = useRef(0)

  useEffect(() => {
    const m = mobile.trim()
    if (m.length < 4 || devotee) { setMobileResults(null); setShowMobileDropdown(false); return }
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

  // ── Sankalpam (Transaction-Level Shared) ──
  const [gothram, setGothram] = useState('')
  const [nakshatram, setNakshatram] = useState('')
  const [rasi, setRasi] = useState('')
  const [beneficiary, setBeneficiary] = useState('')
  const [participants, setParticipants] = useState([])
  const [specialNotes, setSpecialNotes] = useState('')
  const [sankalpamExpanded, setSankalpamExpanded] = useState(false)
  const [sankalpamSaveState, setSankalpamSaveState] = useState('idle') // 'idle' | 'saving' | 'saved'
  const sankalpamDebounceRef = useRef(null)

  // Debounced Sankalpam save indicator
  const hasSankalpamData = gothram || nakshatram || rasi || beneficiary || participants.length > 0 || specialNotes
  useEffect(() => {
    if (!hasSankalpamData) {
      setSankalpamSaveState('idle')
      return
    }
    setSankalpamSaveState('saving')
    if (sankalpamDebounceRef.current) clearTimeout(sankalpamDebounceRef.current)
    sankalpamDebounceRef.current = setTimeout(() => {
      setSankalpamSaveState('saved')
    }, 400)
    return () => { if (sankalpamDebounceRef.current) clearTimeout(sankalpamDebounceRef.current) }
  }, [gothram, nakshatram, rasi, beneficiary, participants, specialNotes, hasSankalpamData])

  // ── Section Collapse States ──
  const [vehicleExpanded, setVehicleExpanded] = useState(true)
  const [bookingExpanded, setBookingExpanded] = useState(true)

  // ── Existing Devotee "Use Details" State ──
  const [detailsApplied, setDetailsApplied] = useState(false)

  // ── Reset Confirmation State ──
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  const pickDevotee = (d) => {
    setDevotee(d)
    setMobile(d.mobile || '')
    setMobileError('')
    setName(d.name)
    // Don't auto-populate Sankalpam - let user click "Use Details"
    setMobileResults(null)
    setShowMobileDropdown(false)
    setDetailsApplied(false)
  }

  const clearDevotee = () => {
    setDevotee(null)
    setMobile('')
    setMobileError('')
    setName('')
    setGothram('')
    setNakshatram('')
    setRasi('')
    setBeneficiary('')
    setParticipants([])
    setSpecialNotes('')
    setMobileResults(null)
    setShowMobileDropdown(false)
    setDetailsApplied(false)
  }

  // Apply existing devotee's Sankalpam details to current billing
  const applyDevoteeDetails = () => {
    if (!devotee) return
    if (devotee.gothram) setGothram(devotee.gothram)
    if (devotee.nakshatram) setNakshatram(devotee.nakshatram)
    if (devotee.rasi) setRasi(devotee.rasi)
    setDetailsApplied(true)
  }

  // Check if devotee has any usable Sankalpam details
  const devoteeHasSankalpamDetails = devotee && (devotee.gothram || devotee.nakshatram || devotee.rasi)

  const handleMobileChange = (val) => {
    const cleaned = sanitizePhone(val)
    setMobile(cleaned)
    setError('')
    if (countryCode === '+91') {
      if (cleaned.length === 10) {
        const validation = validatePhone(cleaned)
        setMobileError(validation.valid ? '' : tr('Invalid Mobile Number'))
      } else if (cleaned.length >= 1 && cleaned.length < 10) {
        setMobileError(tr('Please Enter 10 digits Mobile Number'))
      } else {
        setMobileError('')
      }
    } else {
      setMobileError('')
    }
    if (devotee && cleaned !== devotee.mobile) setDevotee(null)
  }

  const handleNameChange = (val) => {
    const cleaned = sanitizeName(val)
    setName(cleaned)
    setError('')
    if (devotee && cleaned !== devotee.name) setDevotee(null)
  }

  const autoCreateOrUpdateDevotee = async (bookingMobile, bookingName, bookingGothram, bookingNakshatram, bookingRasi) => {
    if (!bookingMobile || !bookingName || bookingMobile.length !== 10) return null
    try {
      const existing = await DevoteesAPI.list({ q: bookingMobile, size: 10 })
      const exact = (existing.items || []).find(d => d.mobile === bookingMobile && d.name.toLowerCase() === bookingName.toLowerCase())

      if (exact) {
        // Build updates object with all Sankalpam fields that have values
        const updates = {}
        if (bookingGothram) updates.gothram = bookingGothram
        if (bookingNakshatram) updates.nakshatram = bookingNakshatram
        if (bookingRasi) updates.rasi = bookingRasi

        // Only update if there are Sankalpam details to save
        if (Object.keys(updates).length > 0) {
          try {
            console.log('[Devotee Update] Saving Sankalpam for', exact.code, updates)
            await DevoteesAPI.update(exact.id, updates)
            console.log('[Devotee Update] Saved successfully')
          } catch (err) {
            console.error('[Devotee Update] Failed:', err)
          }
        }
        return exact
      }

      // Create new devotee with all Sankalpam details
      const newDev = await DevoteesAPI.create({
        name: bookingName,
        mobile: bookingMobile,
        gothram: bookingGothram || undefined,
        nakshatram: bookingNakshatram || undefined,
        rasi: bookingRasi || undefined
      })
      console.log('[Devotee Create] Created new devotee with Sankalpam:', newDev.code)
      return newDev
    } catch (err) {
      console.error('[Devotee Create/Update] Error:', err)
      return null
    }
  }

  // ── Selected Items (Multi-Select) ──
  const lineSeq = useRef(0)
  const [selected, setSelected] = useState([])

  // ── Payment State ──
  const [mode, setMode] = useState('Cash')
  const [utr, setUtr] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [bill, setBill] = useState(null)

  // ── Duplicate Warnings ──
  const [dupWarnings, setDupWarnings] = useState([])
  const [dupConfirmed, setDupConfirmed] = useState({})

  const hasLifetimeDuplicate = dupWarnings.some(w => isLifetimePlan(w.plan_name))
  const allDupConfirmed = dupWarnings.length === 0 || (!hasLifetimeDuplicate && dupWarnings.every(w => dupConfirmed[w.lineId]))

  const selectedKey = selected.map(c => `${c.pooja_id}-${c.plan_id}`).join(',')
  const mobileFor10 = mobile.trim().length === 10 ? mobile.trim() : null

  // Check duplicates for long-term items
  useEffect(() => {
    if ((!devotee?.id && !mobileFor10) || !selected.length) { setDupWarnings([]); return }
    const longTermItems = selected.filter((x) => x.category === 'Monthly' || x.category === 'Long-Term' || /monthly|life|year/i.test(x.plan_name || ''))
    if (!longTermItems.length) { setDupWarnings([]); return }

    const checkAll = async () => {
      const warnings = []
      for (const item of longTermItems) {
        try {
          const res = await BookingsAPI.checkDuplicate({ devotee_id: devotee?.id, mobile: mobileFor10, pooja_id: item.pooja_id, plan_id: item.plan_id })
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
      setDupConfirmed({})
    }
    checkAll()
  }, [devotee?.id, mobileFor10, selectedKey])

  // ── Toggle Selection ──
  const toggleSelect = (entry) => {
    const isSelected = selected.some(s => s.key === entry.key)
    if (isSelected) {
      setSelected(prev => prev.filter(s => s.key !== entry.key))
    } else {
      // Check committee pricing
      let amount = Number(entry.fee) || 0
      if (entry.category === 'Festival') {
        const fw = festivalFor(entry)
        if (fw?.past) {
          setError(tr('The festival window for this pooja is over') + ` (${fw.windows}).`)
          return
        }
        if (!(amount > 0)) {
          const festFee = Number(fw?.fest?.plan_fees?.[String(entry.plan_id)] || 0)
          if (festFee > 0) amount = festFee
        }
      }
      if ((entry.committee || entry.fee == null) && !(amount > 0)) {
        setError(tr('Awaiting committee decision on pricing.'))
        return
      }

      // Determine default date based on category
      let scheduled_date = todayISO()
      if (entry.category === 'Festival') {
        const fw = festivalFor(entry)
        if (fw?.date) scheduled_date = fw.date
      } else if (entry.category === 'Monthly') {
        if (pournamiDates.length > 0) scheduled_date = pournamiDates[0]
      }

      // Get first available time slot for the scheduled date
      const availableSlots = getAvailableSlots(scheduled_date)
      const defaultSlot = availableSlots.length > 0 ? availableSlots[0] : SLOTS[0]

      setSelected(prev => [...prev, {
        ...entry,
        amount,
        lineId: ++lineSeq.current,
        scheduled_date,
        time_slot: defaultSlot,
        poojari_id: '',
        vehicle_no: '',
      }])
      setError('')
    }
  }

  const removeSelected = (lineId) => {
    setSelected(prev => prev.filter(s => s.lineId !== lineId))
    setError('')
  }

  const updateItemMeta = (lineId, field, value) => {
    setSelected(prev => prev.map(s => s.lineId === lineId ? { ...s, [field]: value } : s))
  }

  const total = selected.reduce((s, x) => s + Number(x.amount || 0), 0)

  // Items requiring booking details
  const itemsNeedingBookingDetails = selected.filter(s => requiresBookingDetails(s.category, s.plan_name))
  const vehicleItems = selected.filter(s => s.category === 'Vehicle')

  // Check if there's meaningful data entered
  const hasMeaningfulData = selected.length > 0 || mobile.trim() || name.trim() ||
    gothram || nakshatram || rasi || beneficiary || participants.length > 0 ||
    specialNotes || utr.trim() || vehicleItems.some(v => v.vehicle_no)

  // ── Full Reset ──
  const fullReset = () => {
    clearDevotee()
    setSelected([])
    setMode('Cash')
    setUtr('')
    setError('')
    setSankalpamExpanded(false)
    setDupWarnings([])
    setDupConfirmed({})
    setDetailsApplied(false)
    setShowResetConfirm(false)
  }

  // Handle Reset button click
  const handleResetClick = () => {
    if (hasMeaningfulData) {
      setShowResetConfirm(true)
    } else {
      fullReset()
    }
  }

  // ── Checkout ──
  const checkout = async () => {
    setError('')
    if (!canBill) { setError(tr('View-only access.')); return }
    if (!name.trim()) { setError(tr('Enter the devotee / payer name.')); return }
    // Validate mobile number - must be exactly 10 digits for Indian numbers
    const mobileTrimmed = mobile.trim()
    if (countryCode === '+91') {
      if (mobileTrimmed.length !== 10) {
        setError(tr('Please Enter 10 digits Mobile Number'))
        setMobileError(tr('Please Enter 10 digits Mobile Number'))
        return
      }
      const mobileValidation = validatePhone(mobileTrimmed)
      if (!mobileValidation.valid) {
        setError(mobileValidation.error)
        setMobileError(tr('Invalid Mobile Number'))
        return
      }
    } else if (!mobileTrimmed) {
      setError(tr('Enter the mobile number.'))
      return
    }
    if (!selected.length) { setError(tr('Select at least one pooja.')); return }
    if (mode === 'UPI/QR Code' && !utr.trim()) { setError(tr('Enter the UTR / Transaction ID.')); return }

    // Validate per-item requirements (Vehicle number is optional)
    for (const item of selected) {
      if (item.category === 'Occasion' && !item.scheduled_date) {
        setError(tr('Select date for') + ` ${item.pooja_name}`)
        return
      }
    }

    // Validate time slots for today's bookings
    const today = todayISO()
    for (const item of selected) {
      const schedDate = item.scheduled_date || today
      if (schedDate === today && item.time_slot) {
        const now = new Date()
        const nowIST = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
        const timeMatch = item.time_slot.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
        if (timeMatch) {
          let hours = parseInt(timeMatch[1], 10)
          const minutes = parseInt(timeMatch[2], 10)
          const period = timeMatch[3].toUpperCase()
          if (period === 'PM' && hours !== 12) hours += 12
          if (period === 'AM' && hours === 12) hours = 0
          const slotTime = new Date(nowIST)
          slotTime.setHours(hours, minutes, 0, 0)
          if (slotTime <= nowIST) {
            setError(tr('The selected time slot has already passed for') + ` ${item.pooja_name}. ` + tr('Please choose a future time slot or a different date.'))
            return
          }
        }
      }
    }

    // Check for unconfirmed duplicates
    if (!allDupConfirmed) {
      if (hasLifetimeDuplicate) {
        setError(tr('Cannot proceed - Lifetime plan duplicate detected.'))
        return
      }
      setError(tr('Please confirm duplicate plan acknowledgements.'))
      return
    }

    setBusy(true)
    const originalItems = [...selected]

    try {
      const items = originalItems.map((item) => ({
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
        time_slot: item.time_slot || undefined,
        vehicle_no: item.vehicle_no?.trim() || undefined,
        gothram: gothram.trim() || undefined,
        nakshatram: nakshatram.trim() || undefined,
        rasi: rasi.trim() || undefined,
        beneficiary_name: beneficiary.trim() || undefined,
        participants: participants.length > 0 ? JSON.stringify(participants) : undefined,
        special_notes: specialNotes.trim() || undefined,
        source: 'Counter',
      }))

      const result = await BookingsAPI.bulkQuickCreate({ items, payment_method: mode })
      if (!result || typeof result !== 'object') throw new Error('Invalid response')

      const successItems = result.success || []
      const done = successItems.map((s) => {
        const cartItem = originalItems[s.index] || {}
        return {
          ...cartItem,
          pooja_name: cartItem.pooja_name || s.seva_name || 'Seva',
          plan_name: cartItem.plan_name || s.plan_name || 'Daily',
          amount: cartItem.amount || s.amount || 0,
          booking: { id: s.id, booking_code: s.booking_code, ticket_no: s.ticket_no, receipt_no: s.receipt_no, seva_name: s.seva_name, plan_name: s.plan_name, amount: s.amount, valid_until: s.valid_until, scheduled_date: s.scheduled_date },
        }
      })

      const failedCount = result.failed_count || 0

      setBill({
        lines: done,
        total: done.reduce((s, x) => s + Number(x.amount || 0), 0),
        name: name.trim(),
        mobile: mobile.trim(),
        mode,
        utr: utr.trim(),
        ref: done[0]?.booking?.receipt_no || done[0]?.booking?.booking_code,
        paidAt: stampNow(),
        failed: failedCount,
        _gothram: gothram,
        _nakshatram: nakshatram,
        _rasi: rasi,
        _beneficiary: beneficiary,
        _participants: participants,
        _specialNotes: specialNotes,
      })

      // Save/update devotee with Sankalpam details for future bookings
      if (done.length > 0) {
        autoCreateOrUpdateDevotee(mobile.trim(), name.trim(), gothram.trim(), nakshatram.trim(), rasi.trim())
      }

      if (failedCount) {
        const firstError = result.failed?.[0]?.error || tr('Unknown error')
        setError(`${done.length} ${tr('item(s) billed')}; ${failedCount} ${tr('failed')}. ${firstError}`)
      } else {
        setSelected([])
        clearDevotee()
        setUtr('')
        setSankalpamExpanded(false)
      }
    } catch (err) {
      console.error('Billing error:', err)
      setError(err.detail || err.message || tr('Billing failed.'))
    }

    setBusy(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50/80 via-orange-50/40 to-amber-50/60">
      <div className="px-4">
        <PageHeader
          title={tr("Counter Billing")}
          action={
            <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-800 font-medium">{tr('Counter')} 1 · {tr(role)}</span>
          }
        />
      </div>

      {catalogErr && <div className="mx-4 mt-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{catalogErr}</div>}
      {!canBill && (
        <div className="mx-4 mt-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-sm px-4 py-2 flex items-center gap-2">
          <Eye size={14} /> <T>View-only access — Accountant role cannot issue receipts.</T>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[55fr_45fr] gap-2 px-4 pb-4">
        {/* ══════════════════════════════════════════════════════════════════════════
            LEFT PANEL: Devotee Details + Pooja Selection
        ══════════════════════════════════════════════════════════════════════════ */}
        <div className="space-y-2 h-[calc(100vh-140px)] flex flex-col">
          {/* Devotee Details */}
          <div className="bg-white rounded-xl border border-amber-200/60 shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <User size={14} className="text-amber-600" />
              <T>Devotee Details</T>
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <label className="text-xs font-medium text-gray-600 mb-1 block"><T>Mobile</T> *</label>
                <div className="flex">
                  <CountryCodeSelect value={countryCode} onChange={(e) => setCountryCode(e.target.value)} className="!rounded-r-none !text-xs !py-2" />
                  <input
                    value={mobile}
                    onChange={(e) => handleMobileChange(e.target.value)}
                    placeholder={tr("Enter Mobile Number")}
                    maxLength={getCountryDigits(countryCode)}
                    className={`input flex-1 !rounded-l-none !text-sm !py-2 ${mobileError ? 'border-red-400' : ''}`}
                  />
                </div>
                {mobileError && <p className="text-[10px] text-red-600 mt-0.5">{mobileError}</p>}
                {showMobileDropdown && mobileResults?.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                    <div className="px-3 py-1.5 bg-gray-50 border-b text-[10px] text-gray-600 font-medium"><T>Select to auto-fill</T></div>
                    {mobileResults.map((d) => (
                      <button key={d.id} onClick={() => pickDevotee(d)} className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 flex items-center justify-between border-b border-gray-50 last:border-0">
                        <span className="font-medium text-gray-800">{personName(d, lang)}</span>
                        <span className="text-gray-500 text-xs">{d.mobile}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block"><T>Name</T> *</label>
                <input value={name} onChange={(e) => handleNameChange(e.target.value)} placeholder={tr("Devotee Name")} className="input !text-sm !py-2" />
              </div>
            </div>
            {/* Existing Devotee Strip */}
            {devotee && (
              <div className="mt-3 border border-gray-200 bg-cream-50 rounded-lg px-3 py-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-xs text-emerald-700">
                      <Check size={12} className="text-emerald-600 shrink-0" />
                      <span className="font-medium"><T>Existing devotee found</T></span>
                    </div>
                    {devoteeHasSankalpamDetails ? (
                      <div className="text-[11px] text-gray-600 mt-0.5 ml-4">
                        {[
                          devotee.gothram && `${tr('Gothram')}: ${devotee.gothram}`,
                          devotee.nakshatram && `${tr('Nakshatram')}: ${devotee.nakshatram}`,
                          devotee.rasi && `${tr('Rasi')}: ${devotee.rasi}`
                        ].filter(Boolean).join(' · ')}
                      </div>
                    ) : (
                      <div className="text-[11px] text-gray-400 mt-0.5 ml-4 italic">
                        <T>No Sankalpam details available</T>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {devoteeHasSankalpamDetails && (
                      detailsApplied ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
                          <CheckCircle2 size={12} />
                          <T>Applied</T>
                        </span>
                      ) : (
                        <button
                          onClick={applyDevoteeDetails}
                          className="text-[10px] px-2 py-1 rounded border border-amber-300 bg-amber-50 text-amber-700 font-medium hover:bg-amber-100 transition-colors"
                        >
                          <T>Use Details</T>
                        </button>
                      )
                    )}
                    <button onClick={clearDevotee} className="text-[10px] text-gray-500 hover:text-red-600 font-medium">
                      <X size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Pooja Selection */}
          <div className="bg-white rounded-xl border border-amber-200/60 shadow-sm p-4 flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                <Flame size={14} className="text-amber-600" />
                <T>Select Pooja</T>
                {selected.length > 0 && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-maroon-100 text-maroon-700 font-medium">{selected.length} {tr('selected')}</span>}
              </h3>
              <div className="relative w-48">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={sevaQ} onChange={(e) => setSevaQ(e.target.value)} placeholder={tr("Search...")} className="input !pl-8 !py-1.5 !text-xs" />
              </div>
            </div>

            {/* Category Filters */}
            <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1 scrollbar-thin">
              {CATS.map((c) => (
                <button key={c} onClick={() => setCat(c)} className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-150 ${cat === c ? 'bg-maroon-700 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-maroon-50 hover:text-maroon-700'}`}>
                  {tr(c)}
                </button>
              ))}
            </div>

            {/* Pooja Grid */}
            {catalog.length === 0 && !catalogErr && (
              <div className="flex items-center justify-center py-8 text-gray-500">
                <Loader2 size={20} className="animate-spin mr-2" />
                <span className="text-sm"><T>Loading poojas...</T></span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 flex-1 overflow-y-auto pr-1 scrollbar-thin">
              {filtered.map((s) => {
                const isSelected = selected.some(sel => sel.key === s.key)
                return (
                  <button
                    key={s.key}
                    onClick={() => toggleSelect(s)}
                    className={`relative flex items-start gap-2.5 border-2 rounded-lg px-3 py-2.5 text-left transition-all duration-150 ${isSelected ? 'border-maroon-500 bg-maroon-50/50 shadow-sm' : 'border-gray-200 hover:border-amber-300 hover:bg-amber-50/30'}`}
                  >
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all duration-150 ${isSelected ? 'border-maroon-600 bg-maroon-600' : 'border-gray-300'}`}>
                      {isSelected && <Check size={10} className="text-white" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-800 leading-tight truncate">{lang === 'te' && s.name_te ? s.name_te : s.pooja_name}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-gray-500">{tr(s.plan_name)}</span>
                        {s.category === 'Vehicle' && <Car size={10} className="text-gray-400" />}
                        {s.category === 'Festival' && <CalendarDays size={10} className="text-gray-400" />}
                        {s.category === 'Monthly' && <Moon size={10} className="text-gray-400" />}
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-amber-700 shrink-0">₹{Number(s.fee || 0).toLocaleString('en-IN')}</span>
                  </button>
                )
              })}
              {filtered.length === 0 && catalog.length > 0 && <p className="text-sm text-gray-500 col-span-2 text-center py-8"><T>No matching poojas.</T></p>}
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════════
            RIGHT PANEL: Bill Summary + Details + Payment
            Structure: Fixed Header → Scrollable Body → Fixed Footer
        ══════════════════════════════════════════════════════════════════════════ */}
        <div className="bg-white rounded-xl border border-amber-200/60 shadow-sm flex flex-col h-[calc(100vh-140px)]">
          {/* Fixed Header */}
          <div className="flex-shrink-0 px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-maroon-700 to-maroon-800 rounded-t-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-white/20 grid place-items-center">
                  <ReceiptIcon size={16} className="text-white" />
                </div>
                <div>
                  <h3 className="text-white font-semibold text-sm">{lang === 'te' ? 'బిల్ / రసీదు' : 'Bill / రసీదు'}</h3>
                  <p className="text-white/70 text-[10px]"><T>Review selected poojas and complete billing</T></p>
                </div>
              </div>
              <button
                onClick={handleResetClick}
                className="flex items-center gap-1 px-2 py-1 rounded border border-white/30 bg-white/10 text-white/90 text-[10px] font-medium hover:bg-white/20 transition-colors"
              >
                <RotateCcw size={12} />
                <T>Reset</T>
              </button>
            </div>
          </div>

          {/* Scrollable Body - min-h-0 prevents flex item from overflowing */}
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2 pb-4">
            {/* Selected Items */}
            <div className="border border-gray-200 rounded-lg p-3">
              <div className="text-xs font-semibold text-gray-700 mb-2 flex items-center justify-between">
                <span><T>Selected Items</T> ({selected.length})</span>
                {selected.length > 0 && <span className="text-amber-700">{inr(total)}</span>}
              </div>
              {selected.length === 0 ? (
                <div className="text-center py-5 border-2 border-dashed border-gray-200 rounded-lg" style={{ minHeight: '80px' }}>
                  <ReceiptIcon size={24} className="mx-auto text-gray-300 mb-1.5" />
                  <p className="text-sm text-gray-500"><T>No items selected</T></p>
                  <p className="text-xs text-gray-400"><T>Select a pooja from the left</T></p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {selected.map((item, idx) => (
                    <div key={item.lineId} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 group">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-800 truncate">{lang === 'te' && item.name_te ? item.name_te : item.pooja_name}</div>
                        <div className="text-[10px] text-gray-500 flex items-center gap-1.5">
                          {tr(item.plan_name)}
                          {item.category === 'Vehicle' && item.vehicle_no && <span className="text-amber-600">· {item.vehicle_no}</span>}
                          {item.scheduled_date && item.scheduled_date !== todayISO() && <span className="text-blue-600">· {stamp(fmtDate(item.scheduled_date))}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-semibold text-gray-700">₹{Number(item.amount || 0).toLocaleString('en-IN')}</span>
                        <button onClick={() => removeSelected(item.lineId)} className="w-6 h-6 rounded bg-white border border-gray-200 grid place-items-center text-gray-400 hover:text-red-500 hover:border-red-300">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Duplicate Warnings */}
            {dupWarnings.length > 0 && (
              <div className="space-y-2">
                {dupWarnings.map((w) => {
                  const isLifetime = isLifetimePlan(w.plan_name)
                  return (
                    <div key={w.lineId} className={`rounded-lg px-3 py-2 border-2 ${isLifetime ? 'bg-red-50 border-red-300' : dupConfirmed[w.lineId] ? 'bg-emerald-50 border-emerald-300' : 'bg-orange-50 border-orange-300'}`}>
                      <div className="flex items-start gap-2">
                        <AlertTriangle size={14} className={`shrink-0 mt-0.5 ${isLifetime ? 'text-red-600' : 'text-orange-600'}`} />
                        <div className="text-xs flex-1">
                          <div className="font-semibold text-gray-800">{isLifetime ? tr('Lifetime Plan Exists') : tr('Active Plan Exists')}</div>
                          <div className="text-gray-600 mt-0.5">{w.pooja_name} · {w.plan_name}</div>
                          {!isLifetime && (
                            <label className="mt-2 flex items-start gap-2 cursor-pointer">
                              <input type="checkbox" checked={!!dupConfirmed[w.lineId]} onChange={(e) => setDupConfirmed(prev => ({ ...prev, [w.lineId]: e.target.checked }))} className="mt-0.5 w-3.5 h-3.5 rounded border-gray-300 text-emerald-600" />
                              <span className="text-[10px] text-gray-600"><T>I confirm the devotee wants to proceed</T></span>
                            </label>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Vehicle Details (Per-Item) - Vehicle number is optional */}
            {vehicleItems.length > 0 && (
              <CollapsibleSection title={tr("Vehicle Details")} subtitle={tr("Optional")} icon={<Car size={14} />} expanded={vehicleExpanded} onToggle={() => setVehicleExpanded(!vehicleExpanded)} hasData={vehicleItems.some(v => v.vehicle_no)}>
                <div className="space-y-2">
                  {vehicleItems.map((item) => (
                    <div key={item.lineId} className="bg-gray-50 rounded-lg px-3 py-2">
                      <div className="text-xs font-medium text-gray-700 mb-1.5">{item.pooja_name}</div>
                      <input
                        value={item.vehicle_no || ''}
                        onChange={(e) => updateItemMeta(item.lineId, 'vehicle_no', sanitizeVehicle(e.target.value))}
                        placeholder={tr("Enter Vehicle Number (e.g., TS 09 AB 1234)")}
                        className="input !text-sm !py-1.5 w-full"
                        maxLength={12}
                      />
                    </div>
                  ))}
                </div>
              </CollapsibleSection>
            )}

            {/* Booking Details (Per-Item for Monthly/Festival/Occasion/Long-Term) */}
            {itemsNeedingBookingDetails.length > 0 && (
              <CollapsibleSection title={tr("Booking Details")} subtitle={tr("Required")} icon={<CalendarDays size={14} />} expanded={bookingExpanded} onToggle={() => setBookingExpanded(!bookingExpanded)} hasData={true}>
                <div className="space-y-3">
                  {itemsNeedingBookingDetails.map((item) => (
                    <BookingItemDetails
                      key={item.lineId}
                      item={item}
                      updateMeta={(field, value) => updateItemMeta(item.lineId, field, value)}
                      pournamiDates={pournamiDates}
                      festivalFor={festivalFor}
                      poojaris={poojaris}
                      lang={lang}
                    />
                  ))}
                </div>
              </CollapsibleSection>
            )}

            {/* Sankalpam (Shared Transaction-Level) - Only show when poojas are selected */}
            {selected.length > 0 && (
              <SankalpamSection
                expanded={sankalpamExpanded}
                onToggle={() => setSankalpamExpanded(!sankalpamExpanded)}
                saveState={sankalpamSaveState}
                hasData={hasSankalpamData}
              >
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-medium text-gray-600 mb-1 block"><T>Gothram</T></label>
                      <Combobox value={gothram} onChange={(e) => setGothram(e.target.value)} options={GOTHRAMS} placeholder={tr("Select")} className="!py-1.5 !text-xs" />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-gray-600 mb-1 block"><T>Nakshatram</T></label>
                      <Combobox value={nakshatram} onChange={(e) => setNakshatram(e.target.value)} options={NAKSHATRAMS} placeholder={tr("Select")} className="!py-1.5 !text-xs" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-[10px] font-medium text-gray-600 mb-1 block"><T>Rasi</T></label>
                      <Combobox value={rasi} onChange={(e) => setRasi(e.target.value)} options={RASHIS} placeholder={tr("Select")} className="!py-1.5 !text-xs" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-gray-600 mb-1 block"><T>Beneficiary</T></label>
                    <input value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)} placeholder={tr("Person for whom pooja is performed")} className="input !text-xs !py-1.5" />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-gray-600 mb-1 block"><T>Participants</T></label>
                    <ParticipantsInput participants={participants} setParticipants={setParticipants} devotee={devotee} />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-gray-600 mb-1 block"><T>Special Notes</T></label>
                    <textarea value={specialNotes} onChange={(e) => setSpecialNotes(e.target.value)} placeholder={tr("Special instructions...")} rows={2} className="input !text-xs !py-1.5 resize-none" />
                  </div>
                </div>
              </SankalpamSection>
            )}

            {/* Payment Method */}
            {selected.length > 0 && (
              <div className="border border-gray-200 rounded-lg p-3">
                <div className="text-xs font-semibold text-gray-700 mb-2"><T>Payment Method</T></div>
                <div className="grid grid-cols-2 gap-2">
                  {['Cash', 'UPI/QR Code'].map((m) => (
                    <button key={m} onClick={() => { setMode(m); setError('') }} className={`flex items-center justify-center gap-2 rounded-lg border-2 py-2.5 text-sm font-medium transition-all duration-150 ${mode === m ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-gray-200 text-gray-600 hover:border-amber-300'}`}>
                      <IndianRupee size={16} />
                      {tr(m === 'UPI/QR Code' ? 'UPI / QR Code' : m)}
                    </button>
                  ))}
                </div>
                {mode === 'UPI/QR Code' && (
                  <div className="mt-3 space-y-3">
                    {upiConfig.upi_id && total > 0 && (
                      <div className="flex flex-col items-center bg-gray-50 border border-gray-200 rounded-lg p-3">
                        <div className="bg-white p-2 rounded-lg border border-gray-100 shadow-sm">
                          <QRCodeSVG value={buildUpiUrl(upiConfig.upi_id, upiConfig.upi_payee_name, total, 'Temple Seva')} size={120} level="M" />
                        </div>
                        <p className="text-[10px] text-gray-500 mt-2 text-center"><T>Scan to pay</T> · {upiConfig.upi_id}</p>
                      </div>
                    )}
                    <div>
                      <label className="text-[10px] font-medium text-gray-600 mb-1 block"><T>UTR / Transaction ID</T> *</label>
                      <input value={utr} onChange={(e) => setUtr(e.target.value)} placeholder={tr("Enter UTR")} className="input !text-sm !py-2" />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Fixed Footer - Total & Checkout */}
          <div className="flex-shrink-0 px-4 py-3 border-t border-gray-200 bg-white rounded-b-xl shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
            {error && <div className="mb-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 font-medium text-center">{error}</div>}
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-600"><T>Total Amount</T></span>
              <span className="text-xl font-bold text-maroon-700">{inr(total)}</span>
            </div>
            <button onClick={checkout} disabled={busy || !selected.length || !canBill} className="w-full bg-gradient-to-r from-maroon-700 to-maroon-800 text-white rounded-lg py-3 text-sm font-semibold flex items-center justify-center gap-2 hover:from-maroon-800 hover:to-maroon-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm">
              {busy ? <><Loader2 size={16} className="animate-spin" /> <T>Processing...</T></> : <><ReceiptIcon size={16} /> <T>Complete Billing</T></>}
            </button>
          </div>
        </div>
      </div>

      {bill && <BillReceiptModal bill={bill} onClose={() => { setBill(null); setError('') }} lang={lang} />}

      {/* Reset Confirmation Dialog */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowResetConfirm(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 grid place-items-center">
                <AlertTriangle size={20} className="text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-800"><T>Reset current billing?</T></h3>
                <p className="text-xs text-gray-500 mt-0.5"><T>All selected poojas and entered details will be cleared.</T></p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <T>Cancel</T>
              </button>
              <button
                onClick={fullReset}
                className="px-4 py-2 rounded-lg bg-maroon-700 text-white text-sm font-medium hover:bg-maroon-800 transition-colors"
              >
                <T>Reset</T>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// SUBCOMPONENTS
// ══════════════════════════════════════════════════════════════════════════════

function CollapsibleSection({ title, subtitle, icon, expanded, onToggle, hasData, children }) {
  return (
    <div className={`border rounded-lg overflow-hidden transition-all duration-200 ${hasData ? 'border-amber-300 bg-amber-50/30' : 'border-gray-200'}`}>
      <button onClick={onToggle} className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-gray-50/50 transition-colors duration-150">
        <div className="flex items-center gap-2">
          <span className="text-amber-600">{icon}</span>
          <span className="text-xs font-semibold text-gray-800">{title}</span>
          {hasData && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
          <span className="text-[10px] text-gray-500">· {subtitle}</span>
        </div>
        {expanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>
      <div className={`transition-all duration-200 ease-in-out ${expanded ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
        <div className="px-3 pb-3">{children}</div>
      </div>
    </div>
  )
}

// Sankalpam section with save state indicator
function SankalpamSection({ expanded, onToggle, saveState, hasData, children }) {
  const getSaveIndicator = () => {
    if (saveState === 'saving') return { text: tr('Saving...'), color: 'text-amber-600', icon: null }
    if (saveState === 'saved') return { text: tr('Saved'), color: 'text-emerald-600', icon: <CheckCircle2 size={12} className="text-emerald-600" /> }
    return { text: tr('Optional'), color: 'text-gray-500', icon: null }
  }
  const indicator = getSaveIndicator()

  return (
    <div className={`border rounded-lg overflow-hidden transition-all duration-200 ${hasData ? 'border-emerald-300 bg-emerald-50/20' : 'border-gray-200'}`}>
      <button onClick={onToggle} className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-gray-50/50 transition-colors duration-150">
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-amber-600" />
          <span className="text-xs font-semibold text-gray-800">{tr('Sankalpam Details')}</span>
          {indicator.icon}
          <span className={`text-[10px] ${indicator.color}`}>· {indicator.text}</span>
        </div>
        {expanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>
      <div className={`transition-all duration-200 ease-in-out ${expanded ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
        <div className="px-3 pb-3">{children}</div>
      </div>
    </div>
  )
}

function BookingItemDetails({ item, updateMeta, pournamiDates, festivalFor, poojaris, lang }) {
  const fw = item.category === 'Festival' ? festivalFor(item) : null

  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2.5">
      <div className="text-xs font-medium text-gray-800 mb-2 flex items-center gap-1.5">
        {item.category === 'Monthly' && <Moon size={12} className="text-blue-600" />}
        {item.category === 'Festival' && <CalendarDays size={12} className="text-amber-600" />}
        {item.category === 'Occasion' && <Flame size={12} className="text-orange-600" />}
        {item.category === 'Long-Term' && <ShieldCheck size={12} className="text-maroon-600" />}
        {lang === 'te' && item.name_te ? item.name_te : item.pooja_name}
        <span className="text-[10px] text-gray-500 font-normal">· {tr(item.plan_name)}</span>
      </div>

      <div className="space-y-2">
        {/* Monthly: Pournami Dates */}
        {item.category === 'Monthly' && (
          <div>
            <label className="text-[10px] font-medium text-gray-600 mb-1 block flex items-center gap-1">
              <Moon size={10} /> <T>Pournami Date</T>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {pournamiDates.map((d) => (
                <button key={d} onClick={() => updateMeta('scheduled_date', d)} className={`px-2 py-1 rounded text-[10px] font-medium transition-all duration-150 ${item.scheduled_date === d ? 'bg-blue-600 text-white' : 'bg-white border border-blue-200 text-blue-700 hover:bg-blue-50'}`}>
                  {stamp(fmtDate(d))}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Festival: Date within window */}
        {item.category === 'Festival' && fw?.fest && (
          <div>
            <label className="text-[10px] font-medium text-gray-600 mb-1 block flex items-center gap-1">
              <CalendarDays size={10} /> <T>Festival Date</T>
              <span className="text-[9px] text-amber-600 ml-1">({fw.name}: {stamp(fmtDate(fw.fest.start_date))} – {stamp(fmtDate(fw.fest.end_date))})</span>
            </label>
            <DateField value={item.scheduled_date} min={fw.fest.start_date} max={fw.fest.end_date} onChange={(e) => updateMeta('scheduled_date', e.target.value)} className="!py-1.5 !text-xs" />
          </div>
        )}

        {/* Occasion: Date + Time + Poojari */}
        {item.category === 'Occasion' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-medium text-gray-600 mb-1 block"><T>Date</T></label>
                <DateField value={item.scheduled_date} min={todayISO()} onChange={(e) => {
                  updateMeta('scheduled_date', e.target.value)
                  // Auto-select first available slot when date changes
                  const available = getAvailableSlots(e.target.value)
                  if (available.length > 0 && !available.includes(item.time_slot)) {
                    updateMeta('time_slot', available[0])
                  }
                }} className="!py-1.5 !text-xs" />
              </div>
              <div>
                <label className="text-[10px] font-medium text-gray-600 mb-1 block"><T>Time Slot</T></label>
                {(() => {
                  const availableSlots = getAvailableSlots(item.scheduled_date)
                  return availableSlots.length === 0 ? (
                    <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5"><T>All slots passed. Select future date.</T></div>
                  ) : (
                    <Select value={item.time_slot} onChange={(e) => updateMeta('time_slot', e.target.value)} className="!py-1.5 !text-xs">
                      {availableSlots.map((s) => <option key={s} value={s}>{clock12(s)}</option>)}
                    </Select>
                  )
                })()}
              </div>
            </div>
            <div>
              <label className="text-[10px] font-medium text-gray-600 mb-1 block"><T>Poojari</T></label>
              <Select value={item.poojari_id || ''} onChange={(e) => updateMeta('poojari_id', e.target.value)} className="!py-1.5 !text-xs">
                <option value="">{tr("Not assigned")}</option>
                {poojaris.map((p) => <option key={p.id} value={p.id}>{personName(p, lang)}</option>)}
              </Select>
            </div>
          </>
        )}

        {/* Long-Term: Show validity info */}
        {item.category === 'Long-Term' && (
          <div className="bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5">
            <div className="text-[10px] text-emerald-700 flex items-center justify-between">
              <span><T>Validity</T>:</span>
              <span className="font-medium">{validityRange(item.plan_name, item.scheduled_date)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ParticipantsInput({ participants, setParticipants, devotee }) {
  const [newName, setNewName] = useState('')
  const [familyMembers, setFamilyMembers] = useState([])

  useEffect(() => {
    if (devotee?.id) {
      DevoteesAPI.get(devotee.id).then((d) => setFamilyMembers(d.family || [])).catch(() => setFamilyMembers([]))
    } else {
      setFamilyMembers([])
    }
  }, [devotee?.id])

  const addParticipant = (name, relation = '') => {
    if (!name.trim()) return
    if (participants.some(p => p.name.toLowerCase() === name.trim().toLowerCase())) return
    setParticipants([...participants, { name: name.trim(), relation }])
  }

  return (
    <div className="space-y-2">
      {participants.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {participants.map((p, i) => (
            <span key={i} className="inline-flex items-center gap-1 bg-maroon-50 text-maroon-700 px-2 py-0.5 rounded-full text-[10px]">
              {p.name}
              <button onClick={() => setParticipants(participants.filter((_, j) => j !== i))} className="text-maroon-400 hover:text-red-600"><X size={10} /></button>
            </span>
          ))}
        </div>
      )}
      {familyMembers.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {familyMembers.map((m, i) => {
            const added = participants.some(p => p.name.toLowerCase() === m.name.toLowerCase())
            return (
              <button key={i} onClick={() => !added && addParticipant(m.name, m.relation)} disabled={added} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border transition-colors ${added ? 'bg-gray-100 text-gray-400 border-gray-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'}`}>
                <Plus size={10} /> {m.name}
              </button>
            )
          })}
        </div>
      )}
      <div className="flex gap-1.5">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addParticipant(newName), setNewName(''))} placeholder={tr("Add participant")} className="input flex-1 !text-xs !py-1" />
        <button onClick={() => { addParticipant(newName); setNewName('') }} disabled={!newName.trim()} className="btn-outline !py-1 !px-2 text-xs disabled:opacity-50"><Plus size={12} /></button>
      </div>
    </div>
  )
}

function BillReceiptModal({ bill, onClose, lang }) {
  const line = bill.lines?.[0] || {}
  const booking = line?.booking || {}
  const isMultiItem = (bill.lines?.length || 0) > 1
  const isDailyOnly = bill.lines?.every((l) => l.category === 'Daily') ?? false
  const modeLabel = bill.mode === 'UPI/QR Code' ? 'UPI / QR Code' : bill.mode

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto print-modal" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-auto max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 print:hidden">
          {bill.failed
            ? <span className="text-sm font-semibold text-amber-700">⚠ {tr('Partial')} — {bill.failed} {tr('item(s) not billed')}</span>
            : <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-emerald-600 text-white grid place-items-center"><Check size={14} /></div>
                <span className="text-sm font-semibold text-emerald-700"><T>Booking Successful!</T></span>
              </div>}
          <button onClick={onClose} className="text-gray-600 hover:text-maroon-700"><X size={18} /></button>
        </div>

        <div className="p-5" id="print-area">
          <TicketShell code={booking?.booking_code || bill.ref}>
            <TF label={tr("Receipt No")} value={bill.ref} mono />
            <TF label={tr("Ticket No")} value={booking?.ticket_no || booking?.booking_code} mono />
            <TF label={tr("Devotee")} value={<>{personName({ name: bill.name }, lang)}<span className="block text-[0.6875rem] text-gray-700 font-normal">{bill.mobile}</span></>} />

            {(bill._gothram || bill._nakshatram || bill._rasi) && (
              <TF label={tr("Sankalpam")} value={[bill._gothram, bill._nakshatram, bill._rasi].filter(Boolean).join(' · ')} wide />
            )}
            {bill._beneficiary && <TF label={tr("In the name of")} value={bill._beneficiary} />}
            {bill._participants?.length > 0 && (
              <TF label={tr("Participants")} value={bill._participants.map(p => personName({ name: p.name }, lang)).join(', ')} wide />
            )}
            {bill._specialNotes && <TF label={tr("Special Notes")} value={bill._specialNotes} wide />}

            {!isMultiItem && (
              <>
                <TF label={tr("Pooja")} value={lang === 'te' && line.name_te ? line.name_te : tr(line.pooja_name || booking?.seva_name || 'Seva')} />
                <TF label={tr("Plan")} value={tr(line.plan_name || booking?.plan_name || 'Daily')} />
                {line.vehicle_no && <TF label={tr("Vehicle No")} value={line.vehicle_no} />}
              </>
            )}

            {isMultiItem && (
              <div className="col-span-2 bg-amber-50/50 rounded-lg p-3 -mx-1">
                <div className="text-[0.6875rem] text-gray-700 mb-2">{tr("Poojas Booked")}</div>
                <div className="space-y-1.5">
                  {bill.lines.map((l, i) => (
                    <div key={i} className="flex items-center justify-between text-[0.8125rem]">
                      <span className="text-gray-800">
                        {lang === 'te' && l.name_te ? l.name_te : tr(l.pooja_name || l.booking?.seva_name || 'Seva')}
                        <span className="text-gray-600 text-[0.6875rem] ml-1">· {tr(l.plan_name || l.booking?.plan_name || 'Daily')}</span>
                        {l.vehicle_no && <span className="text-gray-600 text-[0.6875rem] ml-1">· {l.vehicle_no}</span>}
                      </span>
                      <span className="font-semibold text-gray-700">₹{Number(l.amount || l.booking?.amount || 0).toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-amber-100/60 rounded-lg px-3 py-2 col-span-2 flex items-center justify-between">
              <span className="text-[0.6875rem] text-gray-700"><T>Total Amount (₹)</T></span>
              <span className="font-extrabold text-maroon-800 text-lg">₹ {Number(bill.total || 0).toLocaleString('en-IN')}</span>
            </div>

            <TF label={tr("Payment Mode")} value={tr(modeLabel)} />
            <TF label={tr("Payment Date & Time")} value={bill.paidAt} />
            {bill.utr && <TF label={tr("UTR / Transaction ID")} value={bill.utr} mono wide />}

            {isMultiItem && (
              <div className="col-span-2 text-[0.6875rem] text-gray-700">
                <span className="font-medium">{tr("Ticket Numbers")}:</span>{' '}
                <span className="font-mono text-gray-700">{bill.lines.map((l) => l.booking?.ticket_no || l.booking?.booking_code).filter(Boolean).join(', ')}</span>
              </div>
            )}

            {(() => {
              const planName = (line.plan_name || booking?.plan_name || '').toLowerCase()
              const validUntil = booking?.valid_until || line.booking?.valid_until
              const schedDate = booking?.scheduled_date || line.booking?.scheduled_date

              if (planName.includes('life')) {
                return (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 col-span-2 text-center">
                    <div className="text-[0.6875rem] font-semibold text-emerald-700">✨ <T>Validity</T>: <T>Lifetime</T></div>
                  </div>
                )
              }
              if ((planName.includes('month') || planName.includes('year')) && (validUntil || schedDate)) {
                const fromDate = schedDate ? stamp(fmtDate(schedDate)) : stamp(fmtDate(new Date()))
                const toDate = validUntil ? stamp(fmtDate(validUntil)) : null
                return (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 col-span-2">
                    <div className="flex items-center justify-between text-[0.6875rem]">
                      <span className="text-blue-600 font-medium"><T>Validity Period</T>:</span>
                      <span className="font-semibold text-blue-800">{fromDate} → {toDate || <T>As per plan</T>}</span>
                    </div>
                  </div>
                )
              }
              if (isDailyOnly) {
                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 col-span-2 text-center">
                    <div className="text-[0.6875rem] font-semibold text-amber-700">⚠️ <T>Valid for Today only</T></div>
                  </div>
                )
              }
              return null
            })()}

            <div className="col-span-2 text-[0.5625rem] text-gray-700 leading-relaxed border-t border-dashed border-amber-200 pt-3 mt-1">
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

        <div className="flex gap-2 px-5 py-4 border-t border-gray-100 print:hidden">
          <button onClick={() => window.print()} className="btn-outline flex-1 justify-center"><Printer size={15} /> <T>Print Ticket</T></button>
          <button onClick={onClose} className="btn-maroon flex-1 justify-center"><Plus size={15} /> <T>New Booking</T></button>
        </div>
      </div>
    </div>
  )
}
