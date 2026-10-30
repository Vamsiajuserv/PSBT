import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, X } from 'lucide-react'
import { BookingsAPI, FestivalsAPI, PanchangamAPI, AlmanacAPI } from '../../api/client.js'
import { Select } from '../../components/common/Field.jsx'
import { T, tr, useLang, staffName } from '../../i18n/LanguageContext.jsx'
import { useFilterParams } from '../../hooks/useUrlState.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { isAdminRole } from '../../auth/access.js'
import { toast } from '../../components/common/Dialog.jsx'
import TempleCalendar from './calendar/TempleCalendar.jsx'

// ── Admin Calendar ──────────────────────────────────────────────────────────
// Loads the month (bookings, Festival Master, almanac Pournami/Amavasya/festivals,
// Panchangam) and renders it as the "Temple traditional" month view
// (calendar/TempleCalendar.jsx); a clicked day opens its detail in a popup.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

// "Show" toggles — stored as the hidden ones in the URL (?hide=moon,panch)
const LAYERS = [
  ['bookings', 'Bookings'], ['moon', 'Pournami / Amavasya'], ['festivals', 'Festivals'], ['panch', 'Tithi & nakshatra'],
]
const UNASSIGNED = '__none'

// Every booking scheduled in [from, to]. The list API returns at most 200 per page,
// so keep asking until all are in (a busy month has ~300).
async function fetchMonthBookings(from, to) {
  const all = []
  for (let page = 1; page <= 25; page++) {
    const r = await BookingsAPI.list({ start: from, end: to, page, size: 200, sort_by: 'scheduled_date', sort_dir: 'asc' })
    const items = Array.isArray(r?.items) ? r.items : []
    all.push(...items)
    if (!items.length || all.length >= (r?.total ?? 0)) break
  }
  return { items: all }
}

// Jump straight to any month: year arrows + 12 month buttons
function MonthPicker({ year, month, onPick, onClose }) {
  const [y, setY] = useState(year)
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute z-40 top-full left-1/2 -translate-x-1/2 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gold-200 p-3">
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => setY(y - 1)} className="p-1 rounded hover:bg-gold-50 text-maroon-700" title={tr('Previous year')}><ChevronLeft size={16} /></button>
          <span className="font-bold text-maroon-700">{y}</span>
          <button onClick={() => setY(y + 1)} className="p-1 rounded hover:bg-gold-50 text-maroon-700" title={tr('Next year')}><ChevronRight size={16} /></button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {MONTHS.map((m, i) => (
            <button key={i} onClick={() => onPick(y, i)}
              className={`py-1.5 rounded-lg text-[0.75rem] font-semibold ${y === year && i === month ? 'bg-maroon-700 text-white' : 'hover:bg-gold-50 text-gray-700'}`}>
              {tr(m.slice(0, 3))}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
export default function Calendar() {
  const { lang } = useLang()
  const { user } = useAuth()
  const canSeeAmounts = ['Admin', 'Administrator', 'Committee', 'Accountant'].includes(user?.role)
  const today = useMemo(() => new Date(), [])
  const [current, setCurrent] = useState(() => new Date())
  const [bookings, setBookings] = useState([])
  const [festivals, setFestivals] = useState([])
  const [panchangam, setPanchangam] = useState({}) // { day: panchangamData }
  const [panchError, setPanchError] = useState('')  // why the panchangam could not be loaded
  const [pournamis, setPournamis] = useState([]) // Pournami days from the almanac engine
  const [almanacFests, setAlmanacFests] = useState([]) // festival days from the almanac engine
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // filters - persisted in URL for state preservation across navigation
  const { service, setService, status, setStatus, poojari, setPoojari, hide, setHide, setFilters } =
    useFilterParams({ service: '', status: '', poojari: '', hide: '' })
  const hidden = useMemo(() => new Set((hide || '').split(',').filter(Boolean)), [hide])
  const show = { bookings: !hidden.has('bookings'), moon: !hidden.has('moon'), festivals: !hidden.has('festivals'), panch: !hidden.has('panch') }
  const toggleLayer = (key) => {
    const next = new Set(hidden)
    if (next.has(key)) next.delete(key); else next.add(key)
    setHide([...next].join(','))
  }
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selectedDay, setSelectedDay] = useState(null)
  const year = current.getFullYear()
  const month = current.getMonth()

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      // Fetch bookings, Festival Master, panchangam and almanac (Pournami / Amavasya / festivals) in parallel
      const pad = (n) => String(n).padStart(2, '0')
      const monthFrom = `${year}-${pad(month + 1)}-01`
      const monthTo = `${year}-${pad(month + 1)}-${pad(new Date(year, month + 1, 0).getDate())}`
      const [bookingsRes, festivalsRes, panchangamRes, almanacRes] = await Promise.all([
        fetchMonthBookings(monthFrom, monthTo),
        FestivalsAPI.list().catch(() => ({ items: [] })),
        PanchangamAPI.month(year, month + 1).catch((ex) => ({ panchangam: [], error: ex?.detail || 'unavailable' })),
        AlmanacAPI.days(monthFrom, monthTo, 'all').catch(() => ({ items: [] })),
      ])
      setBookings(Array.isArray(bookingsRes?.items) ? bookingsRes.items : [])
      setFestivals(Array.isArray(festivalsRes?.items) ? festivalsRes.items : [])
      // Index panchangam by day for quick lookup
      // Only real days are kept: an item without a tithi is not a panchangam, and is
      // never shown as one (blank fields would look like data).
      const panchMap = {}
      if (Array.isArray(panchangamRes?.panchangam)) {
        for (const p of panchangamRes.panchangam) {
          const day = parseInt(p.date?.split('-')[2], 10)
          if (day && p.tithi_name && !p.error) panchMap[day] = p
        }
      }
      setPanchangam(panchMap)
      setPanchError(Object.keys(panchMap).length ? '' : (panchangamRes?.error || 'unavailable'))
      // Set Prokerala festivals and pournami
      const almanac = Array.isArray(almanacRes?.items) ? almanacRes.items : []
      setPournamis(almanac.filter((d) => d.event_type === 'Pournami' || d.event_type === 'Amavasya'))
      setAlmanacFests(almanac.filter((d) => d.event_type === 'Festival'))
    } catch (ex) {
      setError(ex?.detail || tr('Could not load calendar events.'))
      setBookings([])
    } finally {
      setLoading(false)
    }
  }, [year, month])

  // Refetch whenever the visible month changes (re-render + refetch, req #2).
  useEffect(() => { load() }, [load, year, month])
  // A fresh month resets any open day panel.
  useEffect(() => { setSelectedDay(null) }, [year, month])

  // Bookings falling within the visible month, honoring the active filters.
  const monthBookings = useMemo(() => bookings.filter((b) => {
    if (!b?.scheduled_date) return false
    const [y, m] = String(b.scheduled_date).split('-').map(Number)
    if (y !== year || m !== month + 1) return false
    if (service && b.seva_name !== service) return false
    if (status && b.status !== status) return false
    if (poojari && (poojari === UNASSIGNED ? !!b.poojari_name : b.poojari_name !== poojari)) return false
    return true
  }), [bookings, year, month, service, status, poojari])

  // Group events by day-of-month → { 5: [ev, ev], … }
  const byDay = useMemo(() => {
    const map = {}
    for (const b of monthBookings) {
      const day = Number(String(b.scheduled_date).split('-')[2])
      if (!Number.isFinite(day)) continue
      ;(map[day] ||= []).push({
        time: b.time_slot || '',
        title: b.seva_name || tr('Booking'),
        status: b.status,
        devotee: b.devotee_name,
        mobile: b.mobile,
        poojari: b.poojari_name,
        plan: b.plan_name,
        // The API sends money as text ("500.00"); convert so totals add instead of joining into NaN
        amount: Number(b.amount) || 0,
      })
    }
    return map
  }, [monthBookings])

  // Booking stats per day (count + revenue)
  const dayStats = useMemo(() => {
    const stats = {}
    for (const [day, events] of Object.entries(byDay)) {
      const paid = events.filter(e => e.status !== 'Cancelled')
      stats[day] = {
        count: paid.length,
        revenue: paid.reduce((s, e) => s + (e.amount || 0), 0),
      }
    }
    return stats
  }, [byDay])

  // Festivals falling on each day of the month (Festival Master + almanac)
  const festivalsByDay = useMemo(() => {
    const map = {}
    // A Festival Master entry linked to an almanac festival is shown once — by the
    // almanac's name — on the almanac's day.
    const almanacOn = new Set(almanacFests.map((f) => `${f.event_date}|${f.rule_code}`))
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    // Database festivals (temple-specific)
    for (const f of festivals) {
      if (!f.start_date) continue
      const start = new Date(f.start_date)
      const end = f.end_date ? new Date(f.end_date) : start
      // Check each day in the festival range
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (d.getFullYear() === year && d.getMonth() === month) {
          if (f.almanac_code && almanacOn.has(`${iso(d)}|${f.almanac_code}`)) continue
          const day = d.getDate()
          ;(map[day] ||= []).push({
            name: f.name,
            isStart: d.getTime() === start.getTime(),
            isEnd: d.getTime() === end.getTime(),
            isSingle: start.getTime() === end.getTime(),
            source: 'temple',
          })
        }
      }
    }
    // Hindu festivals from the almanac engine (TTD panchangam rules)
    for (const f of almanacFests) {
      const [y, m, d] = String(f.event_date).split('-').map(Number)
      if (y !== year || m !== month + 1) continue
      const name = lang === 'te' && f.name_te ? f.name_te : f.name
      const existing = map[d] || []
      if (existing.some((e) => e.name?.toLowerCase() === f.name.toLowerCase())) continue
      ;(map[d] ||= []).push({ name, isSingle: true, source: 'almanac', provisional: f.provisional, translated: true })
    }
    // The day's own festival (almanac) leads; multi-day Festival Master windows follow
    for (const d of Object.keys(map)) map[d].sort((a, b) => (a.source === 'almanac' ? 0 : 1) - (b.source === 'almanac' ? 0 : 1))
    return map
  }, [festivals, almanacFests, year, month, lang])

  // Pournami and Amavasya for each day of the month — from the almanac engine (TTD rule)
  const tithisByDay = useMemo(() => {
    const map = {}
    for (const p of pournamis) {
      const [y, m, d] = String(p.event_date).split('-').map(Number)
      if (y === year && m === month + 1) {
        map[d] = { ...p, type: p.event_type, label: lang === 'te' && p.name_te ? p.name_te : p.name }
      }
    }
    return map
  }, [pournamis, year, month, lang])

  // Administrator confirms a flagged (provisional) Pournami after checking the TTD calendar
  const confirmPournami = async (p) => {
    setConfirming(true)
    try {
      await AlmanacAPI.publish(p.id)
      toast(tr('Pournami confirmed.'), 'success')
      setPournamis((list) => list.map((x) => (x.id === p.id ? { ...x, status: 'PUBLISHED', provisional: false } : x)))
    } catch (ex) {
      toast(ex?.detail || tr('Could not confirm this Pournami.'), 'error')
    } finally {
      setConfirming(false)
    }
  }

  // Pooja and poojari choices come from the month's bookings (the selected one is
  // kept in the list even when this month has none, so it can be cleared).
  const serviceOptions = useMemo(
    () => [...new Set([...bookings.map((b) => b.seva_name), service].filter(Boolean))].sort(),
    [bookings, service],
  )
  const poojariOptions = useMemo(
    () => [...new Set([...bookings.map((b) => b.poojari_name), poojari !== UNASSIGNED && poojari].filter(Boolean))].sort(),
    [bookings, poojari],
  )
  const activeFilters = [
    service && ['Pooja', tr(service), () => setService('')],
    status && ['Status', tr(status), () => setStatus('')],
    poojari && ['Poojari', poojari === UNASSIGNED ? tr('Not assigned') : staffName(poojari), () => setPoojari('')],
    ...LAYERS.filter(([k]) => hidden.has(k)).map(([k, label]) => ['Hidden', tr(label), () => toggleLayer(k)]),
  ].filter(Boolean)
  // One URL update: separate setters in the same click would overwrite each other
  const clearAll = () => setFilters({ service: '', status: '', poojari: '', hide: '' })

  const leading = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = [...Array(leading).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  const goMonth = (delta) => setCurrent(new Date(year, month + delta, 1))
  const goToday = () => setCurrent(new Date())

  // Everything the month view needs, from the data loaded above
  const cal = {
    year, month, today, cells, daysInMonth, byDay, dayStats, festivalsByDay, tithisByDay, panchangam,
    selectedDay, setSelectedDay, lang, canSeeAmounts, isAdmin: isAdminRole(user), confirmPournami, confirming,
    panchError, error, show,
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="font-serif text-2xl font-bold text-maroon-700"><T>Calendar View</T></h1>
          <p className="text-sm text-gray-500 mt-1"><T>Visual schedule of all poojas and services.</T></p>
        </div>
      </div>

      {/* Toolbar: month navigation + filters */}
      <div className="card p-3 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={goToday} className="px-3 py-1.5 rounded-md text-xs font-semibold bg-gold-50 text-maroon-700 hover:bg-gold-100"><T>Today</T></button>
            <div className="relative flex items-center gap-2 text-sm">
              <button onClick={() => goMonth(-1)} title={tr("Previous month")} className="text-gray-400 hover:text-maroon-700"><ChevronLeft size={18} /></button>
              <button onClick={() => setPickerOpen(!pickerOpen)} title={tr('Choose month')}
                className="font-bold text-maroon-700 min-w-[8.125rem] text-center inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 hover:bg-gold-50">
                {tr(MONTHS[month])} {year} <ChevronDown size={14} />
              </button>
              <button onClick={() => goMonth(1)} title={tr("Next month")} className="text-gray-400 hover:text-maroon-700"><ChevronRight size={18} /></button>
              {pickerOpen && <MonthPicker year={year} month={month} onClose={() => setPickerOpen(false)}
                onPick={(y, m) => { setCurrent(new Date(y, m, 1)); setPickerOpen(false) }} />}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={service} onChange={(e) => setService(e.target.value)} className="input !w-auto !py-1.5 text-xs" aria-label={tr('Pooja')}>
              <option value="">{tr("All Poojas")}</option>
              {serviceOptions.map((s) => <option key={s} value={s}>{tr(s)}</option>)}
            </Select>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="input !w-auto !py-1.5 text-xs" aria-label={tr('Status')}>
              <option value="">{tr("All Status")}</option>
              <option value="Confirmed">{tr("Confirmed")}</option><option value="Pending">{tr("Pending")}</option><option value="Completed">{tr("Completed")}</option><option value="Cancelled">{tr("Cancelled")}</option>
            </Select>
            <Select value={poojari} onChange={(e) => setPoojari(e.target.value)} className="input !w-auto !py-1.5 text-xs" aria-label={tr('Poojari')}>
              <option value="">{tr("All Poojaris")}</option>
              {poojariOptions.map((p) => <option key={p} value={p}>{staffName(p)}</option>)}
              <option value={UNASSIGNED}>{tr("Not assigned")}</option>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-gold-100 text-[0.75rem]">
          <span className="text-gray-500 font-semibold"><T>Show</T>:</span>
          {LAYERS.map(([key, label]) => (
            <button key={key} type="button" onClick={() => toggleLayer(key)} aria-pressed={show[key]}
              className={`px-2.5 py-1 rounded-full border font-semibold transition ${show[key] ? 'bg-maroon-50 border-maroon-200 text-maroon-700' : 'bg-white border-gray-200 text-gray-400 line-through'}`}>
              {show[key] ? '✓ ' : ''}{tr(label)}
            </button>
          ))}
          <span className="ml-auto text-gray-600">
            {loading ? tr('Loading events…') : `${tr('Showing')} ${monthBookings.length} ${tr(monthBookings.length === 1 ? 'booking' : 'bookings')}`}
          </span>
        </div>

        {activeFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2 text-[0.75rem]">
            {activeFilters.map(([kind, value, clear], i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full bg-gold-50 border border-gold-200 text-maroon-800 pl-2.5 pr-1 py-0.5">
                {tr(kind)}: <b>{value}</b>
                <button type="button" onClick={clear} className="p-0.5 rounded-full hover:bg-gold-100" aria-label={tr('Remove filter')}><X size={12} /></button>
              </span>
            ))}
            <button type="button" onClick={clearAll} className="ml-1 font-semibold text-maroon-700 hover:underline"><T>Clear all</T></button>
          </div>
        )}
      </div>

      {error && <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">{error}</div>}

      <TempleCalendar cal={cal} />

      {loading && <div className="mt-3 text-sm text-gray-400"><T>Loading events…</T></div>}
      {!loading && !error && monthBookings.length === 0 && (
        <div className="mt-3 text-sm text-gray-400">{tr('No events scheduled for')} {tr(MONTHS[month])} {year}.</div>
      )}
    </div>
  )
}
