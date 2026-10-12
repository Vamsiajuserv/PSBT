import React, { useEffect, useState } from 'react'
import { Star, Sunrise, Sunset, Users, Sparkles, TrendingUp, IndianRupee, CalendarDays, Moon, LayoutGrid } from 'lucide-react'
import { T, tr } from '../../../i18n/LanguageContext.jsx'
import {
  DOW_EN, DOW_TE, isoOf, isToday, STATUS_DOT, STATUS_CHIP, festLabel, tithiDayLabel, inrShort, pv,
  MoonIcon, DayDetail, DayModal, MonthSpecials, Legend,
} from './shared.jsx'

// ── Calendar design previews ────────────────────────────────────────────────
// Five alternative layouts over the same data. Shown only while an Administrator
// picks one (Calendar.jsx ?design=1..5); the chosen one replaces the current view.

export const DESIGNS = [
  { id: 1, name: 'Panchang grid', hint: 'Tithi, nakshatra and sunrise in every day, like a printed panchangam' },
  { id: 2, name: 'Temple traditional', hint: 'Maroon and gold, Telugu first, big Pournami and Amavasya' },
  { id: 3, name: 'Modern clean', hint: 'Minimal grid with booking chips and a day panel beside it' },
  { id: 4, name: 'Agenda', hint: 'Mini month plus a day-by-day list; best on mobile' },
  { id: 5, name: 'Insight', hint: 'Booking heatmap with month totals' },
]

export function DesignSwitcher({ design, setDesign }) {
  return (
    <div className="card p-2.5 mb-4 flex flex-wrap items-center gap-2 border-dashed border-gold-300 bg-gold-50/40">
      <span className="text-[0.75rem] font-semibold text-maroon-700 flex items-center gap-1.5 px-1"><LayoutGrid size={14} /> <T>Preview designs</T>:</span>
      {[{ id: 0, name: 'Current' }, ...DESIGNS].map((d) => (
        <button key={d.id} type="button" onClick={() => setDesign(d.id)} title={d.hint ? tr(d.hint) : undefined}
          className={`px-3 py-1.5 rounded-lg text-[0.75rem] font-semibold border transition ${design === d.id ? 'bg-maroon-700 text-white border-maroon-700' : 'bg-white text-gray-700 border-gray-200 hover:border-maroon-300'}`}>
          {d.id ? `${d.id} · ` : ''}{tr(d.name)}
        </button>
      ))}
    </div>
  )
}

export function DesignView({ design, cal }) {
  const View = { 1: PanchangGrid, 2: TempleTraditional, 3: ModernClean, 4: Agenda, 5: Insight }[design]
  return (
    <>
      {cal.error && <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">{cal.error}</div>}
      {View ? <View cal={cal} /> : null}
    </>
  )
}

const dowLabel = (cal, i) => (cal.lang === 'te' ? DOW_TE[i] : tr(DOW_EN[i]))
// '06:00 AM - 07:00 AM' → '6am ' (Google-calendar style chip prefix)
const shortTime = (slot) => {
  const m = String(slot || '').match(/^(\d{1,2}):(\d{2})\s*([AP]M)/i)
  return m ? `${Number(m[1])}${m[2] === '00' ? '' : ':' + m[2]}${m[3].toLowerCase()} ` : ''
}

// ── 1 · Panchang grid (printed-panchangam style) ────────────────────────────
function PanchangGrid({ cal }) {
  const { lang } = cal
  return (
    <>
      <Legend items={[[<MoonIcon type="Pournami" size={12} />, 'Pournami'], [<MoonIcon type="Amavasya" size={12} />, 'Amavasya'],
        [<Star size={12} className="fill-rose-500 text-rose-500" />, 'Festival'], [<Users size={12} className="text-maroon-600" />, 'Bookings'],
        [<span className="text-gray-500">*</span>, 'Provisional']]} />
      <div className="card overflow-x-auto">
        <div className="min-w-[52rem] grid grid-cols-7 bg-gradient-to-r from-orange-700 to-red-800 text-white">
          {DOW_EN.map((d, i) => (
            <div key={d} className="py-2 text-center leading-tight">
              <div className="text-[0.75rem] font-bold uppercase">{tr(d)}</div>
              <div className="text-[0.625rem] text-white/80">{DOW_TE[i]}</div>
            </div>
          ))}
        </div>
        <div className="min-w-[52rem] grid grid-cols-7">
          {cal.cells.map((day, i) => {
            if (!day) return <div key={i} className="min-h-[8.5rem] border-b border-r border-orange-100 bg-orange-50/30" />
            const p = cal.panchangam[day]
            const t = cal.tithisByDay[day]
            const fests = cal.festivalsByDay[day] || []
            const st = cal.dayStats[day]
            const sunday = i % 7 === 0
            const red = sunday || fests.length > 0
            const tithiNo = p ? ((p.tithi - 1) % 15) + 1 : null
            return (
              <button key={i} type="button" onClick={() => cal.setSelectedDay(day)}
                className={`relative min-h-[8.5rem] border-b border-r border-orange-100 p-1.5 text-left flex flex-col hover:bg-orange-50 transition
                  ${isToday(cal, day) ? 'bg-yellow-100/70 ring-2 ring-inset ring-yellow-400' : t?.type === 'Pournami' ? 'bg-amber-50' : 'bg-white'}`}>
                <div className="flex items-center justify-between text-[0.625rem] text-gray-600 leading-tight">
                  <span className="truncate font-medium">{p ? `${pv(p, 'tithi_name', lang)} ${lang === 'te' ? pv(p, 'paksha', lang).replace(' పక్షం', '') : tr(p.paksha)}` : ''}</span>
                  {tithiNo && <span className="font-bold text-orange-700 shrink-0 ml-1">{tithiNo}</span>}
                </div>
                <div className="flex items-center justify-center gap-1.5 my-1">
                  {t && <MoonIcon type={t.type} size={16} />}
                  <span className={`text-3xl font-bold leading-none ${red ? 'text-red-600' : 'text-gray-800'}`}>{day}</span>
                </div>
                {p && (
                  <div className="flex items-center justify-between text-[0.5625rem] text-gray-500">
                    <span className="flex items-center gap-0.5"><Sunrise size={10} className="text-amber-500" />{p.sunrise_24h}</span>
                    <span className="flex items-center gap-0.5"><Sunset size={10} className="text-orange-500" />{p.sunset_24h}</span>
                  </div>
                )}
                <div className="mt-auto space-y-0.5">
                  {fests.slice(0, 2).map((f, k) => <div key={k} className="text-[0.625rem] font-semibold text-red-600 leading-tight truncate">{festLabel(f)}</div>)}
                  {t && <div className="text-[0.625rem] font-semibold text-amber-700 truncate">{tithiDayLabel(t)}</div>}
                  <div className="flex items-center justify-between text-[0.625rem] text-gray-600">
                    <span className="truncate">{p ? `☆ ${pv(p, 'nakshatra_name', lang)}` : ''}</span>
                    {st?.count > 0 && <span className="flex items-center gap-0.5 text-maroon-700 font-semibold shrink-0"><Users size={10} />{st.count}</span>}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
      <MonthSpecials cal={cal} onPick={cal.setSelectedDay} />
      <DayModal cal={cal} />
    </>
  )
}

// ── 2 · Temple traditional (maroon & gold, Telugu first) ─────────────────────
function TempleTraditional({ cal }) {
  const { lang } = cal
  return (
    <>
      <div className="rounded-2xl overflow-hidden border-2 border-gold-300 shadow-sm bg-[#fffaf0]">
        <div className="bg-gradient-to-r from-maroon-900 via-maroon-800 to-maroon-900 text-gold-200 text-center py-2 text-[0.8125rem] tracking-[0.2em] font-serif">
          ✦  శ్రీ సాయినాథాయ నమః  ✦
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[50rem] grid grid-cols-7 border-b-2 border-gold-300">
            {DOW_EN.map((d, i) => (
              <div key={d} className={`py-2 text-center ${i === 0 ? 'text-red-700' : 'text-maroon-800'}`}>
                <div className="font-telugu text-[0.875rem] font-bold">{DOW_TE[i]}</div>
                <div className="text-[0.625rem] uppercase tracking-wide opacity-70">{tr(d)}</div>
              </div>
            ))}
          </div>
          <div className="min-w-[50rem] grid grid-cols-7 gap-1.5 p-1.5">
            {cal.cells.map((day, i) => {
              if (!day) return <div key={i} className="min-h-[7.5rem]" />
              const p = cal.panchangam[day]
              const t = cal.tithisByDay[day]
              const fests = cal.festivalsByDay[day] || []
              const st = cal.dayStats[day]
              const full = t?.type === 'Pournami', newMoon = t?.type === 'Amavasya'
              return (
                <button key={i} type="button" onClick={() => cal.setSelectedDay(day)}
                  className={`relative min-h-[7.5rem] rounded-xl p-2 text-left flex flex-col border transition hover:shadow-md hover:-translate-y-0.5
                    ${full ? 'bg-gradient-to-br from-yellow-100 via-amber-100 to-yellow-200 border-amber-300'
                      : newMoon ? 'bg-gradient-to-br from-slate-700 to-slate-900 text-slate-100 border-slate-700'
                      : fests.length ? 'bg-rose-50 border-rose-200' : 'bg-white border-gold-100'}
                    ${isToday(cal, day) ? 'ring-2 ring-maroon-600 ring-offset-1' : ''}`}>
                  {fests.length > 0 && (
                    <div className="absolute -top-1 left-2 right-2 bg-gradient-to-r from-maroon-700 to-orange-600 text-white text-[0.5625rem] font-semibold rounded-b-md px-1.5 py-0.5 truncate shadow">
                      🪔 {festLabel(fests[0])}{fests.length > 1 ? ` +${fests.length - 1}` : ''}
                    </div>
                  )}
                  <div className={`flex items-start justify-between ${fests.length ? 'mt-3' : ''}`}>
                    <span className={`font-serif text-2xl font-bold leading-none ${newMoon ? '' : i % 7 === 0 ? 'text-red-700' : 'text-maroon-800'}`}>{day}</span>
                    {t && <MoonIcon type={t.type} size={full ? 26 : 22} />}
                  </div>
                  {t && <div className={`text-[0.6875rem] font-bold mt-1 ${newMoon ? 'text-slate-200' : 'text-amber-800'}`}>{tithiDayLabel(t)}</div>}
                  <div className={`mt-auto text-[0.6875rem] leading-tight ${newMoon ? 'text-slate-300' : 'text-gray-700'}`}>
                    {p && <div className="font-telugu font-semibold truncate">{p.tithi_name_te}</div>}
                    {p && lang !== 'te' && <div className="text-[0.5625rem] opacity-70 truncate">{p.tithi_name} · {p.nakshatra_name}</div>}
                  </div>
                  {st?.count > 0 && (
                    <span className={`absolute bottom-1.5 right-1.5 text-[0.625rem] font-bold rounded-full px-1.5 py-0.5 ${newMoon ? 'bg-white/20' : 'bg-maroon-700 text-white'}`}>🙏 {st.count}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>
      <MonthSpecials cal={cal} onPick={cal.setSelectedDay} />
      <DayModal cal={cal} />
    </>
  )
}

// ── 3 · Modern clean (minimal grid + day panel) ─────────────────────────────
function ModernClean({ cal }) {
  const first = isToday(cal, cal.today.getDate()) ? cal.today.getDate() : 1
  const day = cal.selectedDay || first
  return (
    <div className="grid lg:grid-cols-[1fr_22rem] gap-4 items-start">
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <div className="min-w-[44rem] grid grid-cols-7 border-b border-gray-200">
          {DOW_EN.map((d, i) => <div key={d} className="px-2 py-2 text-[0.6875rem] font-semibold text-gray-500 uppercase">{dowLabel(cal, i)}</div>)}
        </div>
        <div className="min-w-[44rem] grid grid-cols-7">
          {cal.cells.map((d, i) => {
            if (!d) return <div key={i} className="min-h-[7rem] border-b border-r border-gray-100 bg-gray-50/60" />
            const ev = cal.byDay[d] || []
            const t = cal.tithisByDay[d]
            const fests = cal.festivalsByDay[d] || []
            const sel = d === day
            return (
              <button key={i} type="button" onClick={() => cal.setSelectedDay(d)}
                className={`min-h-[7rem] border-b border-r border-gray-100 p-1.5 text-left flex flex-col gap-1 transition ${sel ? 'bg-blue-50/70' : 'hover:bg-gray-50'}`}>
                <div className="flex items-center justify-between">
                  <span className={`w-6 h-6 grid place-items-center rounded-full text-[0.75rem] font-semibold ${isToday(cal, d) ? 'bg-blue-600 text-white' : 'text-gray-700'}`}>{d}</span>
                  <span className="flex items-center gap-1">
                    {fests.length > 0 && <span className="w-2 h-2 rounded-full bg-rose-500" title={fests.map(festLabel).join(', ')} />}
                    {t && <MoonIcon type={t.type} size={12} />}
                  </span>
                </div>
                {fests.slice(0, 1).map((f, k) => <div key={k} className="text-[0.625rem] rounded px-1.5 py-0.5 bg-rose-100 text-rose-700 font-medium truncate">{festLabel(f)}</div>)}
                {ev.slice(0, 2).map((e, k) => (
                  <div key={k} className="text-[0.625rem] rounded px-1.5 py-0.5 truncate flex items-center gap-1 bg-gray-50">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: STATUS_DOT[e.status] || '#9ca3af' }} />
                    <span className="truncate text-gray-700">{shortTime(e.time)}{tr(e.title)}</span>
                  </div>
                ))}
                {ev.length > 2 && <div className="text-[0.625rem] text-gray-500 px-1">+{ev.length - 2} {tr('more')}</div>}
              </button>
            )
          })}
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-4 lg:sticky lg:top-4">
        <DayDetail cal={cal} day={day} />
      </div>
    </div>
  )
}

// ── 4 · Agenda (mini month + day list) ───────────────────────────────────────
function Agenda({ cal }) {
  const { lang } = cal
  const [onlyBusy, setOnlyBusy] = useState(false)
  const days = Array.from({ length: cal.daysInMonth }, (_, i) => i + 1)
    .filter((d) => !onlyBusy || cal.byDay[d]?.length || cal.tithisByDay[d] || cal.festivalsByDay[d]?.length)
  useEffect(() => {
    if (cal.selectedDay) document.getElementById(`agenda-${cal.selectedDay}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [cal.selectedDay])
  return (
    <div className="grid lg:grid-cols-[17rem_1fr] gap-4 items-start">
      <div className="card p-3 lg:sticky lg:top-4">
        <div className="grid grid-cols-7 text-center text-[0.625rem] font-semibold text-gray-500 mb-1">
          {DOW_EN.map((d, i) => <div key={d}>{dowLabel(cal, i).slice(0, lang === 'te' ? 4 : 2)}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {cal.cells.map((d, i) => {
            if (!d) return <div key={i} />
            const t = cal.tithisByDay[d], f = cal.festivalsByDay[d]?.length, n = cal.byDay[d]?.length
            return (
              <button key={i} type="button" onClick={() => cal.setSelectedDay(d)}
                className={`aspect-square rounded-md text-[0.75rem] flex flex-col items-center justify-center relative
                  ${cal.selectedDay === d ? 'bg-maroon-700 text-white' : isToday(cal, d) ? 'bg-gold-100 text-maroon-800 font-bold' : 'hover:bg-gray-100 text-gray-700'}`}>
                {d}
                <span className="flex gap-0.5 h-1.5 mt-0.5">
                  {t && <span className={`w-1.5 h-1.5 rounded-full ${t.type === 'Pournami' ? 'bg-amber-400' : 'bg-gray-600'}`} />}
                  {f > 0 && <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />}
                  {n > 0 && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                </span>
              </button>
            )
          })}
        </div>
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-1 text-[0.6875rem] text-gray-600">
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" />{tr('Pournami')} · <span className="w-2 h-2 rounded-full bg-gray-600" />{tr('Amavasya')}</div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500" />{tr('Festival')} · <span className="w-2 h-2 rounded-full bg-emerald-500" />{tr('Bookings')}</div>
        </div>
        <label className="mt-3 flex items-center gap-2 text-[0.75rem] text-gray-700 cursor-pointer">
          <input type="checkbox" checked={onlyBusy} onChange={(e) => setOnlyBusy(e.target.checked)} /> <T>Only days with events</T>
        </label>
      </div>
      <div className="space-y-2">
        {days.map((d) => {
          const p = cal.panchangam[d], t = cal.tithisByDay[d], fests = cal.festivalsByDay[d] || [], st = cal.dayStats[d]
          const open = cal.selectedDay === d
          const dow = new Date(cal.year, cal.month, d).getDay()
          return (
            <div key={d} id={`agenda-${d}`} className={`card overflow-hidden ${open ? 'ring-2 ring-maroon-300' : ''}`}>
              <button type="button" onClick={() => cal.setSelectedDay(open ? null : d)} className="w-full flex items-center gap-3 p-3 text-left hover:bg-gold-50/40">
                <div className={`w-14 shrink-0 text-center rounded-lg py-1.5 ${isToday(cal, d) ? 'bg-maroon-700 text-white' : dow === 0 ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-800'}`}>
                  <div className="text-xl font-bold leading-none">{d}</div>
                  <div className="text-[0.625rem] uppercase mt-0.5">{dowLabel(cal, dow)}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {t && <span className={`inline-flex items-center gap-1 text-[0.6875rem] font-semibold rounded-full px-2 py-0.5 ${t.type === 'Pournami' ? 'bg-amber-100 text-amber-800' : 'bg-gray-200 text-gray-800'}`}><MoonIcon type={t.type} size={11} />{tithiDayLabel(t)}</span>}
                    {fests.map((f, k) => <span key={k} className="text-[0.6875rem] font-semibold rounded-full px-2 py-0.5 bg-rose-100 text-rose-700">★ {festLabel(f)}</span>)}
                  </div>
                  <div className="text-[0.75rem] text-gray-600 mt-0.5 truncate">
                    {p ? `${pv(p, 'tithi_name', lang)} · ${pv(p, 'nakshatra_name', lang)} · ${tr('Rahukalam')} ${p.rahukalam?.start_24h}` : ''}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {st?.count > 0 ? <>
                    <div className="text-[0.8125rem] font-bold text-maroon-700">{st.count} {tr('bookings')}</div>
                    {cal.canSeeAmounts && <div className="text-[0.6875rem] text-emerald-700">{inrShort(st.revenue)}</div>}
                  </> : <div className="text-[0.6875rem] text-gray-400">—</div>}
                </div>
              </button>
              {open && <div className="border-t border-gray-100 p-4 bg-white"><DayDetail cal={cal} day={d} /></div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── 5 · Insight (booking heatmap + month totals) ─────────────────────────────
function Insight({ cal }) {
  const counts = Object.values(cal.dayStats).map((s) => s.count)
  const max = Math.max(1, ...counts)
  const total = counts.reduce((a, b) => a + b, 0)
  const revenue = Object.values(cal.dayStats).reduce((a, s) => a + s.revenue, 0)
  const busiest = Object.entries(cal.dayStats).sort((a, b) => b[1].count - a[1].count)[0]
  const specials = Array.from({ length: cal.daysInMonth }, (_, i) => i + 1)
    .filter((d) => cal.tithisByDay[d] || cal.festivalsByDay[d]?.length).length
  const shade = (n) => (n ? `rgba(122, 22, 40, ${0.08 + 0.72 * (n / max)})` : undefined)
  const tiles = [
    [CalendarDays, 'Bookings this month', total],
    ...(cal.canSeeAmounts ? [[IndianRupee, 'Collections', inrShort(revenue)]] : []),
    [TrendingUp, 'Busiest day', busiest ? `${busiest[0]} ${tr(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][cal.month])} (${busiest[1].count})` : '—'],
    [Sparkles, 'Special days', specials],
  ]
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {tiles.map(([Icon, label, value]) => (
          <div key={label} className="card p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-maroon-50 text-maroon-700 grid place-items-center"><Icon size={17} /></div>
            <div><div className="text-[0.6875rem] text-gray-500">{tr(label)}</div><div className="text-lg font-bold text-gray-800">{value}</div></div>
          </div>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <div className="min-w-[44rem] grid grid-cols-7 text-[0.6875rem] font-semibold text-gray-500 uppercase border-b border-gray-100">
          {DOW_EN.map((d, i) => <div key={d} className="px-2 py-2 text-center">{dowLabel(cal, i)}</div>)}
        </div>
        <div className="min-w-[44rem] grid grid-cols-7 gap-1 p-1">
          {cal.cells.map((d, i) => {
            if (!d) return <div key={i} className="min-h-[5.5rem]" />
            const st = cal.dayStats[d], t = cal.tithisByDay[d], fests = cal.festivalsByDay[d] || []
            const n = st?.count || 0
            const dark = n / max > 0.55
            return (
              <button key={i} type="button" onClick={() => cal.setSelectedDay(d)} style={{ background: shade(n) }}
                className={`min-h-[5.5rem] rounded-lg p-2 text-left flex flex-col border ${n ? 'border-transparent' : 'border-gray-100 bg-gray-50/50'} ${isToday(cal, d) ? 'ring-2 ring-gold-400' : ''} hover:ring-2 hover:ring-maroon-300`}>
                <div className="flex items-center justify-between">
                  <span className={`text-[0.75rem] font-semibold ${dark ? 'text-white' : 'text-gray-700'}`}>{d}</span>
                  <span className="flex items-center gap-1">
                    {fests.length > 0 && <Star size={11} className={dark ? 'fill-white text-white' : 'fill-rose-500 text-rose-500'} />}
                    {t && <MoonIcon type={t.type} size={11} />}
                  </span>
                </div>
                <div className={`mt-auto ${dark ? 'text-white' : 'text-maroon-800'}`}>
                  {n > 0 && <div className="text-xl font-bold leading-none">{n}</div>}
                  {n > 0 && cal.canSeeAmounts && <div className={`text-[0.625rem] ${dark ? 'text-white/80' : 'text-gray-500'}`}>{inrShort(st.revenue)}</div>}
                </div>
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-2 px-3 py-2 border-t border-gray-100 text-[0.6875rem] text-gray-500">
          <T>Fewer bookings</T>
          {[0.1, 0.3, 0.5, 0.7, 0.9].map((a) => <span key={a} className="w-5 h-3 rounded" style={{ background: `rgba(122, 22, 40, ${a})` }} />)}
          <T>More bookings</T>
          <span className="ml-auto flex items-center gap-3">
            <span className="flex items-center gap-1"><Star size={11} className="fill-rose-500 text-rose-500" />{tr('Festival')}</span>
            <span className="flex items-center gap-1"><MoonIcon type="Pournami" size={11} />{tr('Pournami')}</span>
            <span className="flex items-center gap-1"><MoonIcon type="Amavasya" size={11} />{tr('Amavasya')}</span>
          </span>
        </div>
      </div>
      <MonthSpecials cal={cal} onPick={cal.setSelectedDay} />
      <DayModal cal={cal} />
    </>
  )
}
