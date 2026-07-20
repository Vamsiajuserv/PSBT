import React, { useState, useMemo } from 'react'
import {
  Search, LayoutGrid, Flame, CalendarDays, Repeat, Sparkles, Star, HandHeart, Car,
  PhoneCall, Phone, Info, ChevronDown, ArrowRight, ArrowLeft, Users, Clock, Flame as FlameIcon,
  UserCheck, Heart, CalendarCheck,
} from 'lucide-react'
import { Flourish, TempleBanner } from '../../components/common/UI.jsx'
import { useSite } from '../../lib/SiteContext.jsx'

const CATS = [
  { key: 'all', label: 'All Services', icon: LayoutGrid },
  { key: 'Daily', label: 'Daily Poojas', icon: Flame },
  { key: 'Monthly', label: 'Monthly Poojas', icon: CalendarDays },
  { key: 'Long-term', label: 'Long-Term Pooja', icon: Repeat },
  { key: 'Ceremony', label: 'Occasion / Special Pooja', icon: Sparkles },
  { key: 'Festival', label: 'Festivals & Special', icon: Star },
  { key: 'Donation', label: 'Donations', icon: HandHeart },
  { key: 'Vahana', label: 'Vehicle Poojas', icon: Car },
]

// Human-readable duration hint per category (shown in the detail view).
const DURATION = {
  Daily: '1 Day', Monthly: 'Monthly', 'Long-term': 'Ongoing / Yearly',
  Ceremony: 'Single Occasion', Festival: 'Festival Day', Donation: 'One-time', Vahana: '1 Day',
}

// Normalise a backend SevaOut row into the shape the cards expect.
const normalize = (s) => ({
  id: s.id ?? s.code, code: s.code, name: s.name, nameTe: s.name_te || s.nameTe || '',
  amount: s.amount == null ? null : Number(s.amount) || 0,
  committee: !!s.committee, from: !!s.from, plans: s.plans || '',
  category: s.category || 'Daily', desc: s.description || s.desc || '',
})

// Indian-style thousands grouping, e.g. 5001 → "5,001".
const fmt = (n) => Number(n ?? 0).toLocaleString('en-IN')

const priceLabel = (s) =>
  s.committee ? 'Committee decided' : `${s.from ? 'from ' : ''}₹${fmt(s.amount)}`

export default function Sevas() {
  const site = useSite()
  const [openCat, setOpenCat] = useState('Daily')   // which accordion is expanded (one at a time)
  const [cat, setCat] = useState('Daily')           // category driving the right content
  const [detail, setDetail] = useState(null)        // selected seva → detail view (null = list view)
  const [query, setQuery] = useState('')

  // Live catalogue + display assets served by the site context (GET /api/public/site).
  const sevas = useMemo(() => (site?.sevas || []).map(normalize), [site])
  const catImage = site?.cat_image || {}
  const sevaEmoji = site?.seva_emoji || {}

  // Sort by fee low → high; committee-decided (no fixed fee) sinks to the bottom.
  const byFee = (a, b) => (a.amount ?? Infinity) - (b.amount ?? Infinity)
  const byCat = (key) => {
    const list = (key === 'all' ? sevas : sevas.filter((s) => s.category === key)).slice()
    // Occasion/Special poojas stay grouped by pooja (natural order); every other
    // category is sorted by fee low → high.
    return key === 'Ceremony' ? list : list.sort(byFee)
  }
  const catCount = (key) => byCat(key).length

  const filtered = byCat(cat).filter(
    (s) =>
      s.name.toLowerCase().includes(query.toLowerCase()) || (s.nameTe || '').includes(query)
  )

  const selectCat = (key) => {
    setCat(key)
    setDetail(null)
    setOpenCat((prev) => (prev === key ? (key === 'all' ? prev : null) : key))
  }

  const activeLabel = CATS.find((c) => c.key === cat)?.label || 'Services'

  return (
    <div className="bg-cream">
      <TempleBanner title="Poojas & Services" breadcrumb="Home  ›  Poojas & Services" />

      <div className="max-w-7xl mx-auto px-4 py-10">
        {/* Honest note — booking is done at the temple counter */}
        <div className="mb-6 flex items-start gap-3 bg-gold-50 border border-gold-200 rounded-xl px-4 py-3 text-sm text-maroon-800">
          <Info size={18} className="text-gold-500 shrink-0 mt-0.5" />
          <p>
            The prices below are for information only. To book a seva or make an offering, please visit the
            temple counter or call us at <strong>040-2335 5286</strong> (9:00 AM – 8:00 PM).
          </p>
        </div>

        {/* Search */}
        <div className="mb-6 relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pooja / seva…"
            className="input !pl-9"
          />
        </div>

        <div className="grid lg:grid-cols-[290px_1fr] gap-6 items-start">
          {/* ── Categories sidebar (sticky, accordion) ── */}
          <aside className="lg:sticky lg:top-4 space-y-4">
            <div className="card p-4">
              <div className="font-display text-xs uppercase tracking-widest text-maroon-700 mb-1">Categories</div>
              <Flourish className="justify-start mb-3" width="w-8" />

              {/* All Services */}
              <button
                onClick={() => selectCat('all')}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-colors mb-1.5 ${cat === 'all' ? 'bg-gold-cta text-maroon-900' : 'text-gray-700 hover:bg-gold-50'}`}
              >
                <span className="flex items-center gap-2.5"><LayoutGrid size={16} /> All Services</span>
                <span className={`text-[11px] ${cat === 'all' ? 'text-maroon-800' : 'text-gray-400'}`}>({catCount('all')})</span>
              </button>

              {/* Accordion categories */}
              <div className="space-y-1.5">
                {CATS.filter((c) => c.key !== 'all').map((c) => {
                  const Icon = c.icon
                  const isOpen = openCat === c.key
                  const isActive = cat === c.key
                  const rows = byCat(c.key)
                  const showFreq = !['Daily', 'Monthly', 'Vahana'].includes(c.key)   // these: only Pooja + Fee
                  return (
                    <div key={c.key} className={`rounded-xl border transition-colors ${isOpen ? 'border-gold-300 bg-ivory' : 'border-transparent'}`}>
                      <button
                        onClick={() => selectCat(c.key)}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-colors ${isActive ? 'text-maroon-800' : 'text-gray-700 hover:bg-gold-50'}`}
                      >
                        <span className="flex items-center gap-2.5"><Icon size={16} className={isActive ? 'text-maroon-700' : 'text-gold-500'} /> {c.label}</span>
                        <span className="flex items-center gap-1.5 text-[11px] text-gray-400">
                          ({rows.length})
                          <ChevronDown size={15} className={`transition-transform ${isOpen ? 'rotate-180 text-maroon-600' : ''}`} />
                        </span>
                      </button>

                      {/* AccordionDetails — fee table */}
                      <div className={`grid transition-all duration-300 ease-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                        <div className="overflow-hidden">
                          <div className="px-3 pb-3">
                            {rows.length === 0 ? (
                              <div className="text-[11px] text-gray-400 py-2">No poojas listed.</div>
                            ) : (
                              <table className="w-full text-[12px]">
                                <thead>
                                  <tr className="text-gold-600 border-b border-gold-200">
                                    <th className="text-left font-bold py-1.5">Pooja</th>
                                    {showFreq && <th className="text-left font-bold py-1.5 px-2">Plan</th>}
                                    <th className="text-right font-bold py-1.5">Fee</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {rows.map((s) => (
                                    <tr
                                      key={s.id}
                                      onClick={() => setDetail(s)}
                                      className="cursor-pointer border-b border-gold-100 last:border-0 hover:bg-gold-50"
                                    >
                                      <td className="py-1.5 pr-2 text-gray-700">{s.name}</td>
                                      {showFreq && <td className="py-1.5 px-2 text-gray-500 whitespace-nowrap">{s.plans || '—'}</td>}
                                      <td className="py-1.5 text-right font-semibold text-maroon-700">
                                        {s.committee ? <span className="text-[10px] text-gray-500 font-medium">Committee Decided</span> : <span className="whitespace-nowrap">₹{fmt(s.amount)}</span>}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="card p-4 bg-gradient-to-br from-ivory to-gold-50">
              <div className="flex items-center gap-2 text-maroon-700 font-bold text-sm"><PhoneCall size={16} className="text-gold-500" /> Need Help?</div>
              <div className="mt-3 space-y-2">
                <a href="tel:+9104023353589" className="flex items-center gap-2 text-sm text-gray-700 hover:text-maroon-700">
                  <span className="w-7 h-7 rounded-full border border-gold-300 bg-gold-50 text-maroon-600 grid place-items-center shrink-0"><Phone size={13} /></span>
                  +91 040 2335 3589
                </a>
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="w-7 h-7 rounded-full border border-gold-300 bg-gold-50 text-maroon-600 grid place-items-center shrink-0"><Clock size={13} /></span>
                  9:00 AM – 8:00 PM
                </div>
              </div>
            </div>
          </aside>

          {/* ── Right content ── */}
          <div>
            {detail ? (
              <ServiceDetail
                seva={detail}
                image={catImage[detail.category] || catImage.Daily}
                emoji={sevaEmoji[detail.code]}
                onBack={() => setDetail(null)}
              />
            ) : (
              <div className="animate-fade-in">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-serif text-2xl font-bold text-maroon-700">{activeLabel}</h2>
                  <span className="text-xs text-gray-400">{filtered.length} services</span>
                </div>

                {filtered.length === 0 ? (
                  <div className="card p-10 text-center text-gray-400 text-sm">No services match your search.</div>
                ) : (
                  <div className="space-y-4">
                    {filtered.map((s, i) => (
                      <ServiceCard
                        key={s.id}
                        seva={s}
                        image={catImage[s.category] || catImage.Daily}
                        emoji={sevaEmoji[s.code]}
                        onView={() => setDetail(s)}
                        style={{ animationDelay: `${Math.min(i * 60, 360)}ms` }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Horizontal service card (image left, info + CTA right) ── */
function ServiceCard({ seva, image, emoji, onView, style }) {
  return (
    <div className="card overflow-hidden flex flex-col sm:flex-row group animate-slide-up" style={style}>
      <div className="sm:w-56 shrink-0 relative overflow-hidden">
        <img src={image} alt={seva.name} className="w-full h-40 sm:h-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
        <div className="absolute inset-0 bg-gradient-to-t from-maroon-900/40 to-transparent" />
        <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wide bg-white/90 text-maroon-700 rounded-full px-2 py-0.5">{seva.category}</span>
        {emoji && <span className="absolute bottom-2 right-2 text-2xl drop-shadow-lg">{emoji}</span>}
      </div>

      <div className="flex-1 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h3 className="font-bold text-lg text-maroon-700">{seva.name}</h3>
          {seva.nameTe && <p className="text-[11px] text-gray-400 font-telugu">{seva.nameTe}</p>}
          <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">{seva.desc}</p>
          {seva.plans && <p className="text-[11px] text-gray-400 mt-1">Plans: {seva.plans}</p>}
        </div>

        <div className="sm:text-right shrink-0">
          <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">Starting From</div>
          <div className="text-2xl font-extrabold text-maroon-700 leading-tight">
            {seva.committee ? <span className="text-base">Committee decided</span> : <>₹{fmt(seva.amount)}</>}
          </div>
          <button
            onClick={onView}
            className="btn-maroon !rounded-xl mt-3 hover:!bg-gold-cta hover:!text-maroon-900"
          >
            View Details <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── In-place detail view (no route / modal — replaces the list) ── */
function ServiceDetail({ seva, image, emoji, onBack }) {
  const info = [
    { icon: Users, label: 'Category', value: `${seva.category} Pooja` },
    { icon: Clock, label: 'Duration', value: DURATION[seva.category] || '1 Day' },
    { icon: FlameIcon, label: 'Type', value: `${seva.category} Pooja` },
    { icon: UserCheck, label: 'Performed By', value: 'Temple Priests' },
    { icon: Heart, label: 'Best For', value: 'All Devotees' },
    { icon: CalendarCheck, label: 'Booking', value: 'Advance booking recommended' },
  ]

  return (
    <div className="animate-fade-in">
      <button onClick={onBack} className="btn-ghost !px-2 mb-3 text-maroon-700">
        <ArrowLeft size={16} /> Back to list
      </button>

      <div className="card overflow-hidden animate-slide-up">
        <div className="grid md:grid-cols-[40%_60%]">
          {/* Left — image */}
          <div className="relative min-h-[220px]">
            <img src={image} alt={seva.name} className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-maroon-900/50 to-transparent" />
            {emoji && <span className="absolute bottom-3 left-3 text-3xl drop-shadow-lg">{emoji}</span>}
            <span className="absolute top-3 left-3 text-[10px] font-bold uppercase tracking-wide bg-white/90 text-maroon-700 rounded-full px-2.5 py-1">{seva.category}</span>
          </div>

          {/* Right — details */}
          <div className="p-6">
            <div className="font-script text-2xl text-gold-500 leading-none">About</div>
            <h2 className="font-serif text-2xl font-bold text-maroon-700">{seva.name}</h2>
            {seva.nameTe && <p className="text-sm text-gray-400 font-telugu">{seva.nameTe}</p>}
            <Flourish className="justify-start my-2.5" width="w-10" />
            <p className="text-sm text-gray-600 leading-relaxed">
              {seva.desc || `${seva.name} is a sacred offering performed at the temple as an expression of devotion, bringing peace, prosperity and blessings to devotees.`}
            </p>

            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">Offering</span>
              <span className="text-2xl font-extrabold text-maroon-700">{priceLabel(seva)}</span>
              {!seva.committee && <span className="text-xs font-semibold text-gray-400">/-</span>}
            </div>

            {/* Responsive info grid (2 columns) */}
            <div className="grid sm:grid-cols-2 gap-3 mt-5">
              {info.map((it) => {
                const Icon = it.icon
                return (
                  <div key={it.label} className="rounded-xl border border-gold-200 bg-ivory px-3.5 py-3 flex items-start gap-3">
                    <span className="w-9 h-9 rounded-full border border-gold-300 bg-gold-50 text-maroon-600 grid place-items-center shrink-0"><Icon size={16} /></span>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wide text-gold-600">{it.label}</div>
                      <div className="text-sm text-gray-700 font-medium">{it.value}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
