import React from 'react'
import { useSite } from '../../lib/SiteContext.jsx'

// ── Gold flourish divider ────────────────────────────────────────────────────
export function Flourish({ className = '', width = 'w-24' }) {
  return (
    <div className={`flex items-center justify-center gap-2 text-gold-400 ${className}`}>
      <span className={`h-px ${width} bg-gradient-to-r from-transparent to-gold-400`} />
      <span className="text-sm leading-none">❖</span>
      <span className={`h-px ${width} bg-gradient-to-l from-transparent to-gold-400`} />
    </div>
  )
}

// ── Section heading for public pages ────────────────────────────────────────
export function SectionTitle({ title, subtitle, eyebrow, center = true }) {
  return (
    <div className={center ? 'text-center' : ''}>
      {eyebrow && <div className="font-script text-2xl text-gold-500 leading-none mb-1">{eyebrow}</div>}
      <h2 className="font-serif text-3xl md:text-4xl font-bold text-maroon-700">{title}</h2>
      <Flourish className={`mt-3 ${center ? '' : 'justify-start'}`} width="w-16" />
      {subtitle && <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto">{subtitle}</p>}
    </div>
  )
}

// ── Trust / feature strip (bottom of public pages) ──────────────────────────
export function FeatureStrip({ items }) {
  return (
    <section className="bg-gold-50 border-y border-gold-200">
      <div className="max-w-6xl mx-auto px-4 py-6 grid sm:grid-cols-2 lg:grid-cols-5 gap-5">
        {items.map((it) => {
          const Icon = it.icon
          return (
            <div key={it.title} className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full border border-gold-300 text-maroon-600 grid place-items-center shrink-0">
                <Icon size={18} />
              </div>
              <div>
                <div className="text-sm font-bold text-maroon-700">{it.title}</div>
                <div className="text-[11px] text-gray-500">{it.desc}</div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ── Maroon stats band ────────────────────────────────────────────────────────
export function StatBand({ stats }) {
  return (
    <section className="bg-temple text-cream">
      <div className="max-w-6xl mx-auto px-4 py-10 grid grid-cols-2 md:grid-cols-5 gap-8 text-center">
        {stats.map((s) => (
          <div key={s.label}>
            <div className="font-display text-3xl md:text-4xl font-extrabold text-gold-300">{s.value}</div>
            <div className="text-xs md:text-sm text-cream/80 mt-1">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── Page-hero banner for inner public pages ─────────────────────────────────
export function PageBanner({ title, breadcrumb, image }) {
  const site = useSite()
  const bannerImage = image || site?.images?.banner || ''
  return (
    <section className="relative bg-maroon-900 text-cream overflow-hidden">
      <img src={bannerImage} alt="" className="absolute inset-0 w-full h-full object-cover opacity-35" loading="lazy" />
      <div className="absolute inset-0 bg-gradient-to-r from-maroon-900 via-maroon-900/85 to-maroon-900/45" />
      <div className="relative max-w-6xl mx-auto px-4 py-14">
        <h1 className="font-serif text-3xl md:text-4xl font-bold">{title}</h1>
        <Flourish className="mt-3 justify-start" width="w-12" />
        {breadcrumb && <div className="text-xs text-cream/70 mt-3">{breadcrumb}</div>}
      </div>
    </section>
  )
}

// ── Page header for admin pages ─────────────────────────────────────────────
export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-maroon-700">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

// ── Badge ───────────────────────────────────────────────────────────────────
const TONES = {
  green: 'bg-emerald-50 text-emerald-700',
  red: 'bg-red-50 text-red-700',
  amber: 'bg-amber-50 text-amber-700',
  blue: 'bg-blue-50 text-blue-700',
  gray: 'bg-gray-100 text-gray-600',
  saffron: 'bg-saffron-50 text-saffron-700',
}
export function Badge({ children, tone = 'gray' }) {
  return <span className={`badge ${TONES[tone] || TONES.gray}`}>{children}</span>
}

// ── Stat card ───────────────────────────────────────────────────────────────
const STAT_TONES = {
  saffron: 'from-saffron-500 to-saffron-600',
  emerald: 'from-emerald-500 to-emerald-600',
  blue: 'from-blue-500 to-blue-600',
  violet: 'from-violet-500 to-violet-600',
}
export function StatCard({ label, value, delta, tone = 'saffron' }) {
  return (
    <div className="card p-5">
      <div className={`h-1.5 w-10 rounded-full bg-gradient-to-r ${STAT_TONES[tone]} mb-3`} />
      <div className="text-2xl font-extrabold text-gray-900">{value}</div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-xs text-gray-500">{label}</span>
        {delta && <span className="text-[11px] font-bold text-emerald-600">{delta}</span>}
      </div>
    </div>
  )
}

// ── Simple table ────────────────────────────────────────────────────────────
export function Table({ columns, children }) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
              {columns.map((c) => (
                <th key={c} className="px-4 py-3 font-bold whitespace-nowrap">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">{children}</tbody>
        </table>
      </div>
    </div>
  )
}

// ── Donut chart (pure SVG) ──────────────────────────────────────────────────
export function Donut({ segments, total, centerLabel = 'Total', size = 150 }) {
  const r = 54
  const c = 2 * Math.PI * r
  let offset = 0
  return (
    <svg viewBox="0 0 140 140" width={size} height={size} className="shrink-0">
      <circle cx="70" cy="70" r={r} fill="none" stroke="#f1ede2" strokeWidth="16" />
      {segments.map((s) => {
        const len = (s.pct / 100) * c
        const el = (
          <circle
            key={s.label}
            cx="70" cy="70" r={r} fill="none" stroke={s.color} strokeWidth="16"
            strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset}
            transform="rotate(-90 70 70)" strokeLinecap="butt"
          />
        )
        offset += len
        return el
      })}
      <text x="70" y="64" textAnchor="middle" className="fill-gray-400" style={{ fontSize: 10 }}>{centerLabel}</text>
      <text x="70" y="82" textAnchor="middle" className="fill-maroon-700 font-bold" style={{ fontSize: 22 }}>{total}</text>
    </svg>
  )
}

// ── Area / line chart (pure SVG) ────────────────────────────────────────────
export function AreaChart({ data, height = 150, color = '#059669' }) {
  const w = 320, h = height, pad = 6
  const max = Math.max(...data), min = Math.min(...data)
  const span = max - min || 1
  const stepX = (w - pad * 2) / (data.length - 1)
  const pts = data.map((v, i) => [pad + i * stepX, h - pad - ((v - min) / span) * (h - pad * 2)])
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${h} L${pts[0][0].toFixed(1)} ${h} Z`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none" style={{ height }}>
      <defs>
        <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#areaFill)" />
      <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// ── Demo banner ─────────────────────────────────────────────────────────────
export function DemoNote({ children }) {
  return (
    <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-3 py-2 flex items-center gap-2">
      <span>⚠️</span>
      <span>{children}</span>
    </div>
  )
}
