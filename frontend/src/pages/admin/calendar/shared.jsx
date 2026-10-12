import React, { useState } from 'react'
import { X, Moon, Star, Sunrise, Sunset, Clock, AlertTriangle, Sparkles, IndianRupee, Users } from 'lucide-react'
import { fmtDate } from '../../../components/admin/ui.jsx'
import { T, tr, personName, clock12, shortUnit } from '../../../i18n/LanguageContext.jsx'
import { Select } from '../../../components/common/Field.jsx'

// ── Shared pieces of the admin Calendar ─────────────────────────────────────
// The month view and its day popup receive one `cal` object (built in
// Calendar.jsx from the data it loads): year, month, today, cells, byDay,
// dayStats, festivalsByDay, tithisByDay, panchangam, selectedDay/setSelectedDay,
// lang, canSeeAmounts, isAdmin, confirmPournami, confirming, panchError, error, show.

export const DOW_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const DOW_TE = ['ఆది', 'సోమ', 'మంగళ', 'బుధ', 'గురు', 'శుక్ర', 'శని']
export const pad = (n) => String(n).padStart(2, '0')
export const isoOf = (cal, day) => `${cal.year}-${pad(cal.month + 1)}-${pad(day)}`
export const isToday = (cal, day) =>
  cal.today.getFullYear() === cal.year && cal.today.getMonth() === cal.month && cal.today.getDate() === day

export const STATUS_DOT = { Confirmed: '#059669', Pending: '#d4a017', Completed: '#2563eb', Cancelled: '#dc2626' }
export const STATUS_CHIP = {
  Confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Pending: 'bg-amber-50 text-amber-700 border-amber-200',
  Completed: 'bg-blue-50 text-blue-700 border-blue-200',
  Cancelled: 'bg-red-50 text-red-700 border-red-200',
}

// Almanac festival names arrive already in the reader's language; provisional days get *
export const festLabel = (f) => (f.translated ? f.name : tr(f.name)) + (f.provisional ? ' *' : '')
export const tithiDayLabel = (t) => (t ? (t.label || tr(t.name)) + (t.provisional ? ' *' : '') : '')
export const inrShort = (n) => (n >= 100000 ? `₹${(n / 100000).toFixed(1)}${shortUnit('L')}` : n >= 1000 ? `₹${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}${shortUnit('K')}` : `₹${Math.round(n)}`)

// Panchangam field in the reader's language
export const pv = (p, key, lang) => (p ? (lang === 'te' ? p[`${key}_te`] || p[key] : p[key]) : '')

// '2026-10-25T11:56' → '11:56 AM' (Telugu-aware)
export const timeOf = (iso) => {
  const [h, m] = String(iso || '').slice(11, 16).split(':').map(Number)
  if (Number.isNaN(h)) return ''
  return clock12(`${pad(h % 12 || 12)}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`)
}

export function Until({ end, day, lang }) {
  if (!end?.time) return null
  const when = `${end.date && day && end.date !== day ? `${fmtDate(end.date)} ` : ''}${clock12(end.time)}`
  return <span>{lang === 'te' ? `${when} ${tr('until')}` : `${tr('until')} ${when}`}</span>
}

export function MoonIcon({ type, size = 18 }) {
  // Full moon = gold disc, new moon = dark disc
  const full = type === 'Pournami'
  return (
    <span aria-label={tr(type)} title={tr(type)} className="inline-block rounded-full shrink-0"
      style={{ width: size, height: size, background: full ? 'radial-gradient(circle at 35% 35%, #fff7d6, #f5c542 60%, #d99a06)' : 'radial-gradient(circle at 35% 35%, #6b7280, #1f2937 70%)', boxShadow: full ? '0 0 8px rgba(245,197,66,.8)' : 'none' }} />
  )
}

// ── Day detail (used by every design: in a modal, side panel or inline) ─────
export function DayDetail({ cal, day, onClose }) {
  const { lang, canSeeAmounts } = cal
  const iso = isoOf(cal, day)
  const p = cal.panchangam[day]
  const t = cal.tithisByDay[day]
  const fests = cal.festivalsByDay[day] || []
  const events = cal.byDay[day] || []
  const live = events.filter((e) => e.status !== 'Cancelled')
  const revenue = live.reduce((s, e) => s + (e.amount || 0), 0)
  const dow = new Date(cal.year, cal.month, day).getDay()

  return (
    <div className="text-[0.8125rem]">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-[0.6875rem] uppercase tracking-wide text-gray-500">{lang === 'te' ? DOW_TE[dow] + 'వారం' : tr(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dow])}</div>
          <div className="font-serif text-xl font-bold text-maroon-700">{fmtDate(iso)}</div>
        </div>
        {onClose && <button onClick={onClose} className="w-8 h-8 grid place-items-center rounded-lg text-gray-400 hover:text-maroon-700 hover:bg-maroon-50" aria-label={tr('Close')}><X size={18} /></button>}
      </div>

      {(t || fests.length > 0) && (
        <div className="space-y-2 mb-3">
          {t && (
            <div className={`rounded-lg px-3 py-2 border ${t.type === 'Pournami' ? 'bg-amber-50 border-amber-200' : 'bg-gray-100 border-gray-200'}`}>
              <div className="flex items-center gap-2 font-semibold text-gray-800"><MoonIcon type={t.type} size={16} /> {tithiDayLabel(t)}</div>
              {t.tithi_start && (
                <div className="text-[0.6875rem] text-gray-600 mt-0.5">
                  {tr(t.type === 'Amavasya' ? 'Amavasya tithi' : 'Pournami tithi')}: {fmtDate(t.tithi_start.slice(0, 10))} {timeOf(t.tithi_start)} – {fmtDate(t.tithi_end.slice(0, 10))} {timeOf(t.tithi_end)}
                </div>
              )}
              {t.provisional && (
                <div className="mt-1.5 text-[0.6875rem] text-amber-800">
                  <span className="font-semibold"><T>Provisional — awaiting confirmation against TTD</T></span>
                  {t.review_notes && <span> · {t.review_notes}</span>}
                  {cal.isAdmin && (
                    <button type="button" disabled={cal.confirming} onClick={() => cal.confirmPournami(t)}
                      className="ml-2 px-2 py-0.5 rounded bg-maroon-700 text-white font-semibold hover:bg-maroon-800 disabled:opacity-50">
                      {cal.confirming ? tr('Confirming…') : tr('Confirm — matches TTD calendar')}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {fests.map((f, i) => (
            <div key={i} className="rounded-lg px-3 py-2 bg-rose-50 border border-rose-100 text-rose-800 font-semibold flex items-center gap-2">
              <Star size={13} className="fill-rose-400 text-rose-500" /> {festLabel(f)}
              {f.source !== 'almanac' && !f.isSingle && <span className="text-[0.625rem] font-normal text-rose-600">({tr('Festival Master')})</span>}
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-orange-100 bg-orange-50/50 p-3 mb-3">
        <div className="text-[0.6875rem] font-semibold text-orange-700 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Sparkles size={12} /> <T>Panchangam</T></div>
        {!p ? (
          <div className="text-gray-500 flex items-center gap-1.5"><AlertTriangle size={13} className="text-amber-500" /> <T>Panchangam is unavailable right now.</T></div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {[['Tithi', `${pv(p, 'tithi_name', lang)} · ${pv(p, 'paksha', lang)}`, p.tithi_end],
                ['Nakshatra', pv(p, 'nakshatra_name', lang), p.nakshatra_end],
                ['Yoga', pv(p, 'yoga_name', lang), p.yoga_end],
                ['Karana', pv(p, 'karana_name', lang), p.karana_end]].map(([k, v, end]) => (
                <div key={k}>
                  <div className="text-[0.625rem] uppercase text-gray-500">{tr(k)}</div>
                  <div className="font-semibold text-gray-800">{v}</div>
                  <div className="text-[0.625rem] text-gray-500"><Until end={end} day={iso} lang={lang} /></div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2.5 text-[0.75rem]">
              <div className="flex items-center gap-1.5"><Sunrise size={13} className="text-amber-500" /> {clock12(p.sunrise || '')}</div>
              <div className="flex items-center gap-1.5"><Sunset size={13} className="text-orange-500" /> {clock12(p.sunset || '')}</div>
              <div className="text-emerald-700"><span className="font-semibold">{tr('Abhijit Muhurtam')}:</span> {clock12(p.abhijit_muhurtam?.start || '')} – {clock12(p.abhijit_muhurtam?.end || '')}</div>
              <div className="text-red-700"><span className="font-semibold">{tr('Rahukalam')}:</span> {clock12(p.rahukalam?.start || '')} – {clock12(p.rahukalam?.end || '')}</div>
              <div className="text-orange-700"><span className="font-semibold">{tr('Yamagandam')}:</span> {clock12(p.yamagandam?.start || '')} – {clock12(p.yamagandam?.end || '')}</div>
              <div className="text-gray-700"><span className="font-semibold">{tr('Gulika Kalam')}:</span> {clock12(p.gulika_kalam?.start || '')} – {clock12(p.gulika_kalam?.end || '')}</div>
            </div>
          </>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[0.6875rem] font-semibold text-gray-600 uppercase tracking-wide flex items-center gap-1.5"><Users size={12} /> <T>Bookings</T> ({live.length})</div>
          {canSeeAmounts && revenue > 0 && <div className="text-emerald-700 font-semibold flex items-center"><IndianRupee size={12} />{Math.round(revenue).toLocaleString('en-IN')}</div>}
        </div>
        <DayBookings key={iso} events={events} lang={lang} canSeeAmounts={canSeeAmounts} />
      </div>
    </div>
  )
}

// ── Bookings in the day popup: status chips with counts, sort, and search ────
const STATUSES = ['Confirmed', 'Pending', 'Completed', 'Cancelled']
const STATUS_ORDER = Object.fromEntries(STATUSES.map((s, i) => [s, i]))
// '06:00 AM - 07:00 AM' → minutes since midnight; bookings without a slot go last
const slotMinutes = (slot) => {
  const m = String(slot || '').match(/^(\d{1,2}):(\d{2})\s*([AP]M)/i)
  if (!m) return 24 * 60
  return ((Number(m[1]) % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + Number(m[2])
}
const SORTERS = {
  time: (a, b) => slotMinutes(a.time) - slotMinutes(b.time),
  pooja: (a, b) => String(a.title).localeCompare(String(b.title)) || slotMinutes(a.time) - slotMinutes(b.time),
  status: (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || slotMinutes(a.time) - slotMinutes(b.time),
  amount: (a, b) => (b.amount || 0) - (a.amount || 0),
}
const SEARCH_FROM = 10   // the search box appears on days with more bookings than this

function DayBookings({ events, lang, canSeeAmounts }) {
  const [sort, setSort] = useState('time')
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  if (events.length === 0) return <div className="text-gray-400 text-center py-3"><T>No poojas scheduled on this day.</T></div>

  const counts = Object.fromEntries(STATUSES.map((s) => [s, events.filter((e) => e.status === s).length]))
  const needle = q.trim().toLowerCase()
  const shown = events
    .filter((e) => !status || e.status === status)
    .filter((e) => !needle || [e.devotee, e.mobile, e.title, e.poojari].some((v) => String(v || '').toLowerCase().includes(needle)))
    .slice().sort(SORTERS[sort] || SORTERS.time)
  const chip = (value, label, n) => (
    <button key={value || 'all'} type="button" onClick={() => setStatus(value)} disabled={value && !n}
      className={`px-2 py-0.5 rounded-full border text-[0.6875rem] font-semibold disabled:opacity-40 ${status === value ? 'bg-maroon-700 text-white border-maroon-700' : 'bg-white text-gray-700 border-gray-200 hover:border-maroon-300'}`}>
      {tr(label)} {n}
    </button>
  )
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        {chip('', 'All', events.length)}
        {STATUSES.map((s) => chip(s, s, counts[s]))}
        <div className="ml-auto flex items-center gap-1.5 text-[0.6875rem] text-gray-500">
          <T>Sort</T>
          <Select value={sort} onChange={(e) => setSort(e.target.value)} className="input !w-auto !py-1 text-[0.6875rem]" aria-label={tr('Sort')}>
            <option value="time">{tr('Time')}</option>
            <option value="pooja">{tr('Pooja')}</option>
            <option value="status">{tr('Status')}</option>
            {canSeeAmounts && <option value="amount">{tr('Amount')}</option>}
          </Select>
        </div>
      </div>
      {events.length > SEARCH_FROM && (
        <input value={q} onChange={(e) => setQ(e.target.value)} className="input !py-1.5 text-[0.75rem] mb-2"
          placeholder={tr('Search devotee, mobile, pooja or poojari')} aria-label={tr('Search bookings')} />
      )}
      {shown.length === 0 ? (
        <div className="text-gray-400 text-center py-3"><T>No bookings match.</T></div>
      ) : (
        <ul className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
          {shown.map((e, i) => (
            <li key={i} className={`border rounded-lg px-2.5 py-1.5 ${STATUS_CHIP[e.status] || 'bg-gray-50 border-gray-200'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold truncate">{tr(e.title)}</span>
                <span className="text-[0.625rem] font-semibold px-1.5 py-0.5 rounded-full bg-white/70 shrink-0">{tr(e.status)}</span>
              </div>
              <div className="flex items-center justify-between gap-2 text-[0.6875rem] opacity-80">
                <span className="truncate">{e.devotee ? personName({ name: e.devotee }, lang) : '—'}{e.time ? ` · ${clock12(e.time)}` : ''}{e.poojari ? ` · ${tr('Poojari')}: ${e.poojari}` : ''}</span>
                {canSeeAmounts && e.amount > 0 && <span className="font-semibold shrink-0">₹{Math.round(e.amount).toLocaleString('en-IN')}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

export function DayModal({ cal }) {
  if (!cal.selectedDay) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => cal.setSelectedDay(null)}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[88vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <DayDetail cal={cal} day={cal.selectedDay} onClose={() => cal.setSelectedDay(null)} />
      </div>
    </div>
  )
}

// Month list of special days (festivals, Pournami, Amavasya) — under several designs
export function MonthSpecials({ cal, onPick }) {
  const [kind, setKind] = useState('')
  const items = []
  for (let d = 1; d <= cal.daysInMonth; d++) {
    const t = cal.tithisByDay[d]
    if (t) items.push({ d, kind: t.type, label: tithiDayLabel(t) })
    for (const f of cal.festivalsByDay[d] || []) {
      if (f.source === 'almanac' || f.isSingle || f.isStart) items.push({ d, kind: 'Festival', label: festLabel(f) })
    }
  }
  if (!items.length) return null
  const shown = kind ? items.filter((it) => it.kind === kind) : items
  const kinds = [['', 'All'], ['Festival', 'Festivals'], ['Pournami', 'Pournami'], ['Amavasya', 'Amavasya']]
  return (
    <div className="card p-4 mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="font-serif text-lg font-bold text-maroon-800"><T>Festivals & special days this month</T></div>
        <div className="flex flex-wrap gap-1.5">
          {kinds.map(([k, label]) => {
            const n = k ? items.filter((it) => it.kind === k).length : items.length
            return (
              <button key={k || 'all'} type="button" onClick={() => setKind(k)} disabled={!n}
                className={`px-2.5 py-0.5 rounded-full border text-[0.6875rem] font-semibold disabled:opacity-40 ${kind === k ? 'bg-maroon-700 text-white border-maroon-700' : 'bg-white text-gray-700 border-gray-200 hover:border-maroon-300'}`}>
                {tr(label)} {n}
              </button>
            )
          })}
        </div>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {shown.map((it, i) => (
          <button key={i} type="button" onClick={() => onPick(it.d)}
            className="flex items-center gap-3 text-left rounded-lg border border-gold-100 hover:border-maroon-200 hover:bg-gold-50/40 px-3 py-2">
            <div className={`w-11 text-center rounded-md py-1 shrink-0 ${it.kind === 'Festival' ? 'bg-rose-600 text-white' : it.kind === 'Pournami' ? 'bg-amber-400 text-amber-950' : 'bg-gray-700 text-white'}`}>
              <div className="text-base font-bold leading-none">{it.d}</div>
              <div className="text-[0.5625rem] uppercase">{tr(DOW_EN[new Date(cal.year, cal.month, it.d).getDay()])}</div>
            </div>
            <div className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-gray-800">
              {it.kind === 'Festival' ? <Star size={13} className="fill-rose-400 text-rose-500 shrink-0" /> : <MoonIcon type={it.kind} size={14} />}
              <span>{it.label}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

export function Legend({ items }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[0.75rem] text-gray-600 mb-3">
      {items.map(([node, label], i) => <span key={i} className="flex items-center gap-1.5">{node}{tr(label)}</span>)}
    </div>
  )
}

export { Moon, Star, Sunrise, Sunset, Clock }
