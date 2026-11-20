import React from 'react'
import { useLang, tr, clock12 } from '../../i18n/LanguageContext.jsx'
import { Search, SlidersHorizontal, ChevronDown } from 'lucide-react'
import FitText from '../common/FitText.jsx'

// Shared admin design-system primitives — matches the Dashboard / Bookings /
// Devotee-Details reference screens so every module looks like one system.

// Whole rupees render without decimals (₹ 1,001); fractional amounts always
// show 2-digit paise (₹ 2,37,884.30 — never a dangling "₹ 2,37,884.3").
export const inr = (n) => {
  const v = Number(n || 0)
  return '₹' + v.toLocaleString('en-IN', Number.isInteger(v) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
export const num = (n) => Number(n || 0).toLocaleString('en-IN')

// Safe money arithmetic - avoids floating point precision issues by working
// with integers (paise) internally. Use for summing/subtracting money amounts.
export const sumMoney = (...amounts) => {
  const total = amounts.reduce((acc, n) => acc + Math.round(Number(n || 0) * 100), 0)
  return total / 100
}
export const roundMoney = (n) => Math.round(Number(n || 0) * 100) / 100
// Dates keep their numerals — only the month token is language-dependent, so
// translate that and leave the digits alone.
const localiseMonth = (out) => out.replace(/[A-Za-z]{3,}/g, (mon) => tr(mon))

// Parse server timestamps as UTC. Server stores in UTC but returns naive ISO strings
// without 'Z' suffix. For datetime strings (contains 'T'), treat as UTC. For date-only
// strings (YYYY-MM-DD), parse normally (no timezone shift needed for calendar dates).
export const parseAsUTC = (s) => {
  if (!s) return null
  const str = String(s)
  // If already has timezone indicator, parse as-is
  if (str.endsWith('Z') || str.includes('+') || (str.includes('T') && str.lastIndexOf('-') > 10)) {
    return new Date(str)
  }
  // If it's a datetime string (has 'T'), treat as UTC by appending 'Z'
  if (str.includes('T')) {
    return new Date(str + 'Z')
  }
  // Date-only string (YYYY-MM-DD) - parse as local date (no UTC shift)
  return new Date(str)
}

export const fmtDate = (s) => (s ? localiseMonth(new Date(s).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })) : '—')
export const fmtStamp = (s) => {
  if (!s) return '—'
  const d = parseAsUTC(s)
  if (!d || isNaN(d.getTime())) return '—'
  const dateStr = localiseMonth(d.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }))
  const timeStr = d.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })
  return `${dateStr}, ${clock12(timeStr)}`
}

// For date-times typed into a form (already IST clock time) — shown as-is, no UTC shift.
export const fmtLocalStamp = (s) => {
  const m = s && String(s).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) return '—'
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])
  const dateStr = localiseMonth(d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }))
  return `${dateStr}, ${clock12(d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }))}`
}

const PILL_TONES = {
  green: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-700', blue: 'bg-blue-50 text-blue-700',
  violet: 'bg-violet-50 text-violet-700', orange: 'bg-orange-50 text-orange-700',
  gray: 'bg-gray-100 text-gray-500', maroon: 'bg-maroon-50 text-maroon-700',
}

export function Pill({ tone = 'gray', children }) {
  const { t } = useLang()
  children = typeof children === 'string' ? t(children) : children
  return <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[0.6875rem] font-semibold ${PILL_TONES[tone] || PILL_TONES.gray}`}>{children}</span>
}

export function PageTitle({ title, subtitle, actions, help }) {
  const { t } = useLang()
  const [open, setOpen] = React.useState(false)
  title = typeof title === 'string' ? t(title) : title
  subtitle = typeof subtitle === 'string' ? t(subtitle) : subtitle
  help = typeof help === 'string' ? t(help) : help
  return (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4 mb-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="font-serif text-2xl font-bold text-maroon-700">{title}</h1>
          {/* ⓘ: the page's description and how-to, opened on demand (2026-11-15) — they used to take
              a banner's worth of space on every visit */}
          {(subtitle || help) && (
            <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} title={t('About this page')} aria-label={t('About this page')}
              className={`${help ? '' : '2xl:hidden'} w-6 h-6 shrink-0 grid place-items-center rounded-full border text-[0.75rem] font-bold font-serif transition ${open ? 'bg-maroon-700 border-maroon-700 text-cream' : 'border-gray-300 text-gray-500 hover:border-maroon-300 hover:text-maroon-700'}`}>i</button>)}
        </div>
        {/* The one-line description only on wide screens — on a laptop / phone the space goes to the data */}
        {subtitle && <p className="hidden 2xl:block text-sm text-gray-500 mt-1">{subtitle}</p>}
        {open && (subtitle || help) && (
          <div className="mt-2 max-w-3xl text-[0.8125rem] text-gray-700 bg-blue-50/60 border border-blue-100 rounded-lg px-3.5 py-2.5 space-y-1">
            {subtitle && <p className="2xl:hidden">{subtitle}</p>}
            {help && <div>{help}</div>}
          </div>)}
      </div>
      {/* Buttons: one line you can swipe on a phone; wrap on wider screens */}
      {actions && <div className="page-actions flex flex-nowrap sm:flex-wrap items-center gap-2 sm:justify-end overflow-x-auto sm:overflow-visible -mx-1 px-1 pb-0.5 sm:p-0 sm:m-0 [&>*]:flex-nowrap sm:[&>*]:flex-wrap [&>*]:shrink-0">{actions}</div>}
    </div>
  )
}

export function KpiRow({ children, cols = 4 }) {
  const c = { 3: 'xl:grid-cols-3', 4: 'xl:grid-cols-4', 5: 'xl:grid-cols-5', 6: 'xl:grid-cols-6' }[cols] || 'xl:grid-cols-4'
  return <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 ${c} gap-3 sm:gap-4 mb-6`} role="region" aria-label={tr("Key metrics")}>{children}</div>
}

export function KpiCard({ icon: Icon, iconBg = 'bg-blue-50', iconColor = '#2563eb', title, sub, value, footLabel, footValue, onClick }) {
  const clickable = typeof onClick === 'function'
  return (
    <div onClick={onClick} role={clickable ? 'button' : undefined} tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `${title}: ${value}` : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
      className={`bg-white rounded-xl border border-gray-100 shadow-sm p-4 sm:p-5 overflow-hidden ${clickable ? 'cursor-pointer transition hover:shadow-md hover:border-maroon-200 focus:outline-none focus:ring-2 focus:ring-maroon-500 focus:ring-offset-2' : ''}`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full grid place-items-center shrink-0 ${iconBg}`} style={{ color: iconColor }}><Icon size={18} aria-hidden="true" /></div>
        <div className="min-w-0 flex-1">
          <div className="text-[0.75rem] sm:text-[0.78125rem] text-gray-500 leading-snug">{title}</div>
          {sub && <div className="text-[0.625rem] sm:text-[0.6875rem] text-gray-400 leading-none">{sub}</div>}
          <div className="text-base sm:text-lg xl:text-xl font-extrabold text-gray-800 mt-1 sm:mt-1.5 leading-tight tabular-nums break-words">{value}</div>
        </div>
      </div>
      {footLabel && <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-gray-100 text-[0.6875rem] sm:text-[0.75rem] text-gray-400 leading-tight">{footLabel} <span className="font-semibold text-gray-700 tabular-nums">{footValue}</span></div>}
    </div>
  )
}

// KPI tile matching the reference screens: pastel circular icon on the left,
// uppercase micro-title, large number, muted subtitle underneath.
// ── Figures above a list (2026-11-15) ─────────────────────────────────────────
// KpiGrid decides how its StatTiles look:
//   strip  (default) — one slim line of figures; a sideways-swipe row on a phone
//   chips  — status counts you click to filter the list (pass onClick + active)
//   note   — one small line of text (setup screens)
//   cards  — compact cards, for overview pages where the figures are the content
const KpiLook = React.createContext('cards')

export function StatTile({ icon: Icon, color = '#8a1c1c', bg = 'bg-maroon-50', title, value, sub, onClick, active }) {
  const { t } = useLang()
  const look = React.useContext(KpiLook)
  title = typeof title === 'string' ? t(title) : title
  sub = typeof sub === 'string' ? t(sub) : sub
  const clickable = typeof onClick === 'function'
  const keys = clickable ? { role: 'button', tabIndex: 0, onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } } : {}
  const hint = typeof sub === 'string' ? sub : undefined
  if (look === 'note') {
    return <span className="whitespace-nowrap" title={hint}>{title} <b className="text-gray-700 tabular-nums">{value}</b></span>
  }
  if (look === 'chips') {
    return (
      <button type="button" onClick={onClick} title={hint} aria-pressed={!!active}
        className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.8125rem] font-semibold whitespace-nowrap transition ${active
          ? 'bg-maroon-700 border-maroon-700 text-cream' : 'bg-white border-gray-200 text-gray-700 hover:border-maroon-300 hover:text-maroon-700'}`}>
        {Icon && <Icon size={14} aria-hidden="true" style={active ? undefined : { color }} />}
        {title}
        <span className={`min-w-[1.5rem] px-1.5 rounded-full text-[0.75rem] tabular-nums ${active ? 'bg-cream/20' : 'bg-gray-100 text-gray-800'}`}>{value}</span>
      </button>
    )
  }
  if (look === 'strip') {
    return (
      <div onClick={onClick} title={hint} aria-label={clickable ? `${title}: ${value}` : undefined} {...keys}
        className={`shrink-0 inline-flex items-center gap-2.5 bg-white rounded-lg border border-gray-100 shadow-sm pl-2.5 pr-3.5 py-2 min-w-0 ${clickable ? 'cursor-pointer hover:border-maroon-200 hover:shadow focus:outline-none focus:ring-2 focus:ring-maroon-500' : ''}`}>
        <span className={`w-7 h-7 rounded-full grid place-items-center shrink-0 ${bg}`} style={{ color }}><Icon size={14} aria-hidden="true" /></span>
        <span className="leading-tight min-w-0">
          <span className="block text-[0.625rem] uppercase tracking-wide text-gray-600 font-semibold whitespace-nowrap">{title}</span>
          <span className="block text-[0.9375rem] font-extrabold text-gray-800 tabular-nums whitespace-nowrap">{value}</span>
        </span>
      </div>
    )
  }
  return (
    <div onClick={onClick} aria-label={clickable ? `${title}: ${value}` : undefined} {...keys}
      className={`bg-white rounded-xl border border-gray-100 shadow-sm p-3 sm:p-4 overflow-hidden h-full flex flex-col ${clickable ? 'cursor-pointer transition hover:shadow-md hover:border-maroon-200 focus:outline-none focus:ring-2 focus:ring-maroon-500 focus:ring-offset-2' : ''}`}>
      <div className="flex items-center gap-3 flex-1">
        <div className={`w-9 h-9 rounded-full grid place-items-center shrink-0 ${bg}`} style={{ color }}><Icon size={17} aria-hidden="true" /></div>
        <div className="min-w-0 flex-1">
          <div className="text-[0.625rem] sm:text-[0.6875rem] uppercase tracking-wide text-gray-600 font-semibold leading-tight">{title}</div>
          <FitText className="text-base sm:text-lg font-extrabold text-gray-800 leading-tight mt-0.5 tabular-nums">{value}</FitText>
        </div>
      </div>
      {sub ? <div className="text-[0.6875rem] sm:text-[0.75rem] text-gray-600 mt-1.5 leading-tight">{sub}</div> : null}
    </div>
  )
}

// The figures above a list. Columns of `cards` follow the width actually available (.kpi-grid
// in index.css); a strip / chips row wraps on a laptop and swipes sideways on a phone.
export function KpiGrid({ children, className, variant = 'strip', label, ...rest }) {
  const n = React.Children.toArray(children).filter(Boolean).length
  if (variant === 'cards') {
    return (
      <KpiLook.Provider value="cards">
        <div className={`kpi-wrap ${className ?? 'mb-4'}`}>
          <div className="kpi-grid" data-n={Math.min(n, 6)} {...rest}>{children}</div>
        </div>
      </KpiLook.Provider>
    )
  }
  if (variant === 'note') {
    return (
      <KpiLook.Provider value="note">
        <p className={`text-[0.75rem] text-gray-500 flex flex-wrap gap-x-4 gap-y-1 ${className ?? 'mb-3'}`} {...rest}>{children}</p>
      </KpiLook.Provider>
    )
  }
  return (
    <KpiLook.Provider value={variant === 'chips' ? 'chips' : 'strip'}>
      <div role="group" aria-label={label} className={`kpi-strip ${className ?? 'mb-4'}`} {...rest}>{children}</div>
    </KpiLook.Provider>
  )
}

// Filters on a phone fold behind one "Filters (n)" button; on a tablet / laptop they show as before.
export function FilterPanel({ active = 0, children, className = '' }) {
  const { t } = useLang()
  const [open, setOpen] = React.useState(false)
  return (
    <div className={className}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="md:hidden w-full flex items-center justify-between gap-2 px-4 py-3 text-[0.875rem] font-semibold text-gray-700">
        <span className="inline-flex items-center gap-2"><SlidersHorizontal size={16} />{t('Filters')}
          {active > 0 && <span className="min-w-[1.25rem] h-5 px-1.5 rounded-full bg-maroon-700 text-cream text-[0.6875rem] grid place-items-center">{active}</span>}</span>
        <ChevronDown size={16} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={open ? '' : 'hidden md:block'}>{children}</div>
    </div>
  )
}

// White card with an optional header row (title + actions)
export function Section({ title, actions, children, className = '', bodyClass = 'p-5' }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden ${className}`}>
      {(title || actions) && (
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          {title && <h3 className="font-serif text-lg font-bold text-maroon-800">{title}</h3>}
          {actions}
        </div>
      )}
      <div className={bodyClass}>{children}</div>
    </div>
  )
}

export function SearchInput({ value, onChange, placeholder, onEnter, className = '', 'aria-label': ariaLabel }) {
  const { t } = useLang()
  return (
    <div className={`relative ${className}`}>
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => onEnter && e.key === 'Enter' && onEnter()}
        placeholder={placeholder}
        aria-label={ariaLabel || t(placeholder) || t('Search')}
        className="input !pl-9 focus:outline-none focus:ring-2 focus:ring-gold-400 focus:border-transparent"
      />
    </div>
  )
}

// Data table with the reference uppercase-gray header + row hover
export function DataTable({ columns, children, footer }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-500">
              {columns.map((c) => <th key={c} className="px-4 py-3 font-semibold whitespace-nowrap">{tr(c)}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">{children}</tbody>
        </table>
      </div>
      {footer && <div className="px-4 py-3.5 border-t border-gray-100">{footer}</div>}
    </div>
  )
}

export const Td = ({ children, className = '' }) => <td className={`px-4 py-3.5 ${className}`}>{children}</td>

// Server-side pager. Renders as two siblings (count + controls) so it drops into
// a `flex items-center justify-between` footer. Buttons enable/disable off total.
export function Pager({ page, size, total, onPage, unit = 'records' }) {
  const { t } = useLang()
  const pageCount = Math.max(1, Math.ceil((total || 0) / size))
  // Jump back to the top on page change — the pager sits at the bottom, so the
  // new page's rows would otherwise start above the viewport (DEF-005).
  const go = (p) => { onPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const from = total === 0 ? 0 : (page - 1) * size + 1
  const to = Math.min(page * size, total || 0)
  const btn = 'px-3 h-8 rounded-lg border border-gray-200 text-[0.75rem] sm:text-[0.8125rem] text-gray-600 disabled:opacity-40 hover:border-maroon-300 focus:outline-none focus:ring-2 focus:ring-maroon-500 focus:ring-offset-1'
  return (
    <>
      <span className="text-[0.75rem] sm:text-[0.8125rem] text-gray-500">{t('Showing')} {from} {t('to')} {to} {t('of')} {num(total)} {t(unit)}</span>
      {total > 0 && <nav className="flex items-center gap-1 sm:gap-1.5" role="navigation" aria-label={t('Pagination')}>
        <button disabled={page <= 1} onClick={() => go(page - 1)} aria-label={t('Previous page')} className={btn}>{t('Previous')}</button>
        <span className="px-2 sm:px-3 h-8 grid place-items-center rounded-lg bg-maroon-700 text-cream text-[0.75rem] sm:text-[0.8125rem] font-semibold" aria-current="page">{page} / {pageCount}</span>
        <button disabled={page >= pageCount} onClick={() => go(page + 1)} aria-label={t('Next page')} className={btn}>{t('Next')}</button>
      </nav>}
    </>
  )
}
