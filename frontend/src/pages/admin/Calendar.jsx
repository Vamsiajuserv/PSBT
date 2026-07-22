import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Flourish } from '../../components/common/UI.jsx'
import { BookingsAPI } from '../../api/client.js'
import { fmtDate } from '../../components/admin/ui.jsx'
import { Select } from '../../components/common/Field.jsx'

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
  const today = useMemo(() => new Date(), [])
  const [current, setCurrent] = useState(() => new Date())
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [service, setService] = useState('')
  const [status, setStatus] = useState('')
  const [selectedDay, setSelectedDay] = useState(null)

  const year = current.getFullYear()
  const month = current.getMonth()

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      // Bookings' server-side date filters apply to created_at, not
      // scheduled_date, so we fetch a large page and group by month client-side.
      const d = await BookingsAPI.list({ size: 500 })
      setBookings(Array.isArray(d?.items) ? d.items : [])
    } catch (ex) {
      setError(ex?.detail || 'Could not load calendar events.')
      setBookings([])
    } finally {
      setLoading(false)
    }
  }, [])

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
        title: b.seva_name || 'Booking',
        status: b.status,
        devotee: b.devotee_name,
        plan: b.plan_name,
        amount: b.amount,
      })
    }
    return map
  }, [monthBookings])

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
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="font-serif text-2xl font-bold text-maroon-700">Calendar View</h1>
          <p className="text-sm text-gray-500 mt-1">Visual schedule of all poojas and services.</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="card p-3 flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <button onClick={goToday} className="px-3 py-1.5 rounded-md text-xs font-semibold bg-gold-50 text-maroon-700 hover:bg-gold-100">Today</button>
          <div className="flex items-center gap-2 text-sm">
            <button onClick={() => goMonth(-1)} title="Previous month" className="text-gray-400 hover:text-maroon-700"><ChevronLeft size={18} /></button>
            <span className="font-bold text-maroon-700 min-w-[8.125rem] text-center">{MONTHS[month]} {year}</span>
            <button onClick={() => goMonth(1)} title="Next month" className="text-gray-400 hover:text-maroon-700"><ChevronRight size={18} /></button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={service} onChange={(e) => setService(e.target.value)} className="input !w-auto !py-1.5 text-xs">
            <option value="">All Services</option>
            {serviceOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="input !w-auto !py-1.5 text-xs">
            <option value="">All Status</option>
            <option>Confirmed</option><option>Pending</option><option>Completed</option><option>Cancelled</option>
          </Select>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mb-3 text-xs">
        {LEGEND.map((l) => (
          <span key={l.label} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />{l.label}</span>
        ))}
        <Flourish className="ml-auto hidden sm:flex" width="w-10" />
      </div>

      {error && (
        <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">{error}</div>
      )}

      {/* Grid */}
      <div className="card overflow-hidden">
        <div className="grid grid-cols-7 bg-maroon-deep text-cream/90 text-[0.6875rem] font-bold uppercase tracking-wide">
          {DOW.map((d) => <div key={d} className="px-3 py-2.5 text-center">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            if (!day) return <div key={i} className="min-h-[6.875rem] border-b border-r border-gold-100 p-1.5 bg-gray-50/50" />
            const events = byDay[day] || []
            const cellDate = new Date(year, month, day)
            const isToday = isSameDay(cellDate, today)
            const isSelected = selectedDay === day
            return (
              <button
                key={i}
                type="button"
                onClick={() => setSelectedDay(isSelected ? null : day)}
                className={`min-h-[6.875rem] border-b border-r border-gold-100 p-1.5 text-left transition ${isSelected ? 'bg-gold-50/60 ring-1 ring-inset ring-maroon-200' : 'hover:bg-gold-50/30'}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className={`text-[0.6875rem] font-bold w-6 h-6 grid place-items-center rounded-full ${isToday ? 'bg-maroon-700 text-cream' : 'text-gray-500'}`}>{day}</div>
                  {events.length > 0 && (
                    <div className="flex items-center gap-0.5 pr-0.5">
                      {events.slice(0, 3).map((e, k) => (
                        <span key={k} className="w-1.5 h-1.5 rounded-full" style={{ background: DOT_COLOR[e.status] || '#9ca3af' }} />
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  {events.slice(0, 2).map((e, j) => (
                    <div key={j} className={`text-[0.625rem] leading-tight rounded border px-1.5 py-1 truncate ${EVENT_STYLE[e.status] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                      {e.time && <span className="font-semibold">{e.time}</span>} {e.title}
                    </div>
                  ))}
                  {events.length > 2 && <div className="text-[0.625rem] text-gray-400 px-1">+{events.length - 2} more</div>}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {loading && <div className="mt-3 text-sm text-gray-400">Loading events…</div>}
      {!loading && !error && monthBookings.length === 0 && (
        <div className="mt-3 text-sm text-gray-400">No events scheduled for {MONTHS[month]} {year}.</div>
      )}

      {/* Selected-day detail panel */}
      {selectedDay && (
        <div className="card p-4 mt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-serif text-base font-bold text-maroon-700">
              {fmtDate(new Date(year, month, selectedDay))}
            </h3>
            <button onClick={() => setSelectedDay(null)} className="text-xs text-gray-400 hover:text-maroon-700">Close</button>
          </div>
          {selectedEvents.length === 0 ? (
            <p className="text-sm text-gray-400">No events on this day.</p>
          ) : (
            <ul className="space-y-2">
              {selectedEvents.map((e, i) => (
                <li key={i} className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${EVENT_STYLE[e.status] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{e.title}{e.plan ? ` · ${e.plan}` : ''}</div>
                    <div className="text-[0.75rem] opacity-80 truncate">
                      {e.devotee || '—'}{e.time ? ` · ${e.time}` : ''}
                    </div>
                  </div>
                  <span className="text-[0.6875rem] font-semibold whitespace-nowrap">{e.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
