import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarDays, HeartHandshake, HandHeart, HandCoins, Gavel, Flame, Recycle,
  Calendar, Filter, RotateCcw, TrendingUp, ArrowRight, Clock, ChevronRight, BarChart3, Loader2,
} from 'lucide-react'
import { Donut } from '../../components/common/UI.jsx'
import { useAuth, useHasModule } from '../../auth/AuthContext.jsx'
import { DashboardAPI } from '../../api/client.js'
import { DateField } from '../../components/common/Field.jsx'
import { toast } from '../../components/common/Dialog.jsx'
import { T, tr, personName, useLang } from '../../i18n/LanguageContext.jsx'

const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN')
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
// Alerts arrive as a key plus values, so the sentence is built in the reader's
// language instead of being assembled as English on the server. `text` is the
// fallback for an alert the client doesn't have a template for.
const ALERT_TEXT = {
  hundi_pending_verification: '{count} hundi collection(s) awaiting committee verification',
  hundi_pending_deposit: '{count} verified collection(s) pending bank deposit',
  auction_open: '{count} auction(s) open — record the result when concluded',
  festival_upcoming: '{festival} begins {date} — confirm committee prices in the Festival Master',
}

function alertText(a) {
  const template = ALERT_TEXT[a.key]
  if (!template) return tr(a.text || '')
  return tr(template).replace(/\{(\w+)\}/g, (_, k) => {
    const v = a.params?.[k] ?? ''
    // Festival names and month tokens are words; counts are digits.
    return k === 'count' ? v : tr(String(v)).replace(/[A-Za-z]{3,}/g, (w) => tr(w))
  })
}

const ALERT_ROUTE = { hundi: '/admin/hundi', auction: '/admin/auction', donation: '/admin/donations', waste: '/admin/waste-sales' }

function Kpi({ icon: Icon, iconBg, iconColor, title, sub, value, footLabel, footValue, to }) {
  const inner = (
    <div className={`bg-gradient-to-br from-white to-gray-50/50 rounded-xl border border-gray-100 shadow-sm p-4 h-full overflow-hidden flex flex-col ${to ? 'cursor-pointer transition-all duration-300 hover:shadow-lg hover:border-maroon-200 hover:-translate-y-0.5 focus-within:ring-2 focus-within:ring-maroon-500 focus-within:ring-offset-2' : ''}`}>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${iconBg}`} style={{ color: iconColor }}>
          <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[0.8125rem] font-semibold text-gray-600 leading-tight">{title}</div>
          {sub && <div className="text-[0.6875rem] text-gray-400 mt-0.5">{sub}</div>}
        </div>
      </div>
      <div className="flex-1 flex items-end mt-3">
        <div className="text-xl sm:text-2xl font-extrabold text-gray-800 leading-none tabular-nums whitespace-nowrap">{value}</div>
      </div>
      {footLabel && <div className="mt-3 pt-2.5 border-t border-gray-100/80 text-[0.6875rem] text-gray-500 flex items-center justify-between">
        <span>{footLabel}</span>
        <span className="font-bold text-gray-700 tabular-nums">{footValue}</span>
      </div>}
    </div>
  )
  return to ? <Link to={to} className="block h-full focus:outline-none" aria-label={`${title}: ${value}`}>{inner}</Link> : inner
}

function BarChart({ days = [] }) {
  const max = Math.max(...(days || []).map((d) => d.count), 1)
  if (!days?.length || days.every((d) => !d.count)) {
    return (
      <div className="mt-4 h-44 flex flex-col items-center justify-center text-gray-400">
        <BarChart3 size={28} className="mb-2 opacity-50" />
        <span className="text-sm"><T>No booking data for this period.</T></span>
      </div>
    )
  }
  return (
    <div className="mt-4">
      <div className="flex items-end justify-between gap-2 h-44">
        {days.map((d) => (
          <div key={d.label} className="group flex-1 h-full flex flex-col justify-end items-center" title={`${d.label}: ${d.count}`}>
            <div className="text-[0.6875rem] font-bold text-maroon-700 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">{d.count}</div>
            <div className="w-full max-w-[2.125rem] rounded-t bg-maroon-700 group-hover:bg-maroon-800 transition-colors" style={{ height: `${Math.max((d.count / max) * 100, d.count ? 3 : 0)}%` }} />
          </div>
        ))}
      </div>
      <div className="flex justify-between gap-2 mt-2 border-t border-gray-100 pt-2">
        {days.map((d) => <div key={d.label} className="flex-1 text-center text-[0.625rem] text-gray-400 leading-tight">{d.label}</div>)}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const { lang } = useLang()
  const hasModule = useHasModule()
  const name = personName(user, lang) || tr('Administrator')
  const role = user?.role === 'Admin' ? 'Administrator' : (user?.role || '')
  // Counter Staff sees a simplified view without charts (Item 14)
  const isCounterStaff = user?.role === 'Counter Staff'
  const [d, setD] = useState(null)
  const todayISO = new Date().toISOString().slice(0, 10)
  const monthStartISO = todayISO.slice(0, 8) + '01'
  const [start, setStart] = useState(todayISO)
  const [end, setEnd] = useState(todayISO)

  const load = useCallback(
    () => DashboardAPI.get({ start, end }).then(setD).catch(() => setD(null)),
    [start, end],
  )
  // Manual refresh with visible feedback — a fetch that returns identical data
  // is otherwise indistinguishable from a dead button (DEF-003).
  const [refreshing, setRefreshing] = useState(false)
  const refresh = () => {
    setRefreshing(true)
    Promise.resolve(load()).finally(() => { setRefreshing(false); toast(tr('Dashboard refreshed.'), 'info') })
  }
  useEffect(() => { load() }, [load])

  // The API formats the range as '25 Jul 2026'; the month is a word, so it
  // translates while the numerals stay put.
  const rangeLabel = (d?.range?.label || '').replace(/[A-Za-z]{3,}/g, (w) => tr(w))
  const rangeSub = d?.range?.single ? (start === todayISO ? `(${tr('Today')})` : `(${rangeLabel})`) : `(${rangeLabel})`
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
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="font-serif text-2xl font-bold text-maroon-700"><T>Dashboard</T></h1>
          <p className="text-sm text-gray-500 mt-1">{tr('Welcome back,')} {name}{role && !name.includes(role) ? ` (${tr(role)})` : ''}</p>
        </div>
        <div className="flex flex-col items-stretch lg:items-end gap-2">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={tr('Date range presets')}>
            {[['today', 'Today', () => setPreset(todayISO, todayISO)],
              ['7d', '7 Days', () => setPreset(shift(6), todayISO)],
              ['30d', '30 Days', () => setPreset(shift(29), todayISO)],
              ['month', 'This Month', () => setPreset(monthStartISO, todayISO)]].map(([key, label, fn]) => (
              <button key={key} onClick={fn}
                aria-pressed={ap === key}
                className={`px-2 sm:px-3 py-1.5 rounded-lg text-[0.6875rem] sm:text-[0.75rem] font-semibold border transition focus:outline-none focus:ring-2 focus:ring-maroon-500 focus:ring-offset-1 ${ap === key ? 'bg-maroon-700 text-cream border-maroon-700' : 'bg-white text-gray-600 border-gray-200 hover:border-maroon-300'}`}>
                {tr(label)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <DateField value={start} max={end || todayISO} onChange={(e) => setStart(e.target.value)}
              title={tr("From date")} className="!w-40 !py-2 text-[0.8125rem]" />
            <span className="text-gray-400 text-sm"><T>to</T></span>
            <DateField value={end} min={start} max={todayISO} onChange={(e) => setEnd(e.target.value)}
              title={tr("To date")} className="!w-40 !py-2 text-[0.8125rem]" />
            <button onClick={refresh} disabled={refreshing} className="btn-maroon !py-2">
              <RotateCcw size={15} className={refreshing ? 'animate-spin' : ''} /> {refreshing ? tr('Refreshing…') : tr('Refresh')}</button>
          </div>
        </div>
      </div>

      {/* Loading state */}
      {!d && (
        <div className="flex items-center justify-center py-12 text-gray-400" role="status" aria-live="polite">
          <Loader2 size={24} className="animate-spin mr-3" aria-hidden="true" />
          <span className="text-sm"><T>Loading dashboard data...</T></span>
        </div>
      )}

      {/* KPI tiles — each gated to the module its screen needs, so a counter
          user sees only the collections they actually handle. */}
      {d && <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4 mb-6" role="region" aria-label={tr('Key performance indicators')}>
        {hasModule('Bookings') && <Kpi to="/admin/bookings" icon={CalendarDays} iconBg="bg-blue-50" iconColor="#2563eb" title={tr("Pooja Bookings")} sub={rangeSub}
          value={t ? num(t.pooja_bookings.count) : '—'} footLabel={tr("Period")} footValue={rangeLabel || '—'} />}
        {hasModule('Donations') && <Kpi to="/admin/donations" icon={HandHeart} iconBg="bg-emerald-50" iconColor="#059669" title={tr("Donations Received")} sub={rangeSub}
          value={t ? num(t.donations.receipts) : '—'} footLabel={tr("Period")} footValue={rangeLabel || '—'} />}
        {hasModule('Hundi') && <Kpi to="/admin/hundi" icon={HandCoins} iconBg="bg-amber-50" iconColor="#d97706" title={tr("Hundi Collection")} sub={rangeSub}
          value={t ? num(t.hundi.count) : '—'} footLabel={tr("Period")} footValue={rangeLabel || '—'} />}
        {hasModule('Auction') && <Kpi to="/admin/auction" icon={Gavel} iconBg="bg-violet-50" iconColor="#7c3aed" title={tr("Auction Sales")} sub={rangeSub}
          value={t ? inr(t.auction.amount) : '—'} footLabel={tr("Period")} footValue={rangeLabel || '—'} />}
        {hasModule('Annadanam') && <Kpi to="/admin/annadanam" icon={Flame} iconBg="bg-orange-50" iconColor="#ea580c" title={tr("Annadanam Sponsors")} sub={rangeSub}
          value={t ? num(t.annadanam.count) : '—'} footLabel={tr("Beneficiaries")} footValue={t ? num(t.annadanam.beneficiaries) : '—'} />}
        {hasModule('Counter') && <Kpi to="/admin/waste-sales" icon={Recycle} iconBg="bg-emerald-50" iconColor="#059669" title={tr("Waste Material Sales")} sub={rangeSub}
          value={t ? num(t.waste.count) : '—'} footLabel={tr("Total Weight")} footValue={t ? `${num(t.waste.weight)} ${tr("Kg")}` : '—'} />}
      </div>}

      {/* Row: Today's Overview | Week chart | Recent Bookings - Hidden for Counter Staff (Item 14) */}
      {d && !isCounterStaff && <div className="grid lg:grid-cols-3 gap-4 sm:gap-5 mb-5">
        {/* Today's Overview */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-serif text-lg font-bold text-maroon-800">{ap === 'today' ? tr("Today's Overview") : tr('Overview')} <span className="text-xs font-sans font-normal text-gray-400">({rangeLabel})</span></h3>
          <div className="mt-4 space-y-3">
            {(d?.today_overview || []).map((o) => {
              const m = OVERVIEW_ICONS[o.label] || { icon: CalendarDays, c: '#6b7280', bg: 'bg-gray-50' }
              const Icon = m.icon
              const to = OVERVIEW_ROUTE[o.label]
              const row = (
                <div className={`flex items-center gap-3 rounded-lg -mx-1 px-1 py-1 ${to ? 'hover:bg-gray-50' : ''}`}>
                  <div className={`w-9 h-9 rounded-lg grid place-items-center shrink-0 ${m.bg}`} style={{ color: m.c }}><Icon size={17} /></div>
                  <span className="text-[0.8125rem] text-gray-600 flex-1">{tr(o.label)}</span>
                  <span className="text-[0.8125rem] font-bold text-gray-700">{num(o.count)}</span>
                  <span className="text-[0.8125rem] font-bold text-maroon-700 w-24 text-right">{inr(o.amount)}</span>
                </div>
              )
              return to ? <Link key={o.label} to={to} className="block">{row}</Link> : <div key={o.label}>{row}</div>
            })}
          </div>
          {hasModule('Reports') && <Link to="/admin/reports" className="mt-4 flex items-center justify-center gap-2 border border-maroon-200 text-maroon-700 rounded-lg py-2.5 text-[0.8125rem] font-semibold hover:bg-maroon-50"><TrendingUp size={15} />{' '}<T>View All Reports</T></Link>}
        </div>

        {/* Week chart */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 overflow-x-auto">
          <h3 className="font-serif text-lg font-bold text-maroon-800"><T>Pooja Bookings</T>{' '}<span className="text-xs font-sans font-normal text-gray-400">– {ap === 'today' ? tr('This Week') : rangeLabel}</span></h3>
          <div className="text-[0.6875rem] text-gray-400 mt-0.5"><T>No. of Bookings</T></div>
          {d && <BarChart days={d.week_chart.days} />}
          <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-gray-100 text-center">
            <div><div className="text-[0.6875rem] text-gray-400"><T>This Period</T></div><div className="text-lg font-extrabold text-gray-800 tabular-nums">{d ? num(d.week_chart.this_week) : '—'}</div></div>
            <div><div className="text-[0.6875rem] text-gray-400"><T>Prev Period</T></div><div className="text-lg font-extrabold text-gray-800 tabular-nums">{d ? num(d.week_chart.last_week) : '—'}</div></div>
            <div><div className="text-[0.6875rem] text-gray-400"><T>Change</T></div><div className={`text-lg font-extrabold flex items-center justify-center gap-1 tabular-nums ${d?.week_chart.change_pct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}><TrendingUp size={14} /> {d ? `${d.week_chart.change_pct}%` : '—'}</div></div>
          </div>
        </div>

        {/* Recent Bookings */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-lg font-bold text-maroon-800"><T>Recent Pooja Bookings</T></h3>
            <Link to="/admin/bookings" className="text-[0.75rem] font-semibold text-maroon-600"><T>View All</T></Link>
          </div>
          <div className="mt-4 space-y-3">
            {(d?.recent_bookings || []).map((b, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-orange-50 text-orange-500 grid place-items-center shrink-0"><Flame size={16} /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-[0.8125rem] font-semibold text-gray-800 leading-tight">{tr(b.pooja)}{b.plan ? <span className="text-gray-400 font-normal"> ({tr(b.plan)})</span> : null}</div>
                  <div className="text-[0.6875rem] text-gray-400">{personName({ name: b.devotee }, lang)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[0.6875rem] text-gray-400 flex items-center gap-1 justify-end"><Clock size={10} /> {String(b.time || '').replace(/\b(AM|PM)\b/, (w) => tr(w))}</div>
                  <span className="inline-flex mt-1 px-2 py-0.5 rounded-full text-[0.625rem] font-semibold bg-emerald-50 text-emerald-700">{tr(b.status)}</span>
                </div>
              </div>
            ))}
            {d?.recent_bookings?.length === 0 && <div className="text-xs text-gray-400 py-6 text-center"><T>No recent bookings.</T></div>}
          </div>
        </div>
      </div>}

      {/* Row: Upcoming Special | Donations by Category | Alerts - Hidden for Counter Staff (Item 14) */}
      {d && !isCounterStaff && <div className="grid lg:grid-cols-3 gap-4 sm:gap-5">
        {/* Upcoming Special Poojas */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-lg font-bold text-maroon-800"><T>Upcoming Special Pooja Bookings</T></h3>
            <Link to="/admin/bookings" className="text-[0.75rem] font-semibold text-maroon-600"><T>View All</T></Link>
          </div>
          <div className="mt-4 space-y-3">
            {(d?.upcoming_special || []).map((u, i) => (
              <div key={i} className="flex items-center gap-3 border-b border-dashed border-gray-100 pb-3 last:border-0">
                <div className="w-11 text-center shrink-0">
                  <div className="text-lg font-extrabold text-maroon-700 leading-none">{u.day}</div>
                  <div className="text-[0.625rem] text-gray-400 uppercase">{tr(u.month)}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[0.8125rem] font-semibold text-gray-800">{tr(u.pooja)}{u.plan ? <span className="text-gray-400 font-normal"> ({tr(u.plan)})</span> : null}</div>
                  <div className="text-[0.6875rem] text-gray-400">{u.plan ? `${tr('Plan')}: ${tr(u.plan)} ${tr('Pooja')}` : tr('One-off pooja')}</div>
                </div>
                <div className="text-right">
                  <div className="text-[0.625rem] text-gray-400"><T>Bookings</T></div>
                  <div className="text-base font-extrabold text-maroon-700">{u.count}</div>
                </div>
              </div>
            ))}
            {d?.upcoming_special?.length === 0 && <div className="text-xs text-gray-400 py-6 text-center"><T>No upcoming special poojas.</T></div>}
          </div>
        </div>

        {/* Donations by Category */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <h3 className="font-serif text-base font-bold text-maroon-800"><T>Donations by Category</T>{' '}<span className="text-[0.6875rem] font-sans font-normal text-gray-400">({rangeLabel})</span></h3>
          <div className="flex items-start gap-3 mt-3">
            {donutSegs.length > 0
              ? <Donut segments={donutSegs} total="" centerLabel="" size={120} />
              : <div className="w-[7.5rem] h-[7.5rem] rounded-full border-[0.875rem] border-gray-100 shrink-0" />}
            <div className="flex-1 max-h-[200px] overflow-y-auto space-y-1.5 pr-1">
              {donutSegs.map((s) => (
                <div key={s.label} className="flex items-center justify-between text-[0.6875rem]">
                  <span className="flex items-center gap-1.5 text-gray-600 min-w-0"><span className="w-2 h-2 rounded-sm shrink-0" style={{ background: s.color }} /><span className="leading-tight">{s.label}</span></span>
                  <span className="text-gray-500 shrink-0 ml-2">{inr(s.value)} <span className="text-gray-400">({s.pct}%)</span></span>
                </div>
              ))}
              {donutSegs.length === 0 && <div className="text-xs text-gray-400"><T>No donations this week.</T></div>}
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between">
            <span className="text-[0.75rem] text-gray-500">{tr('Total Donations')} ({rangeLabel})</span>
            <span className="text-base font-extrabold text-maroon-700">{inr(dc?.total)}</span>
          </div>
        </div>

        {/* Important Alerts */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-serif text-lg font-bold text-maroon-800"><T>Important Alerts</T></h3>
          <div className="mt-4 space-y-3">
            {(d?.alerts || []).map((a, i) => {
              const map = { hundi: { icon: Calendar, c: '#d97706', bg: 'bg-amber-50' }, auction: { icon: Gavel, c: '#7c3aed', bg: 'bg-violet-50' }, donation: { icon: HeartHandshake, c: '#e11d48', bg: 'bg-rose-50' }, waste: { icon: Recycle, c: '#059669', bg: 'bg-emerald-50' } }
              const m = map[a.type] || map.hundi
              const Icon = m.icon
              const to = ALERT_ROUTE[a.type] || '/admin/hundi'
              return (
                <Link key={i} to={to} className="flex items-center gap-3 border border-gray-100 rounded-lg px-3 py-2.5 hover:bg-gray-50 hover:border-maroon-200 transition">
                  <div className={`w-9 h-9 rounded-lg grid place-items-center shrink-0 ${m.bg}`} style={{ color: m.c }}><Icon size={16} /></div>
                  <span className="text-[0.8125rem] text-gray-600 flex-1">{alertText(a)}</span>
                  <ChevronRight size={16} className="text-gray-300" />
                </Link>
              )
            })}
            {d?.alerts?.length === 0 && <div className="text-xs text-gray-400 py-6 text-center"><T>No alerts.</T></div>}
          </div>
        </div>
      </div>}

      {d && !isCounterStaff && <div className="mt-5 text-[0.6875rem] sm:text-[0.75rem] text-gray-400 text-center"><T>Note: All amounts shown are for the selected date range. Change the date range to view data for a different period.</T></div>}
    </div>
  )
}
