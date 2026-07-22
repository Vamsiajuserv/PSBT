import React from 'react'

// ── Count-up number that animates once when it scrolls into view ─────────────
export function CountUp({ value, duration = 1400 }) {
  const [n, setN] = React.useState(0)
  const ref = React.useRef(null)
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      obs.disconnect()
      const t0 = performance.now()
      const tick = (t) => {
        const p = Math.min(1, (t - t0) / duration)
        setN(Math.round(value * (1 - Math.pow(1 - p, 3))))   // ease-out cubic
        if (p < 1) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }, { threshold: 0.4 })
    obs.observe(el)
    return () => { obs.disconnect(); cancelAnimationFrame(raf) }
  }, [value, duration])
  return <span ref={ref}>{n.toLocaleString('en-IN')}</span>
}

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

/* ── Shared gold ornaments ────────────────────────────────────────────────────
   Decorative primitives used by the temple banner and the public pages. All are
   purely visual and marked aria-hidden.                                      */

export const GOLD = '#D4AF37'
export const GOLD_DEEP = '#C89B3C'

// Tapering gold hairline. `dir` is the side the gold sits on.
export function GoldRule({ width = 'w-20', dir = 'right', glow = false }) {
  return (
    <span className={`h-px ${width}`} aria-hidden="true"
          style={{ background: `linear-gradient(to ${dir}, transparent, ${GOLD})`,
                   boxShadow: glow ? `0 0 8px ${GOLD}b3` : undefined }} />
  )
}

// Concentric-ring mandala watermark. Corner watermarks use the bare form
// (`dots`/`innerRing` off); the large page motif uses the full one.
export function Mandala({ petals = 12, dots = true, innerRing = true, strokeWidth = 0.7, className = '', style }) {
  const angles = Array.from({ length: petals }, (_, i) => i * (360 / petals))
  return (
    <svg viewBox="0 0 100 100" className={className} style={style} fill="none" stroke="currentColor"
         strokeWidth={strokeWidth} aria-hidden="true">
      {[48, 39, 23, 13, 5].map((r) => <circle key={r} cx="50" cy="50" r={r} />)}
      {angles.map((a) => (
        <g key={a} transform={`rotate(${a} 50 50)`}>
          <ellipse cx="50" cy="31" rx="6.5" ry="15" />
          <path d="M50 16 L50 6" />
          {dots && <circle cx="50" cy="4" r="1.5" />}
        </g>
      ))}
      {innerRing && angles.map((a) => (
        <ellipse key={`i${a}`} cx="50" cy="43" rx="3.5" ry="7.5"
                 transform={`rotate(${a + 180 / petals} 50 50)`} />
      ))}
    </svg>
  )
}

// Field of drifting golden motes. `items` are {left, bottom, size, delay}.
export function Particles({ items, core = '#F6E3A8', glow = 'rgba(212,175,55,0.8)' }) {
  return items.map((p, i) => (
    <span key={i} className="particle absolute rounded-full pointer-events-none"
          style={{ left: p.left, bottom: p.bottom, width: p.size, height: p.size,
                   animationDelay: p.delay,
                   background: `radial-gradient(circle, ${core}, rgba(212,175,55,0))`,
                   boxShadow: `0 0 8px ${glow}` }} />
  ))
}

/* ── Minimal burgundy banner ──────────────────────────────────────────────────
   The restrained counterpart to TempleBanner: a deep radial burgundy field with
   a faint velvet grain, gold-gradient title and a coloured breadcrumb. No
   ornaments, lamps, particles or glows by design.                           */
export function MinimalBanner({ title, breadcrumb }) {
  // "Home › Gallery" → last crumb gold, the rest white.
  const crumbs = breadcrumb ? breadcrumb.split('›').map((s) => s.trim()).filter(Boolean) : []

  return (
    <section className="minimal-banner relative overflow-hidden flex items-center
                        py-2.5 min-h-[3.625rem] sm:min-h-[4rem] animate-fade-in">
      <div className="minimal-banner-texture absolute inset-0 pointer-events-none" />

      {/* Left-aligned to the same gutter the page content uses. */}
      <div className="relative w-full max-w-7xl mx-auto px-4">
        <h1 className="text-white font-serif font-normal leading-[1.15] tracking-[0.02em]"
            style={{ fontSize: 'clamp(15px, 1.9vw, 20px)' }}>
          {title}
        </h1>

        {crumbs.length > 0 && (
          <nav className="font-poppins" aria-label="Breadcrumb"
               style={{ marginTop: 3, fontSize: 'clamp(9px, 0.85vw, 11px)' }}>
            {crumbs.map((c, i) => (
              <span key={c}>
                {i > 0 && <span className="text-[#F5F5F5] mx-2">&gt;</span>}
                <span className={i === crumbs.length - 1 ? 'text-[#D4AF37]' : 'text-[#F5F5F5]'}>{c}</span>
              </span>
            ))}
          </nav>
        )}
      </div>
    </section>
  )
}

/* ── Premium temple banner ────────────────────────────────────────────────────
   Luxury South-Indian temple hero: deep maroon gradient, temple silhouette,
   antique-gold ornaments and hanging brass diyas. Purely a visual treatment —
   it renders only the `title` / `breadcrumb` text it is given.              */

// Shared gradients (defined once so multiple lamps can reference them).
function BannerDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true">
      <defs>
        <linearGradient id="brassGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F3DA95" />
          <stop offset="45%" stopColor="#D4AF37" />
          <stop offset="100%" stopColor="#7A5A12" />
        </linearGradient>
        <radialGradient id="flameGrad" cx="50%" cy="78%" r="70%">
          <stop offset="0%" stopColor="#FFF6D0" />
          <stop offset="38%" stopColor="#FFD700" />
          <stop offset="78%" stopColor="#FF9D2E" />
          <stop offset="100%" stopColor="rgba(255,120,20,0)" />
        </radialGradient>
      </defs>
    </svg>
  )
}

// A single hanging brass diya: chain → glow → flickering flame → brass bowl.
function Diya({ chain = 40, delay = '0s', className = '', style }) {
  return (
    <div className={`lamp absolute top-0 flex flex-col items-center ${className}`}
         style={{ ...style, animationDelay: delay }} aria-hidden="true">
      {/* chain */}
      <span className="w-px" style={{ height: chain, background: 'linear-gradient(to bottom, rgba(212,175,55,0.25), #C89B3C)' }} />
      <span className="relative block">
        {/* warm glow around the flame */}
        <span className="absolute left-1/2 -translate-x-1/2 -top-6 w-14 h-14 rounded-full pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(255,196,80,0.5), transparent 70%)', filter: 'blur(7px)' }} />
        {/* flame */}
        <svg width="11" height="16" viewBox="0 0 12 18"
             className="flame absolute left-1/2 -translate-x-1/2 -top-[0.8125rem]"
             style={{ animationDelay: delay }}>
          <path d="M6 0 C 9 5, 11 7, 11 11 A 5 5 0 0 1 1 11 C 1 7, 3 5, 6 0 Z" fill="url(#flameGrad)" />
        </svg>
        {/* brass bowl */}
        <svg width="30" height="17" viewBox="0 0 30 17" className="block">
          <path d="M1 2 H29 C29 10, 23 16, 15 16 S1 10, 1 2 Z" fill="url(#brassGrad)" />
          <ellipse cx="15" cy="2.4" rx="14" ry="2.4" fill="#E8C76A" />
          <path d="M2.5 3.5 C 4 9, 8 13, 15 13.6" stroke="rgba(255,240,200,0.5)" strokeWidth="0.8" fill="none" />
        </svg>
      </span>
    </div>
  )
}

// Subtle South-Indian gopuram silhouette used as a background motif.
function TempleSilhouette({ className = '' }) {
  return (
    <svg viewBox="0 0 800 200" className={className} fill="currentColor"
         preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <rect x="0" y="182" width="800" height="18" />
      {/* side shrines */}
      <path d="M70 182 v-44 h26 v-14 h56 v14 h26 v44 z" />
      <path d="M96 124 q28-30 56 0 z" />
      <path d="M622 182 v-44 h26 v-14 h56 v14 h26 v44 z" />
      <path d="M648 124 q28-30 56 0 z" />
      {/* central gopuram tiers */}
      <path d="M318 182 v-42 h164 v42 z" />
      <path d="M332 140 v-28 h136 v28 z" />
      <path d="M346 112 v-26 h108 v26 z" />
      <path d="M360 86  v-24 h80  v24 z" />
      {/* finial / kalasha */}
      <path d="M386 62 q14-22 14-30 q0 8 14 30 z" />
      <circle cx="400" cy="24" r="7" />
      <path d="M400 10 v-8" stroke="currentColor" strokeWidth="3" />
    </svg>
  )
}

// Symmetrical ornament + glowing line placed either side of the title.
function SideOrnament({ flip = false }) {
  return (
    <span className="hidden sm:flex items-center gap-2 shrink-0"
          style={{ transform: flip ? 'scaleX(-1)' : undefined }} aria-hidden="true">
      <GoldRule width="w-10 md:w-24" glow />
      <svg width="26" height="16" viewBox="0 0 26 16" fill="none" stroke={GOLD} strokeWidth="1.1">
        <path d="M25 8 C 18 8, 14 2, 8 3 C 2 4, 2 12, 8 13 C 12 13.7, 14 11, 13 8" />
        <circle cx="8" cy="8" r="2" fill="#D4AF37" stroke="none" />
      </svg>
    </span>
  )
}

// Gold ornamental divider with a lotus motif at its centre.
function LotusDivider() {
  return (
    <div className="divider-glow flex items-center justify-center gap-2.5 mt-1.5" aria-hidden="true">
      <GoldRule width="w-10 sm:w-20" />
      <svg width="26" height="14" viewBox="0 0 34 18" fill="none" stroke={GOLD} strokeWidth="1">
        <path d="M17 2 C 20 7, 20 12, 17 16 C 14 12, 14 7, 17 2Z" fill="rgba(212,175,55,.38)" />
        <path d="M17 16 C 13 15, 10 11, 9 6 C 13 7, 16 11, 17 16Z" fill="rgba(212,175,55,.26)" />
        <path d="M17 16 C 21 15, 24 11, 25 6 C 21 7, 18 11, 17 16Z" fill="rgba(212,175,55,.26)" />
        <path d="M17 16 C 12 17, 7 16, 4 13 C 9 12, 14 13, 17 16Z" fill="rgba(212,175,55,.18)" />
        <path d="M17 16 C 22 17, 27 16, 30 13 C 25 12, 20 13, 17 16Z" fill="rgba(212,175,55,.18)" />
      </svg>
      <GoldRule width="w-10 sm:w-20" dir="left" />
    </div>
  )
}

// Corner mandala watermarks — the bottom pair is hidden on small screens.
const CORNERS = [
  { at: '-left-8 -top-8', opacity: 0.09, extra: '' },
  { at: '-right-8 -top-8', opacity: 0.09, extra: '' },
  { at: '-left-8 -bottom-8', opacity: 0.07, extra: 'hidden sm:block' },
  { at: '-right-8 -bottom-8', opacity: 0.07, extra: 'hidden sm:block' },
]

// Drifting motes behind the banner title.
const BANNER_PARTICLES = [
  { left: '28%', bottom: '18%', size: 3, delay: '0s' },
  { left: '44%', bottom: '10%', size: 4, delay: '2.4s' },
  { left: '58%', bottom: '22%', size: 3, delay: '4.1s' },
  { left: '68%', bottom: '12%', size: 3, delay: '6.2s' },
]

// Left/right diya positions — innermost pair hides on small screens.
const LAMPS = [
  { pos: '3%', chain: 16, delay: '0s' },
  { pos: '10%', chain: 30, delay: '0.7s' },
  { pos: '17.5%', chain: 10, delay: '1.4s', hideOnMobile: true },
]

export function TempleBanner({ title, breadcrumb }) {
  return (
    <section className="temple-banner relative overflow-hidden min-h-[7rem] sm:min-h-[7.75rem] animate-fade-in">
      <BannerDefs />

      {/* Thin antique-gold border on the top edge */}
      <span className="absolute top-0 inset-x-0 h-px pointer-events-none"
            style={{ background: 'linear-gradient(to right, transparent, #D4AF37 18%, #FFD700 50%, #D4AF37 82%, transparent)' }} />

      {/* Background layers */}
      <div className="temple-banner-texture absolute inset-0 pointer-events-none" />
      <div className="temple-banner-rays absolute inset-0 pointer-events-none" />
      <TempleSilhouette className="absolute inset-x-0 bottom-0 w-full h-[82%] text-[#D4AF37] opacity-[0.07] pointer-events-none" />
      {/* Mandala watermarks in the corners */}
      {CORNERS.map((c) => (
        <Mandala key={c.at} petals={8} dots={false} innerRing={false}
                 className={`absolute ${c.at} w-28 h-28 pointer-events-none ${c.extra}`}
                 style={{ color: GOLD, opacity: c.opacity }} />
      ))}

      <div className="temple-banner-light absolute inset-0 pointer-events-none" />
      <div className="temple-banner-vignette absolute inset-0 pointer-events-none" />

      {/* Carved gold ornament along the bottom edge */}
      <div className="temple-banner-footer absolute bottom-0 inset-x-0 h-2.5 pointer-events-none" />

      {/* Floating golden particles */}
      <Particles items={BANNER_PARTICLES} core="#FFE9A8" glow="rgba(255,215,0,0.85)" />

      {/* Hanging brass diyas — three per side */}
      {LAMPS.map((l) => (
        <Diya key={`L${l.pos}`} chain={l.chain} delay={l.delay}
              className={`scale-[0.6] sm:scale-75 md:scale-[0.85] ${l.hideOnMobile ? 'hidden sm:flex' : ''}`}
              style={{ left: l.pos }} />
      ))}
      {LAMPS.map((l) => (
        <Diya key={`R${l.pos}`} chain={l.chain} delay={`${parseFloat(l.delay) + 0.35}s`}
              className={`scale-[0.6] sm:scale-75 md:scale-[0.85] ${l.hideOnMobile ? 'hidden sm:flex' : ''}`}
              style={{ right: l.pos }} />
      ))}

      {/* Content — text unchanged */}
      <div className="relative min-h-[7rem] sm:min-h-[7.75rem] flex flex-col items-center justify-center text-center px-4 py-5">
        {/* soft blurred glow behind the title */}
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[70%] h-16 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse, rgba(255,205,110,0.22), transparent 70%)', filter: 'blur(18px)' }} />

        <div className="relative flex items-center justify-center gap-4 animate-slide-up">
          <SideOrnament />
          <h1 className="font-display font-bold text-white leading-tight tracking-[0.02em]"
              style={{ fontSize: 'clamp(20px, 3.4vw, 34px)', textShadow: '0 0 16px rgba(212,175,55,0.55), 0 2px 6px rgba(0,0,0,0.6)' }}>
            {title}
          </h1>
          <SideOrnament flip />
        </div>

        <LotusDivider />

        {breadcrumb && (
          <div className="relative mt-1.5 text-[0.6875rem] sm:text-xs animate-slide-up"
               style={{ color: 'rgba(255,255,255,0.88)', animationDelay: '120ms' }}>
            {breadcrumb}
          </div>
        )}
      </div>
    </section>
  )
}

// ── Section heading for public pages ────────────────────────────────────────
export function SectionTitle({ title, subtitle, eyebrow, center = true }) {
  return (
    <div className={center ? 'text-center' : ''}>
      {eyebrow && <div className="font-script text-2xl text-gold-500 leading-none mb-1">{eyebrow}</div>}
      <h2 className="font-serif text-3xl md:text-4xl font-bold text-maroon-700">{title}</h2>
      <Flourish className={`mt-3 ${center ? '' : 'justify-start'}`} width="w-16" />
      {subtitle && <p className="text-black text-sm mt-3 max-w-xl mx-auto">{subtitle}</p>}
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
                <div className="text-[0.6875rem] text-gray-500">{it.desc}</div>
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
        {delta && <span className="text-[0.6875rem] font-bold text-emerald-600">{delta}</span>}
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
            <tr className="bg-gray-50 text-left text-[0.6875rem] uppercase tracking-wide text-gray-500">
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
