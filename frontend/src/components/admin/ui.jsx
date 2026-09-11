import React from 'react'
import { useLang, tr } from '../../i18n/LanguageContext.jsx'
import { Search } from 'lucide-react'

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
export const fmtDate = (s) => (s ? localiseMonth(new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })) : '—')
export const fmtStamp = (s) => {
  if (!s) return '—'
  const d = new Date(s)
  const dateStr = localiseMonth(d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }))
  const hours = d.getHours()
  const mins = String(d.getMinutes()).padStart(2, '0')
  const ampm = hours >= 12 ? 'PM' : 'AM'
  const hr12 = hours % 12 || 12
  return `${dateStr}, ${String(hr12).padStart(2, '0')}:${mins} ${ampm}`
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

export function PageTitle({ title, subtitle, actions }) {
  const { t } = useLang()
  title = typeof title === 'string' ? t(title) : title
  subtitle = typeof subtitle === 'string' ? t(subtitle) : subtitle
  return (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
      <div>
        <h1 className="font-serif text-2xl font-bold text-maroon-700">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2 shrink-0">{actions}</div>}
    </div>
  )
}

export function KpiRow({ children, cols = 4 }) {
  const c = { 3: 'xl:grid-cols-3', 4: 'xl:grid-cols-4', 5: 'xl:grid-cols-5', 6: 'xl:grid-cols-6' }[cols] || 'xl:grid-cols-4'
  return <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 ${c} gap-3 sm:gap-4 mb-6`} role="region" aria-label="Key metrics">{children}</div>
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
export function StatTile({ icon: Icon, color = '#8a1c1c', bg = 'bg-maroon-50', title, value, sub, onClick }) {
  const { t } = useLang()
  title = typeof title === 'string' ? t(title) : title
  sub = typeof sub === 'string' ? t(sub) : sub
  const clickable = typeof onClick === 'function'
  return (
    <div onClick={onClick} role={clickable ? 'button' : undefined} tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `${title}: ${value}` : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
      className={`bg-white rounded-xl border border-gray-100 shadow-sm p-4 sm:p-5 overflow-hidden h-full flex flex-col ${clickable ? 'cursor-pointer transition hover:shadow-md hover:border-maroon-200 focus:outline-none focus:ring-2 focus:ring-maroon-500 focus:ring-offset-2' : ''}`}>
      <div className="flex items-center gap-3 flex-1">
        <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full grid place-items-center shrink-0 ${bg}`} style={{ color }}><Icon size={18} aria-hidden="true" /></div>
        <div className="min-w-0 flex-1">
          <div className="text-[0.625rem] sm:text-[0.6875rem] uppercase tracking-wide text-gray-600 font-semibold leading-tight">{title}</div>
          <div className="text-base sm:text-lg xl:text-xl font-extrabold text-gray-800 leading-tight mt-0.5 tabular-nums whitespace-nowrap">{value}</div>
        </div>
      </div>
      <div className="text-[0.6875rem] sm:text-[0.75rem] text-gray-600 mt-2 sm:mt-3 leading-tight min-h-[1rem]">{sub || '\u00A0'}</div>
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
