import React from 'react'
import { T, tr } from '../../../i18n/LanguageContext.jsx'
import {
  DOW_EN, DOW_TE, isToday, festLabel, tithiDayLabel, MoonIcon, DayModal, MonthSpecials, Legend,
} from './shared.jsx'

// ── Admin Calendar — "Temple traditional" month view ────────────────────────
// Maroon and gold, Telugu weekdays first. Pournami days glow gold, Amavasya days
// a soft grey, festivals carry a ribbon, and each day shows its Telugu tithi (with
// the nakshatra) and how many poojas are booked. Clicking a day opens the full
// detail (almanac, Panchangam with end times, bookings) in a popup.
// `cal` is assembled in Calendar.jsx from the data it loads.

export default function TempleCalendar({ cal }) {
  const { lang } = cal
  const show = cal.show || { bookings: true, moon: true, festivals: true, panch: true }
  return (
    <>
      <Legend items={[
        [<MoonIcon type="Pournami" size={12} />, 'Pournami'],
        [<MoonIcon type="Amavasya" size={12} />, 'Amavasya'],
        [<span className="w-3 h-3 rounded-sm bg-gradient-to-r from-maroon-700 to-orange-600" />, 'Festival'],
        [<span className="text-[0.625rem] font-bold rounded-full px-1.5 bg-maroon-700 text-white">🙏 2</span>, 'Poojas booked'],
        [<span className="w-3 h-3 rounded-sm ring-2 ring-maroon-600" />, 'Today'],
        [<span className="font-bold text-gray-500">*</span>, 'Provisional — awaiting confirmation against TTD'],
      ]} />

      <div className="rounded-2xl overflow-hidden border-2 border-gold-300 shadow-sm bg-[#fffaf0]">
        {/* No letter-spacing here: it splits Telugu conjunct letters apart */}
        <div className="bg-gradient-to-r from-maroon-900 via-maroon-800 to-maroon-900 text-gold-200 text-center py-2 text-[0.875rem] font-telugu">
          <span className="text-gold-400">✦</span>&nbsp;&nbsp;శ్రీ సాయినాథాయ నమః&nbsp;&nbsp;<span className="text-gold-400">✦</span>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[56rem] grid grid-cols-7 border-b-2 border-gold-300">
            {DOW_EN.map((d, i) => (
              <div key={d} className={`py-2 text-center ${i === 0 ? 'text-red-700' : 'text-maroon-800'}`}>
                <div className="font-telugu text-[0.9375rem] font-bold">{DOW_TE[i]}</div>
                {lang !== 'te' && <div className="text-[0.625rem] uppercase tracking-wide opacity-70">{d}</div>}
              </div>
            ))}
          </div>
          <div className="min-w-[56rem] grid grid-cols-7 gap-1.5 p-1.5">
            {cal.cells.map((day, i) => {
              if (!day) return <div key={i} className="min-h-[8.5rem]" />
              // Each layer can be hidden from the toolbar's "Show" toggles
              const p = show.panch ? cal.panchangam[day] : null
              const t = show.moon ? cal.tithisByDay[day] : null
              const fests = show.festivals ? cal.festivalsByDay[day] || [] : []
              const st = show.bookings ? cal.dayStats[day] : null
              const full = t?.type === 'Pournami'
              const newMoon = t?.type === 'Amavasya'
              const sunday = i % 7 === 0
              return (
                <button key={i} type="button" onClick={() => cal.setSelectedDay(day)}
                  title={fests.length ? fests.map(festLabel).join(', ') : undefined}
                  className={`relative min-h-[8.5rem] rounded-xl p-2 text-left flex flex-col border transition hover:shadow-md hover:-translate-y-0.5
                    ${full ? 'bg-gradient-to-br from-yellow-100 via-amber-100 to-yellow-200 border-amber-300'
                      : newMoon ? 'bg-gradient-to-br from-slate-100 via-slate-200 to-slate-300 border-slate-400'
                      : fests.length ? 'bg-rose-50 border-rose-200' : 'bg-white border-gold-100'}
                    ${isToday(cal, day) ? 'ring-2 ring-maroon-600 ring-offset-1' : ''}`}>
                  {fests.length > 0 && (
                    <div className="absolute -top-1 left-2 right-2 bg-gradient-to-r from-maroon-700 to-orange-600 text-white text-[0.625rem] font-semibold rounded-b-md px-1.5 py-0.5 truncate shadow">
                      🪔 {festLabel(fests[0])}{fests.length > 1 ? ` +${fests.length - 1}` : ''}
                    </div>
                  )}

                  <div className={`flex items-start justify-between ${fests.length ? 'mt-3.5' : ''}`}>
                    <span className={`font-serif text-[1.625rem] font-bold leading-none ${sunday ? 'text-red-700' : 'text-maroon-800'}`}>{day}</span>
                    {t && <MoonIcon type={t.type} size={full ? 26 : 22} />}
                  </div>
                  {t && <div className={`text-[0.6875rem] font-bold mt-1 leading-tight ${newMoon ? 'text-slate-700' : 'text-amber-800'}`}>{tithiDayLabel(t)}</div>}

                  <div className="mt-auto flex items-end justify-between gap-1.5">
                    <div className={`min-w-0 text-[0.6875rem] leading-tight text-gray-700`}>
                      {p && <div className="font-telugu font-semibold truncate">{p.tithi_name_te}</div>}
                      {p && (lang === 'te'
                        ? <div className="font-telugu text-[0.625rem] opacity-80 truncate">{p.nakshatra_name_te}</div>
                        : <div className="text-[0.625rem] opacity-70 truncate">{p.tithi_name} · {p.nakshatra_name}</div>)}
                    </div>
                    {st?.count > 0 && (
                      <span title={`${st.count} ${tr('Poojas booked')}`}
                        className={`shrink-0 text-[0.625rem] font-bold rounded-full px-1.5 py-0.5 bg-maroon-700 text-white`}>🙏 {st.count}</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <MonthSpecials cal={cal} onPick={cal.setSelectedDay} />
      <DayModal cal={cal} />
      {cal.panchError && !Object.keys(cal.panchangam).length && (
        <div className="mt-2 text-[0.75rem] text-gray-500"><T>Panchangam is unavailable right now.</T></div>
      )}
    </>
  )
}
