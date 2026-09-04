import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight, X, Moon, Sun, Star, Sunrise, Sunset, AlertTriangle, Clock, Sparkles } from 'lucide-react'
import { Flourish } from '../../components/common/UI.jsx'
import { BookingsAPI, FestivalsAPI, TithiAPI, PanchangamAPI } from '../../api/client.js'
import { fmtDate } from '../../components/admin/ui.jsx'
import { Select } from '../../components/common/Field.jsx'
import { T, tr, personName, useLang } from '../../i18n/LanguageContext.jsx'

// ── Month-only calendar view ────────────────────────────────────────────────
// The Day/Week toggle was removed: a Month-only calendar is preferred over a
// toggle that does nothing (see task requirement #6). Events are driven by live
// booking data, grouped onto their `scheduled_date` cells.

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
const LEGEND = [
  { label: 'Confirmed', color: '#059669' },
  { label: 'Pending', color: '#d4a017' },
  { label: 'Completed', color: '#2563eb' },
  { label: 'Cancelled', color: '#dc2626' },
]
const TITHI_CONFIG = {
  Pournami: { label: 'Pournami', labelTe: 'పౌర్ణమి', color: '#f59e0b', bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-300' },
  Amavasya: { label: 'Amavasya', labelTe: 'అమావాస్య', color: '#6b7280', bg: 'bg-gray-200', text: 'text-gray-700', border: 'border-gray-400' },
  Ekadashi: { label: 'Ekadashi', labelTe: 'ఏకాదశి', color: '#8b5cf6', bg: 'bg-violet-100', text: 'text-violet-700', border: 'border-violet-300' },
  Chaturthi: { label: 'Chaturthi', labelTe: 'చతుర్థి', color: '#ec4899', bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-300' },
  Pradosham: { label: 'Pradosham', labelTe: 'ప్రదోషం', color: '#3b82f6', bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' },
}
const EVENT_STYLE = {
  Confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Pending: 'bg-amber-50 text-amber-700 border-amber-200',
  Completed: 'bg-blue-50 text-blue-700 border-blue-200',
  Cancelled: 'bg-red-50 text-red-700 border-red-200',
}
const DOT_COLOR = {
  Confirmed: '#059669', Pending: '#d4a017', Completed: '#2563eb', Cancelled: '#dc2626',
}

const isSameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

export default function Calendar() {
  const { lang } = useLang()
  const today = useMemo(() => new Date(), [])
  const [current, setCurrent] = useState(() => new Date())
  const [bookings, setBookings] = useState([])
  const [festivals, setFestivals] = useState([])
  const [tithis, setTithis] = useState([])
  const [panchangam, setPanchangam] = useState({}) // { day: panchangamData }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [service, setService] = useState('')
  const [status, setStatus] = useState('')
  const [selectedDay, setSelectedDay] = useState(null)
  const [showTithis, setShowTithis] = useState(true)
  const [showFestivals, setShowFestivals] = useState(true)
  const [showPanchangam, setShowPanchangam] = useState(true)

  const year = current.getFullYear()
  const month = current.getMonth()

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      // Fetch bookings, festivals, tithis, and panchangam in parallel
      const [bookingsRes, festivalsRes, tithisRes, panchangamRes] = await Promise.all([
        BookingsAPI.list({ size: 500 }),
        FestivalsAPI.list().catch(() => ({ items: [] })),
        TithiAPI.list({ year }).catch(() => ({ items: [] })),
        PanchangamAPI.month(year, month + 1).catch(() => ({ panchangam: [] })),
      ])
      setBookings(Array.isArray(bookingsRes?.items) ? bookingsRes.items : [])
      setFestivals(Array.isArray(festivalsRes?.items) ? festivalsRes.items : [])
      setTithis(Array.isArray(tithisRes?.items) ? tithisRes.items : [])
      // Index panchangam by day for quick lookup
      const panchMap = {}
      if (Array.isArray(panchangamRes?.panchangam)) {
        for (const p of panchangamRes.panchangam) {
          const day = parseInt(p.date?.split('-')[2], 10)
          if (day) panchMap[day] = p
        }
      }
      setPanchangam(panchMap)
    } catch (ex) {
      setError(ex?.detail || 'Could not load calendar events.')
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
    return true
  }), [bookings, year, month, service, status])

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
        plan: b.plan_name,
        amount: b.amount,
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

  // Festivals falling on each day of the month
  const festivalsByDay = useMemo(() => {
    const map = {}
    for (const f of festivals) {
      if (!f.start_date) continue
      const start = new Date(f.start_date)
      const end = f.end_date ? new Date(f.end_date) : start
      // Check each day in the festival range
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (d.getFullYear() === year && d.getMonth() === month) {
          const day = d.getDate()
          ;(map[day] ||= []).push({
            name: f.name,
            isStart: d.getTime() === start.getTime(),
            isEnd: d.getTime() === end.getTime(),
            isSingle: start.getTime() === end.getTime(),
          })
        }
      }
    }
    return map
  }, [festivals, year, month])

  // Tithis for each day of the month
  const tithisByDay = useMemo(() => {
    const map = {}
    for (const t of tithis) {
      if (!t.tithi_date) continue
      const [y, m, d] = String(t.tithi_date).split('-').map(Number)
      if (y === year && m === month + 1) {
        map[d] = { type: t.tithi_type, name: t.name || t.tithi_type }
      }
    }
    return map
  }, [tithis, year, month])

  // Service dropdown options come from all fetched bookings (not just the month).
  const serviceOptions = useMemo(
    () => [...new Set(bookings.map((b) => b.seva_name).filter(Boolean))].sort(),
    [bookings],
  )

  const leading = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = [...Array(leading).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  const goMonth = (delta) => setCurrent(new Date(year, month + delta, 1))
  const goToday = () => setCurrent(new Date())

  const selectedEvents = selectedDay ? byDay[selectedDay] || [] : []

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="font-serif text-2xl font-bold text-maroon-700"><T>Calendar View</T></h1>
          <p className="text-sm text-gray-500 mt-1"><T>Visual schedule of all poojas and services.</T></p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="card p-3 flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <button onClick={goToday} className="px-3 py-1.5 rounded-md text-xs font-semibold bg-gold-50 text-maroon-700 hover:bg-gold-100"><T>Today</T></button>
          <div className="flex items-center gap-2 text-sm">
            <button onClick={() => goMonth(-1)} title={tr("Previous month")} className="text-gray-400 hover:text-maroon-700"><ChevronLeft size={18} /></button>
            <span className="font-bold text-maroon-700 min-w-[8.125rem] text-center">{tr(MONTHS[month])} {year}</span>
            <button onClick={() => goMonth(1)} title={tr("Next month")} className="text-gray-400 hover:text-maroon-700"><ChevronRight size={18} /></button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={service} onChange={(e) => setService(e.target.value)} className="input !w-auto !py-1.5 text-xs">
            <option value="">{tr("All Services")}</option>
            {serviceOptions.map((s) => <option key={s} value={s}>{tr(s)}</option>)}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="input !w-auto !py-1.5 text-xs">
            <option value="">{tr("All Status")}</option>
            <option value="Confirmed">{tr("Confirmed")}</option><option value="Pending">{tr("Pending")}</option><option value="Completed">{tr("Completed")}</option><option value="Cancelled">{tr("Cancelled")}</option>
          </Select>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mb-3 text-xs">
        {LEGEND.map((l) => (
          <span key={l.label} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />{tr(l.label)}</span>
        ))}
        <span className="border-l border-gray-200 h-4 mx-1" />
        <button
          onClick={() => setShowTithis(!showTithis)}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition ${showTithis ? 'bg-amber-50 text-amber-700' : 'text-gray-400 hover:text-gray-600'}`}
          title={tr('Toggle Tithi markers')}
        >
          <Moon size={12} /> <span>{tr('Tithis')}</span>
        </button>
        <button
          onClick={() => setShowFestivals(!showFestivals)}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition ${showFestivals ? 'bg-rose-50 text-rose-700' : 'text-gray-400 hover:text-gray-600'}`}
          title={tr('Toggle Festival highlights')}
        >
          <Star size={12} /> <span>{tr('Festivals')}</span>
        </button>
        {Object.keys(panchangam).length > 0 && (
          <button
            onClick={() => setShowPanchangam(!showPanchangam)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition ${showPanchangam ? 'bg-orange-50 text-orange-700' : 'text-gray-400 hover:text-gray-600'}`}
            title={tr('Toggle Panchangam details')}
          >
            <Sparkles size={12} /> <span>{tr('Panchangam')}</span>
          </button>
        )}
        <Flourish className="ml-auto hidden sm:flex" width="w-10" />
      </div>

      {error && (
        <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">{error}</div>
      )}

      {/* Grid */}
      <div className="card overflow-x-auto">
        <div className="min-w-[42rem] grid grid-cols-7 bg-maroon-deep text-cream/90 text-[0.6875rem] font-bold uppercase tracking-wide">
          {DOW.map((d) => <div key={d} className="px-3 py-2.5 text-center">{tr(d)}</div>)}
        </div>
        <div className="min-w-[42rem] grid grid-cols-7">
          {cells.map((day, i) => {
            if (!day) return <div key={i} className="min-h-[6.875rem] border-b border-r border-gold-100 p-1.5 bg-gray-50/50" />
            const events = byDay[day] || []
            const stats = dayStats[day]
            const dayFestivals = festivalsByDay[day] || []
            const tithi = tithisByDay[day]
            const panchang = panchangam[day]
            const cellDate = new Date(year, month, day)
            const isToday = isSameDay(cellDate, today)
            const isSelected = selectedDay === day
            const hasFestival = showFestivals && dayFestivals.length > 0
            const tithiConf = showTithis && tithi ? TITHI_CONFIG[tithi.type] : null
            return (
              <button
                key={i}
                type="button"
                onClick={() => setSelectedDay(isSelected ? null : day)}
                className={`min-h-[6.875rem] border-b border-r border-gold-100 p-1.5 text-left transition relative ${
                  hasFestival ? 'bg-gradient-to-br from-rose-50 to-orange-50' : ''
                } ${isSelected ? 'bg-gold-50/60 ring-1 ring-inset ring-maroon-200' : 'hover:bg-gold-50/30'}`}
              >
                {/* Festival banner */}
                {hasFestival && (
                  <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-rose-500 to-orange-500 text-white text-[0.5rem] font-semibold px-1 py-0.5 truncate">
                    {dayFestivals[0].name}
                  </div>
                )}

                <div className={`flex items-center justify-between mb-1 ${hasFestival ? 'mt-3' : ''}`}>
                  <div className="flex items-center gap-1">
                    <div className={`text-[0.6875rem] font-bold w-6 h-6 grid place-items-center rounded-full ${isToday ? 'bg-maroon-700 text-cream' : 'text-gray-500'}`}>{day}</div>
                    {/* Tithi marker - colored dot with moon icon */}
                    {tithiConf && (
                      <div className={`flex items-center gap-0.5 px-1 py-0.5 rounded text-[0.5rem] font-semibold ${tithiConf.bg} ${tithiConf.text}`} title={tithi.name}>
                        <Moon size={8} />
                      </div>
                    )}
                  </div>
                  {events.length > 0 && (
                    <div className="flex items-center gap-0.5 pr-0.5">
                      {events.slice(0, 3).map((e, k) => (
                        <span key={k} className="w-1.5 h-1.5 rounded-full" style={{ background: DOT_COLOR[e.status] || '#9ca3af' }} />
                      ))}
                    </div>
                  )}
                </div>

                {/* Panchangam quick info (Nakshatra + Rahukalam) */}
                {showPanchangam && panchang && (
                  <div className="flex flex-wrap gap-1 mb-1">
                    <span className="text-[0.5rem] px-1 py-0.5 bg-indigo-50 text-indigo-600 rounded truncate max-w-full" title={`${tr('Nakshatra')}: ${lang === 'te' ? panchang.nakshatra_name_te : panchang.nakshatra_name}`}>
                      {lang === 'te' ? panchang.nakshatra_name_te : panchang.nakshatra_name?.split(' ')[0]}
                    </span>
                    <span className="text-[0.5rem] px-1 py-0.5 bg-red-50 text-red-600 rounded" title={`${tr('Rahukalam')}: ${panchang.rahukalam?.start} - ${panchang.rahukalam?.end}`}>
                      <AlertTriangle size={7} className="inline mr-0.5" />{panchang.rahukalam?.start_24h}
                    </span>
                  </div>
                )}

                {/* Tithi name label */}
                {tithiConf && tithi.name && (
                  <div className={`text-[0.5rem] font-medium truncate mb-0.5 px-0.5 ${tithiConf.text}`}>{tithi.name}</div>
                )}

                <div className="space-y-1">
                  {events.slice(0, showPanchangam ? 1 : 2).map((e, j) => (
                    <div key={j} className={`text-[0.625rem] leading-tight rounded border px-1.5 py-1 truncate ${EVENT_STYLE[e.status] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                      {e.time && <span className="font-semibold">{e.time.replace(/\b(AM|PM)\b/, (w) => tr(w))}</span>} {tr(e.title)}
                    </div>
                  ))}
                  {events.length > (showPanchangam ? 1 : 2) && <div className="text-[0.625rem] text-gray-400 px-1">+{events.length - (showPanchangam ? 1 : 2)} {tr('more')}</div>}
                </div>

                {/* Day stats (revenue) */}
                {stats && stats.revenue > 0 && (
                  <div className="absolute bottom-1 right-1 text-[0.5rem] text-emerald-600 font-semibold bg-emerald-50 px-1 rounded">
                    ₹{stats.revenue >= 1000 ? Math.round(stats.revenue / 1000) + 'K' : Math.round(stats.revenue)}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {loading && <div className="mt-3 text-sm text-gray-400"><T>Loading events…</T></div>}
      {!loading && !error && monthBookings.length === 0 && (
        <div className="mt-3 text-sm text-gray-400">No events scheduled for {MONTHS[month]} {year}.</div>
      )}

      {/* Selected-day popup modal (Item 40) */}
      {selectedDay && (() => {
        const dayFests = festivalsByDay[selectedDay] || []
        const dayTithi = tithisByDay[selectedDay]
        const tithiConf = dayTithi ? TITHI_CONFIG[dayTithi.type] : null
        const stats = dayStats[selectedDay]
        const dayBookings = byDay[selectedDay] || []
        const dayPanch = panchangam[selectedDay]
        // Group by status for summary
        const statusCounts = { Confirmed: 0, Pending: 0, Completed: 0, Cancelled: 0 }
        const statusRevenue = { Confirmed: 0, Pending: 0, Completed: 0, Cancelled: 0 }
        dayBookings.forEach(b => {
          if (statusCounts[b.status] !== undefined) {
            statusCounts[b.status]++
            statusRevenue[b.status] += b.amount || 0
          }
        })
        // Group by pooja type
        const poojaBreakdown = {}
        dayBookings.forEach(b => {
          if (!poojaBreakdown[b.title]) poojaBreakdown[b.title] = { count: 0, revenue: 0 }
          poojaBreakdown[b.title].count++
          poojaBreakdown[b.title].revenue += b.amount || 0
        })
        const poojaList = Object.entries(poojaBreakdown).sort((a, b) => b[1].revenue - a[1].revenue)

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSelectedDay(null)}>
            <div className="absolute inset-0 bg-black/40" />
            <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
              {/* Festival header banner */}
              {dayFests.length > 0 && (
                <div className="bg-gradient-to-r from-rose-500 to-orange-500 text-white px-5 py-3">
                  <div className="flex items-center gap-2">
                    <Star size={18} />
                    <div>
                      <div className="font-semibold">{dayFests.map(f => f.name).join(', ')}</div>
                      <div className="text-xs text-white/80">{tr('Festival Day')}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Header with date and tithi */}
              <div className={`flex items-center justify-between px-5 py-4 border-b border-gray-100 ${dayFests.length > 0 ? 'bg-rose-50' : 'bg-maroon-50'}`}>
                <div>
                  <h3 className="font-serif text-xl font-bold text-maroon-700">
                    {fmtDate(new Date(year, month, selectedDay))}
                  </h3>
                  {tithiConf && dayTithi && (
                    <div className={`inline-flex items-center gap-1.5 mt-1.5 px-2 py-1 rounded text-xs font-semibold ${tithiConf.bg} ${tithiConf.text}`}>
                      <Moon size={12} />
                      <span>{dayTithi.name || tithiConf.label}</span>
                    </div>
                  )}
                </div>
                <button onClick={() => setSelectedDay(null)} className="w-8 h-8 grid place-items-center rounded-lg text-gray-400 hover:text-maroon-700 hover:bg-maroon-100"><X size={18} /></button>
              </div>

              <div className="p-5 overflow-y-auto max-h-[60vh]">
                {/* Panchangam Panel */}
                {dayPanch && (
                  <div className="mb-5 bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl p-4 border border-orange-100">
                    <h4 className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                      <Sparkles size={12} /> <T>Panchangam</T> <span className="text-orange-400 font-normal">({lang === 'te' ? dayPanch.vaara_te : dayPanch.vaara})</span>
                    </h4>

                    {/* Pancha Anga - 5 Elements in grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                      {/* Tithi */}
                      <div className="bg-white/80 rounded-lg px-3 py-2">
                        <div className="text-[0.6rem] text-gray-500 uppercase">{tr('Tithi')}</div>
                        <div className="text-sm font-semibold text-gray-800">{lang === 'te' ? dayPanch.tithi_name_te : dayPanch.tithi_name}</div>
                        <div className="text-[0.65rem] text-gray-500">{lang === 'te' ? dayPanch.paksha_te : dayPanch.paksha}</div>
                      </div>
                      {/* Nakshatra */}
                      <div className="bg-white/80 rounded-lg px-3 py-2">
                        <div className="text-[0.6rem] text-gray-500 uppercase">{tr('Nakshatra')}</div>
                        <div className="text-sm font-semibold text-indigo-700">{lang === 'te' ? dayPanch.nakshatra_name_te : dayPanch.nakshatra_name}</div>
                      </div>
                      {/* Yoga */}
                      <div className="bg-white/80 rounded-lg px-3 py-2">
                        <div className="text-[0.6rem] text-gray-500 uppercase">{tr('Yoga')}</div>
                        <div className="text-sm font-semibold text-purple-700">{lang === 'te' ? dayPanch.yoga_name_te : dayPanch.yoga_name}</div>
                      </div>
                      {/* Karana */}
                      <div className="bg-white/80 rounded-lg px-3 py-2">
                        <div className="text-[0.6rem] text-gray-500 uppercase">{tr('Karana')}</div>
                        <div className="text-sm font-semibold text-teal-700">{lang === 'te' ? dayPanch.karana_name_te : dayPanch.karana_name}</div>
                      </div>
                      {/* Sunrise */}
                      <div className="bg-white/80 rounded-lg px-3 py-2 flex items-center gap-2">
                        <Sunrise size={14} className="text-amber-500" />
                        <div>
                          <div className="text-[0.6rem] text-gray-500 uppercase">{tr('Sunrise')}</div>
                          <div className="text-sm font-semibold text-gray-800">{dayPanch.sunrise}</div>
                        </div>
                      </div>
                      {/* Sunset */}
                      <div className="bg-white/80 rounded-lg px-3 py-2 flex items-center gap-2">
                        <Sunset size={14} className="text-orange-500" />
                        <div>
                          <div className="text-[0.6rem] text-gray-500 uppercase">{tr('Sunset')}</div>
                          <div className="text-sm font-semibold text-gray-800">{dayPanch.sunset}</div>
                        </div>
                      </div>
                    </div>

                    {/* Timings - Auspicious & Inauspicious */}
                    <div className="grid grid-cols-2 gap-2">
                      {/* Auspicious - Abhijit */}
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                        <div className="text-[0.6rem] text-emerald-600 uppercase flex items-center gap-1">
                          <Sparkles size={10} /> {tr('Abhijit Muhurtam')}
                        </div>
                        <div className="text-sm font-semibold text-emerald-700">
                          {dayPanch.abhijit_muhurtam?.start} - {dayPanch.abhijit_muhurtam?.end}
                        </div>
                        <div className="text-[0.6rem] text-emerald-600/70">{tr('Auspicious')}</div>
                      </div>
                      {/* Inauspicious - Rahukalam */}
                      <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        <div className="text-[0.6rem] text-red-600 uppercase flex items-center gap-1">
                          <AlertTriangle size={10} /> {tr('Rahukalam')}
                        </div>
                        <div className="text-sm font-semibold text-red-700">
                          {dayPanch.rahukalam?.start} - {dayPanch.rahukalam?.end}
                        </div>
                        <div className="text-[0.6rem] text-red-600/70">{tr('Inauspicious')}</div>
                      </div>
                      {/* Yamagandam */}
                      <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                        <div className="text-[0.6rem] text-orange-600 uppercase flex items-center gap-1">
                          <Clock size={10} /> {tr('Yamagandam')}
                        </div>
                        <div className="text-sm font-semibold text-orange-700">
                          {dayPanch.yamagandam?.start} - {dayPanch.yamagandam?.end}
                        </div>
                      </div>
                      {/* Gulika Kalam */}
                      <div className="bg-gray-100 border border-gray-200 rounded-lg px-3 py-2">
                        <div className="text-[0.6rem] text-gray-600 uppercase flex items-center gap-1">
                          <Clock size={10} /> {tr('Gulika Kalam')}
                        </div>
                        <div className="text-sm font-semibold text-gray-700">
                          {dayPanch.gulika_kalam?.start} - {dayPanch.gulika_kalam?.end}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Day summary stats */}
                {dayBookings.length > 0 && (
                  <div className="mb-5">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2"><T>Day Summary</T></h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-gradient-to-br from-maroon-50 to-maroon-100 rounded-lg p-3">
                        <div className="text-2xl font-bold text-maroon-700">{dayBookings.length}</div>
                        <div className="text-xs text-maroon-600">{tr('Total Bookings')}</div>
                      </div>
                      <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg p-3">
                        <div className="text-2xl font-bold text-emerald-700">₹{Math.round(stats?.revenue || 0).toLocaleString('en-IN')}</div>
                        <div className="text-xs text-emerald-600">{tr('Total Revenue')}</div>
                      </div>
                    </div>

                    {/* Status breakdown */}
                    <div className="flex flex-wrap gap-2 mt-3">
                      {statusCounts.Confirmed > 0 && (
                        <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full">{statusCounts.Confirmed} {tr('Confirmed')}</span>
                      )}
                      {statusCounts.Pending > 0 && (
                        <span className="text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded-full">{statusCounts.Pending} {tr('Pending')}</span>
                      )}
                      {statusCounts.Completed > 0 && (
                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">{statusCounts.Completed} {tr('Completed')}</span>
                      )}
                      {statusCounts.Cancelled > 0 && (
                        <span className="text-xs bg-red-50 text-red-700 px-2 py-1 rounded-full">{statusCounts.Cancelled} {tr('Cancelled')}</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Pooja breakdown */}
                {poojaList.length > 0 && (
                  <div className="mb-5">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2"><T>By Pooja Type</T></h4>
                    <div className="space-y-2">
                      {poojaList.slice(0, 5).map(([name, data]) => (
                        <div key={name} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                          <div>
                            <span className="font-medium text-gray-800">{tr(name)}</span>
                            <span className="text-gray-400 ml-2">×{data.count}</span>
                          </div>
                          <span className="font-semibold text-emerald-600">₹{Math.round(data.revenue).toLocaleString('en-IN')}</span>
                        </div>
                      ))}
                      {poojaList.length > 5 && (
                        <div className="text-xs text-gray-400 text-center">+{poojaList.length - 5} {tr('more types')}</div>
                      )}
                    </div>
                  </div>
                )}

                {/* Detailed bookings list */}
                {selectedEvents.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6"><T>No poojas scheduled on this day.</T></p>
                ) : (
                  <>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2"><T>Booking Details</T></h4>
                    <ul className="space-y-2">
                      {selectedEvents.map((e, i) => (
                        <li key={i} className={`rounded-lg border px-3 py-2.5 text-sm ${EVENT_STYLE[e.status] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold">{tr(e.title)}</div>
                              {e.plan && <div className="text-xs opacity-70">{tr(e.plan)}</div>}
                            </div>
                            <span className="text-[0.6875rem] font-semibold whitespace-nowrap px-2 py-0.5 rounded-full bg-white/60">{tr(e.status)}</span>
                          </div>
                          <div className="flex items-center justify-between mt-2 pt-2 border-t border-current/10 text-xs">
                            <div className="flex items-center gap-3 opacity-80">
                              <span>{e.devotee ? personName({ name: e.devotee }, lang) : '—'}</span>
                              {e.time && <span>{e.time.replace(/\b(AM|PM)\b/, (w) => tr(w))}</span>}
                            </div>
                            {e.amount > 0 && <span className="font-semibold">₹{Math.round(e.amount).toLocaleString('en-IN')}</span>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
