import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarDays, HeartHandshake, HandHeart, HandCoins, Gavel, Flame, Recycle,
  Calendar, Filter, RotateCcw, TrendingUp, ArrowRight, Clock, ChevronRight, BarChart3,
} from 'lucide-react'
import { Donut } from '../../components/common/UI.jsx'
import { useAuth } from '../../auth/AuthContext.jsx'
import { DashboardAPI } from '../../api/client.js'

const inr = (n) => '₹ ' + Number(n || 0).toLocaleString('en-IN')
const num = (n) => Number(n || 0).toLocaleString('en-IN')
const DON_COLORS = ['#8a1c1c', '#ea580c', '#059669', '#2563eb', '#7c3aed', '#9ca3af']
const OVERVIEW_ICONS = {
  'Pooja Bookings': { icon: CalendarDays, c: '#2563eb', bg: 'bg-blue-50' },
  'Donations Received': { icon: HandHeart, c: '#059669', bg: 'bg-emerald-50' },
  'Annadanam Sponsors': { icon: Flame, c: '#ea580c', bg: 'bg-orange-50' },
  'Hundi Collection': { icon: HandCoins, c: '#d97706', bg: 'bg-amber-50' },
  'Auction Sales': { icon: Gavel, c: '#7c3aed', bg: 'bg-violet-50' },
  'Waste Material Sales': { icon: Recycle, c: '#059669', bg: 'bg-emerald-50' },
}

const OVERVIEW_ROUTE = {
  'Pooja Bookings': '/admin/bookings', 'Donations Received': '/admin/donations',
  'Annadanam Sponsors': '/admin/annadanam', 'Hundi Collection': '/admin/hundi',
  'Auction Sales': '/admin/auction', 'Waste Material Sales': '/admin/waste-sales',
}
const ALERT_ROUTE = { hundi: '/admin/hundi', auction: '/admin/auction', donation: '/admin/donations', waste: '/admin/waste-sales' }

function Kpi({ icon: Icon, iconBg, iconColor, title, sub, value, footLabel, footValue, to }) {
  const inner = (
    <div className={`bg-white rounded-xl border border-gray-100 shadow-sm p-5 h-full overflow-hidden ${to ? 'cursor-pointer transition hover:shadow-md hover:border-maroon-200' : ''}`}>
      <div className="flex items-start gap-3">
        <div className={`w-12 h-12 rounded-full grid place-items-center shrink-0 ${iconBg}`} style={{ color: iconColor }}><Icon size={22} /></div>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] text-gray-500 leading-snug">{title}</div>
          {sub && <div className="text-[11px] text-gray-400 leading-none">{sub}</div>}
          <div className="text-base sm:text-lg xl:text-xl font-extrabold text-gray-800 mt-1.5 leading-tight tabular-nums break-words">{value}</div>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-gray-100 text-[12px] text-gray-400 truncate">{footLabel} <span className="font-semibold text-gray-700 tabular-nums">{footValue}</span></div>
    </div>
  )
  return to ? <Link to={to} className="block">{inner}</Link> : inner
}

function BarChart({ days }) {
  const max = Math.max(...days.map((d) => d.count), 1)
  if (!days.length || days.every((d) => !d.count)) {
    return (
      <div className="mt-4 h-44 flex flex-col items-center justify-center text-gray-400">
        <BarChart3 size={28} className="mb-2 opacity-50" />
        <span className="text-sm">No booking data for this period.</span>
      </div>
    )
  }
  return (
    <div className="mt-4">
      <div className="flex items-end justify-between gap-2 h-44">
        {days.map((d) => (
          <div key={d.label} className="flex-1 h-full flex flex-col justify-end items-center">
            <div className="text-[11px] font-bold text-gray-600 mb-1">{d.count}</div>
            <div className="w-full max-w-[34px] rounded-t bg-maroon-700" style={{ height: `${Math.max((d.count / max) * 100, d.count ? 3 : 0)}%` }} />
          </div>
        ))}
      </div>
      <div className="flex justify-between gap-2 mt-2 border-t border-gray-100 pt-2">
        {days.map((d) => <div key={d.label} className="flex-1 text-center text-[10px] text-gray-400 leading-tight">{d.label}</div>)}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const name = user?.name || 'Administrator'
  const role = user?.role === 'Admin' ? 'Administrator' : (user?.role || '')
  const [d, setD] = useState(null)
  const todayISO = new Date().toISOString().slice(0, 10)
  const monthStartISO = todayISO.slice(0, 8) + '01'
  const [start, setStart] = useState(todayISO)
  const [end, setEnd] = useState(todayISO)

  const load = useCallback(
    () => DashboardAPI.get({ start, end }).then(setD).catch(() => setD(null)),
    [start, end],
  )
  useEffect(() => { load() }, [load])

  const rangeLabel = d?.range?.label || ''
  const rangeSub = d?.range?.single ? (start === todayISO ? '(Today)' : `(${rangeLabel})`) : `(${rangeLabel})`
  const setPreset = (from, to) => { setStart(from); setEnd(to) }
  const shift = (days) => { const t = new Date(); t.setDate(t.getDate() - days); return t.toISOString().slice(0, 10) }
  const activePreset = () => {
    if (start === todayISO && end === todayISO) return 'today'
    if (start === shift(6) && end === todayISO) return '7d'
    if (start === shift(29) && end === todayISO) return '30d'
    if (start === monthStartISO && end === todayISO) return 'month'
    return 'custom'
  }
  const ap = activePreset()

  const t = d?.tiles
  const dc = d?.donations_by_category
  const donutSegs = (dc?.items || []).map((it, i) => ({ label: it.fund, value: it.amount, pct: it.pct, color: DON_COLORS[i % DON_COLORS.length] }))

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-serif text-[28px] font-bold text-maroon-800">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Welcome back, {name} ({role})</p>
        </div>
        <div className="flex flex-col items-stretch lg:items-end gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {[['today', 'Today', () => setPreset(todayISO, todayISO)],
              ['7d', '7 Days', () => setPreset(shift(6), todayISO)],
              ['30d', '30 Days', () => setPreset(shift(29), todayISO)],
              ['month', 'This Month', () => setPreset(monthStartISO, todayISO)]].map(([key, label, fn]) => (
              <button key={key} onClick={fn}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition ${ap === key ? 'bg-maroon-700 text-cream border-maroon-700' : 'bg-white text-gray-600 border-gray-200 hover:border-maroon-300'}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Calendar size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input type="date" value={start} max={end || todayISO} onChange={(e) => setStart(e.target.value)}
                title="From date" className="bg-white border border-gray-200 rounded-lg pl-9 pr-2 py-2 text-[13px] text-gray-600 shadow-sm focus:outline-none focus:ring-2 focus:ring-gold-400" />
            </div>
            <span className="text-gray-400 text-sm">to</span>
            <div className="relative">
              <Calendar size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input type="date" value={end} min={start} max={todayISO} onChange={(e) => setEnd(e.target.value)}
                title="To date" className="bg-white border border-gray-200 rounded-lg pl-9 pr-2 py-2 text-[13px] text-gray-600 shadow-sm focus:outline-none focus:ring-2 focus:ring-gold-400" />
            </div>
            <button onClick={load} className="btn-maroon !py-2"><RotateCcw size={15} /> Refresh</button>
          </div>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        <Kpi to="/admin/bookings" icon={CalendarDays} iconBg="bg-blue-50" iconColor="#2563eb" title="Pooja Bookings" sub={rangeSub}
          value={t ? num(t.pooja_bookings.count) : '—'} footLabel="Total Amount" footValue={inr(t?.pooja_bookings.amount)} />
        <Kpi to="/admin/donations" icon={HandHeart} iconBg="bg-emerald-50" iconColor="#059669" title="Donations Received" sub={rangeSub}
          value={t ? inr(t.donations.amount) : '—'} footLabel="Total Receipts" footValue={t ? num(t.donations.receipts) : '—'} />
        <Kpi to="/admin/hundi" icon={HandCoins} iconBg="bg-amber-50" iconColor="#d97706" title="Hundi Collection" sub={rangeSub}
          value={t ? inr(t.hundi.amount) : '—'} footLabel="Period" footValue={rangeLabel || '—'} />
        <Kpi to="/admin/auction" icon={Gavel} iconBg="bg-violet-50" iconColor="#7c3aed" title="Auction Sales" sub={rangeSub}
          value={t ? inr(t.auction.amount) : '—'} footLabel="Period" footValue={rangeLabel || '—'} />
        <Kpi to="/admin/annadanam" icon={Flame} iconBg="bg-orange-50" iconColor="#ea580c" title="Annadanam Sponsors" sub={rangeSub}
          value={t ? num(t.annadanam.count) : '—'} footLabel="Beneficiaries" footValue={t ? num(t.annadanam.beneficiaries) : '—'} />
        <Kpi to="/admin/waste-sales" icon={Recycle} iconBg="bg-emerald-50" iconColor="#059669" title="Waste Material Sales" sub={rangeSub}
          value={t ? inr(t.waste.amount) : '—'} footLabel="Total Weight" footValue={t ? `${num(t.waste.weight)} Kg` : '—'} />
      </div>

      {/* Row: Today's Overview | Week chart | Recent Bookings */}
      <div className="grid lg:grid-cols-3 gap-5 mb-5">
        {/* Today's Overview */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-serif text-lg font-bold text-maroon-800">{ap === 'today' ? "Today's Overview" : 'Overview'} <span className="text-xs font-sans font-normal text-gray-400">({rangeLabel})</span></h3>
          <div className="mt-4 space-y-3">
            {(d?.today_overview || []).map((o) => {
              const m = OVERVIEW_ICONS[o.label] || { icon: CalendarDays, c: '#6b7280', bg: 'bg-gray-50' }
              const Icon = m.icon
              const to = OVERVIEW_ROUTE[o.label]
              const row = (
                <div className={`flex items-center gap-3 rounded-lg -mx-1 px-1 py-1 ${to ? 'hover:bg-gray-50' : ''}`}>
                  <div className={`w-9 h-9 rounded-lg grid place-items-center shrink-0 ${m.bg}`} style={{ color: m.c }}><Icon size={17} /></div>
                  <span className="text-[13px] text-gray-600 flex-1">{o.label}</span>
                  <span className="text-[13px] font-bold text-gray-700">{num(o.count)}</span>
                  <span className="text-[13px] font-bold text-maroon-700 w-24 text-right">{inr(o.amount)}</span>
                </div>
              )
              return to ? <Link key={o.label} to={to} className="block">{row}</Link> : <div key={o.label}>{row}</div>
            })}
          </div>
          <Link to="/admin/reports" className="mt-4 flex items-center justify-center gap-2 border border-maroon-200 text-maroon-700 rounded-lg py-2.5 text-[13px] font-semibold hover:bg-maroon-50"><TrendingUp size={15} /> View All Reports</Link>
        </div>

        {/* Week chart */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-serif text-lg font-bold text-maroon-800">Pooja Bookings <span className="text-xs font-sans font-normal text-gray-400">– {ap === 'today' ? 'This Week' : rangeLabel}</span></h3>
          <div className="text-[11px] text-gray-400 mt-0.5">No. of Bookings</div>
          {d && <BarChart days={d.week_chart.days} />}
          <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-gray-100 text-center">
            <div><div className="text-[11px] text-gray-400">This Period</div><div className="text-lg font-extrabold text-gray-800 tabular-nums">{d ? num(d.week_chart.this_week) : '—'}</div></div>
            <div><div className="text-[11px] text-gray-400">Prev Period</div><div className="text-lg font-extrabold text-gray-800 tabular-nums">{d ? num(d.week_chart.last_week) : '—'}</div></div>
            <div><div className="text-[11px] text-gray-400">Change</div><div className={`text-lg font-extrabold flex items-center justify-center gap-1 tabular-nums ${d?.week_chart.change_pct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}><TrendingUp size={14} /> {d ? `${d.week_chart.change_pct}%` : '—'}</div></div>
          </div>
        </div>

        {/* Recent Bookings */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-lg font-bold text-maroon-800">Recent Pooja Bookings</h3>
            <Link to="/admin/bookings" className="text-[12px] font-semibold text-maroon-600">View All</Link>
          </div>
          <div className="mt-4 space-y-3">
            {(d?.recent_bookings || []).map((b, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-orange-50 text-orange-500 grid place-items-center shrink-0"><Flame size={16} /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-gray-800 truncate">{b.pooja}{b.plan ? <span className="text-gray-400 font-normal"> ({b.plan})</span> : null}</div>
                  <div className="text-[11px] text-gray-400">{b.devotee}</div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-gray-400 flex items-center gap-1 justify-end"><Clock size={10} /> {b.time}</div>
                  <span className="inline-flex mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700">{b.status}</span>
                </div>
              </div>
            ))}
            {d?.recent_bookings?.length === 0 && <div className="text-xs text-gray-400 py-6 text-center">No recent bookings.</div>}
          </div>
        </div>
      </div>

      {/* Row: Upcoming Special | Donations by Category | Alerts */}
      <div className="grid lg:grid-cols-3 gap-5">
        {/* Upcoming Special Poojas */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-lg font-bold text-maroon-800">Upcoming Special Pooja Bookings</h3>
            <Link to="/admin/bookings" className="text-[12px] font-semibold text-maroon-600">View All</Link>
          </div>
          <div className="mt-4 space-y-3">
            {(d?.upcoming_special || []).map((u, i) => (
              <div key={i} className="flex items-center gap-3 border-b border-dashed border-gray-100 pb-3 last:border-0">
                <div className="w-11 text-center shrink-0">
                  <div className="text-lg font-extrabold text-maroon-700 leading-none">{u.day}</div>
                  <div className="text-[10px] text-gray-400 uppercase">{u.month}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-gray-800">{u.pooja} <span className="text-gray-400 font-normal">({u.plan})</span></div>
                  <div className="text-[11px] text-gray-400">Plan: {u.plan} Pooja</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-gray-400">Bookings</div>
                  <div className="text-base font-extrabold text-maroon-700">{u.count}</div>
                </div>
              </div>
            ))}
            {d?.upcoming_special?.length === 0 && <div className="text-xs text-gray-400 py-6 text-center">No upcoming special poojas.</div>}
          </div>
        </div>

        {/* Donations by Category */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-serif text-lg font-bold text-maroon-800">Donations by Category <span className="text-xs font-sans font-normal text-gray-400">({rangeLabel})</span></h3>
          <div className="flex items-center gap-4 mt-4">
            {donutSegs.length > 0
              ? <Donut segments={donutSegs} total="" centerLabel="" size={140} />
              : <div className="w-[140px] h-[140px] rounded-full border-[16px] border-gray-100 shrink-0" />}
            <div className="flex-1 space-y-2">
              {donutSegs.map((s) => (
                <div key={s.label} className="flex items-center justify-between text-[12px]">
                  <span className="flex items-center gap-2 text-gray-600"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</span>
                  <span className="text-gray-500">{inr(s.value)} <span className="text-gray-400">({s.pct}%)</span></span>
                </div>
              ))}
              {donutSegs.length === 0 && <div className="text-xs text-gray-400">No donations this week.</div>}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
            <span className="text-[13px] text-gray-500">Total Donations ({rangeLabel})</span>
            <span className="text-lg font-extrabold text-maroon-700">{inr(dc?.total)}</span>
          </div>
        </div>

        {/* Important Alerts */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-serif text-lg font-bold text-maroon-800">Important Alerts</h3>
          <div className="mt-4 space-y-3">
            {(d?.alerts || []).map((a, i) => {
              const map = { hundi: { icon: Calendar, c: '#d97706', bg: 'bg-amber-50' }, auction: { icon: Gavel, c: '#7c3aed', bg: 'bg-violet-50' }, donation: { icon: HeartHandshake, c: '#e11d48', bg: 'bg-rose-50' }, waste: { icon: Recycle, c: '#059669', bg: 'bg-emerald-50' } }
              const m = map[a.type] || map.hundi
              const Icon = m.icon
              const to = ALERT_ROUTE[a.type] || '/admin/hundi'
              return (
                <Link key={i} to={to} className="flex items-center gap-3 border border-gray-100 rounded-lg px-3 py-2.5 hover:bg-gray-50 hover:border-maroon-200 transition">
                  <div className={`w-9 h-9 rounded-lg grid place-items-center shrink-0 ${m.bg}`} style={{ color: m.c }}><Icon size={16} /></div>
                  <span className="text-[13px] text-gray-600 flex-1">{a.text}</span>
                  <ChevronRight size={16} className="text-gray-300" />
                </Link>
              )
            })}
            {d?.alerts?.length === 0 && <div className="text-xs text-gray-400 py-6 text-center">No alerts.</div>}
          </div>
        </div>
      </div>

      <div className="mt-5 text-[12px] text-gray-400 text-center">Note: All amounts shown are for the selected date range. Change the date range to view data for a different period.</div>
    </div>
  )
}
