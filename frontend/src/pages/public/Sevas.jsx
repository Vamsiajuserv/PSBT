import React, { useState, useMemo } from 'react'
import {
  Search, LayoutGrid, Flame, CalendarDays, Repeat, Sparkles, Star, Car,
  PhoneCall, Phone, ChevronDown, ArrowRight, ArrowLeft, Users, Clock, Flame as FlameIcon,
  UserCheck, Heart, CalendarCheck,
} from 'lucide-react'
import { Flourish, MinimalBanner } from '../../components/common/UI.jsx'
import { useSite } from '../../lib/SiteContext.jsx'
import { T, tr, useLang } from '../../i18n/LanguageContext.jsx'

const CATS = [
  { key: 'all', label: 'All Services', icon: LayoutGrid },
  { key: 'Daily', label: 'Daily Poojas', icon: Flame },
  { key: 'Monthly', label: 'Monthly Poojas', icon: CalendarDays },
  { key: 'Long-term', label: 'Long-Term Pooja', icon: Repeat },
  { key: 'Festival', label: 'Festivals Poojas', icon: Star },
  { key: 'Ceremony', label: 'Special Poojas', icon: Sparkles },
  { key: 'Vahana', label: 'Vehicle Poojas', icon: Car },
]

// Per-seva image overrides (by pooja name). Takes precedence over the
// category image so a specific pooja can carry its own picture.
const SEVA_IMAGE = {
  Abhishekam: '/images/sai/goldfull.jpg',
  'Ashtotharam / Archana': '/babaimages/AshtotharamArchana.jpg',
  'Sahasranama Archana': '/babaimages/SahasranamaArchana.jpg',
  'Sai Vratam (Pournami)': '/babaimages/SaiVratam(Pournami).jpg',
  'Sai Pooja with Gothranamam': '/babaimages/SaiPoojaGothranamam.jpg',
  'Vishesha Pooja': '/babaimages/VisheshaPooja.webp',
  'Nithya Pooja': '/babaimages/NithyaPooja.jpg',
  'Vinayaka Chavithi Pooja': '/babaimages/VinayakaChavithiPooja.jpeg',
  'Karthika Masam Pooja': '/babaimages/KarthikaMasamPooja.jpg',
  'Sri Rama Navami': '/babaimages/SriRamaNavami.jpeg',
  'Namakaranam': '/babaimages/Namakaranam.jpeg',
  'Rudrabhishekam': '/babaimages/Rudrabhishekam.jpg',
  'Aksharabhyasam': '/babaimages/Aksharabhyasam.jpeg',
  'Annaprasana': '/babaimages/Annaprasana.jpeg',
  'Vastra Seva': '/babaimages/VastraSeva.jpeg',
  'Bike / Scooter Pooja': '/babaimages/BikeScooterPooja.jpeg',
  'Auto Pooja': '/babaimages/AutoPooja.jpeg',
  'Car Pooja': '/babaimages/CarPooja.jpeg',
}

// Per-seva "About" text (by pooja name). Shown in the detail view, taking
// precedence over the backend description and the generic fallback.
const SEVA_ABOUT = {
  'Sai Pooja with Gothranamam':
    "Sai Pooja with Gothranamam is a sacred ritual in which prayers are offered to Sri Shirdi Sai Baba by chanting the devotee's name and Gothram (family lineage). This special pooja is performed to seek Baba's divine blessings for good health, prosperity, family harmony, success, and overall well-being. Devotees participate with deep faith, praying for the welfare of their family, inner peace, fulfillment of their wishes, and a life filled with happiness and divine grace.",
  'Vishesha Pooja':
    "Vishesha Pooja is a special worship performed with devotion to Sri Shirdi Sai Baba on auspicious occasions, festivals, birthdays, anniversaries, or to fulfill a specific prayer. This sacred pooja is offered to seek Baba's blessings for good health, prosperity, success, family harmony, and protection from obstacles. Devotees participate with faith, praying for peace, happiness, and the fulfillment of their heartfelt wishes.",
  'Nithya Pooja':
    "Nithya Pooja is a daily worship offered to Sri Shirdi Sai Baba with devotion, prayers, and sacred offerings. It is performed to seek Baba's divine blessings for good health, peace, prosperity, family well-being, and spiritual growth. Devotees participate with faith, praying for happiness, protection, and success in every aspect of life.",
  'Sai Vratam (Pournami)':
    "Sai Vratam (Pournami) is a sacred monthly pooja performed at Sri Shirdi Sai Baba Temple on the auspicious day of Pournami (Full Moon). Devotees observe the vratam with devotion by participating in special poojas, Sai Baba Ashtotharam, bhajans, and aarti to seek Baba's divine blessings for good health, prosperity, family harmony, peace, and spiritual growth. It is believed that performing this vratam with sincere faith helps fulfill wishes and brings happiness, success, and divine grace into one's life.",
  'Devi Navaratri Pooja':
    "Devi Navaratri Pooja is a sacred worship performed during the auspicious Navaratri festival to honor Goddess Durga, the divine embodiment of strength, wisdom, and compassion. This special pooja is conducted to seek the Goddess's blessings for health, prosperity, protection, success, and spiritual growth. Devotees participate with devotion, praying for the well-being of their families, the removal of obstacles, and the fulfillment of their sincere wishes.",
  'Vinayaka Chavithi Pooja':
    "Vinayaka Chavithi Pooja is a sacred worship performed on the auspicious occasion of Vinayaka Chavithi to honor Lord Ganesha, the remover of obstacles and the giver of wisdom and prosperity. This special pooja is performed to seek Lord Ganesha's blessings for success, good health, family happiness, prosperity, and the smooth completion of all endeavors. Devotees participate with devotion, praying for peace, wisdom, and the fulfillment of their heartfelt wishes.",
  'Karthika Masam Pooja':
    "Karthika Masam Pooja is a special worship performed during the sacred month of Karthika at Sri Shirdi Sai Baba Temple with devotion and faith. During this holy month, devotees offer deepa seva (lighting lamps), special prayers, bhajans, and poojas to seek Sri Sai Baba's divine blessings for good health, prosperity, family harmony, peace, and spiritual growth. Devotees participate wholeheartedly, praying for the fulfillment of their wishes, removal of obstacles, and a life filled with happiness and Baba's grace.",
  'Sri Rama Navami':
    "Sri Rama Navami is a sacred festival celebrated with great devotion at Sri Shirdi Sai Baba Temple, commemorating the birth of Lord Sri Rama. Special poojas, bhajans, devotional prayers, and spiritual programs are conducted to seek divine blessings for righteousness, peace, prosperity, family well-being, and spiritual growth. Devotees participate with faith, praying for happiness, success, and the fulfillment of their wishes under the grace of Sri Rama and Sri Shirdi Sai Baba.",
  'Rudrabhishekam':
    "Rudrabhishekam is a special sacred ritual performed at Sri Shirdi Sai Baba Temple by offering Abhishekam to the Shiva Lingam with holy substances such as milk, water, honey, curd, and sandalwood while chanting powerful Vedic mantras. As Sri Sai Baba always emphasized devotion to Lord Shiva and the unity of all faiths, this pooja is conducted to seek divine blessings for good health, prosperity, family harmony, peace, protection, and spiritual well-being. Devotees participate with faith, praying for the removal of obstacles, fulfillment of their wishes, and Baba's divine grace.",
  'Namakaranam':
    "Namakaranam is a sacred naming ceremony performed at Sri Shirdi Sai Baba Temple to bless a newborn child with a meaningful name in the divine presence of Sri Sai Baba. Special prayers and poojas are offered to seek Baba's blessings for the child's good health, long life, wisdom, prosperity, and a bright future. Parents and family members participate with devotion, praying for the child's happiness, success, and lifelong divine protection.",
  'Aksharabhyasam':
    "Aksharabhyasam is a sacred ceremony performed at Sri Shirdi Sai Baba Temple to mark a child's first step into the world of education. In the divine presence of Sri Sai Baba, the child is guided to write the first letters while special prayers and poojas are offered for wisdom, knowledge, good character, and academic success. Parents and family members participate with devotion, seeking Baba's blessings for the child's bright future, confidence, and lifelong learning.",
  'Annaprasana':
    "Annaprasana is a sacred ceremony performed at Sri Shirdi Sai Baba Temple to celebrate a baby's first intake of solid food. In the divine presence of Sri Sai Baba, special poojas and prayers are offered to seek blessings for the child's good health, long life, happiness, wisdom, and prosperous future. Parents and family members participate with devotion, praying for the child's healthy growth, well-being, and lifelong protection under Baba's divine grace.",
  'Vastra Seva':
    "Vastra Seva is a sacred offering performed at Sri Shirdi Sai Baba Temple, where devotees offer new clothes to Sri Sai Baba as a symbol of devotion, gratitude, and surrender. This seva is performed to seek Baba's divine blessings for good health, prosperity, family harmony, success, and spiritual well-being. Devotees participate with faith, praying for the fulfillment of their wishes and expressing their love and reverence through this humble offering.",
  'Bike / Scooter Pooja':
    "Bike / Scooter Pooja is a sacred vehicle blessing ceremony performed at Sri Shirdi Sai Baba Temple for newly purchased or existing two-wheelers. Special prayers and poojas are offered to seek Sri Sai Baba's divine blessings for safe journeys, protection from accidents, success, prosperity, and peace of mind. Devotees perform this pooja with faith, praying for the safety of themselves and their families, and for Baba's guidance in every journey.",
  'Auto Pooja':
    "Auto Pooja is a sacred vehicle blessing ceremony performed at Sri Shirdi Sai Baba Temple for newly purchased or regularly used auto-rickshaws. Special prayers and poojas are offered to seek Sri Sai Baba's divine blessings for safe journeys, protection from accidents, prosperity, success in livelihood, and peace of mind. Devotees perform this pooja with faith, praying for a successful career, steady income, the well-being of their families, and Baba's guidance on every journey.",
  'Car Pooja':
    "Car Pooja is a sacred vehicle blessing ceremony performed at Sri Shirdi Sai Baba Temple for newly purchased or existing cars. Special prayers and poojas are offered to seek Sri Sai Baba's divine blessings for safe journeys, protection from accidents, prosperity, success, and peace of mind. Devotees perform this pooja with faith, praying for the safety of their family, smooth travels, and Baba's divine guidance and protection on every journey.",
}

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
  const { lang } = useLang()
  const site = useSite()
  const [openCat, setOpenCat] = useState(null)      // which accordion is expanded (one at a time)
  const [cat, setCat] = useState('all')             // category driving the right content — full catalogue first
  const [detail, setDetail] = useState(null)        // selected seva → detail view (null = list view)
  const [query, setQuery] = useState('')

  // Live catalogue + display assets served by the site context (GET /api/public/site).
  const sevas = useMemo(() => (site?.sevas || []).map(normalize), [site])
  const catImage = site?.cat_image || {}
  const sevaEmoji = site?.seva_emoji || {}

  // Sort by fee low → high; committee-decided (no fixed fee) sinks to the bottom.
  const byFee = (a, b) => (a.amount ?? Infinity) - (b.amount ?? Infinity)

  // The API serves one row per plan. Collapse them back to one entry per pooja so
  // a multi-plan pooja (e.g. Vinayaka Chavithi: 1/3/5/9/11-Day) is listed once;
  // its individual plans are kept in `planRows` for the detail view. Categories
  // where each pooja has a single plan are unaffected.
  const groupByPooja = (list) => {
    const map = new Map()
    for (const s of list) {
      const key = s.code || s.name
      if (!map.has(key)) map.set(key, { ...s, id: key, planRows: [] })
      map.get(key).planRows.push({ plan: s.plans, amount: s.amount, committee: s.committee })
    }
    for (const g of map.values()) {
      const fees = g.planRows.filter((p) => !p.committee && p.amount != null).map((p) => p.amount)
      g.amount = fees.length ? Math.min(...fees) : null
      g.committee = fees.length === 0
      g.from = fees.length > 1
      g.plans = g.planRows.length === 1 ? g.planRows[0].plan : `${g.planRows.length} plans`
    }
    return [...map.values()]
  }

  const byCat = (key) => {
    const list = groupByPooja(key === 'all' ? sevas : sevas.filter((s) => s.category === key))
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
      <MinimalBanner title={tr("Poojas & Services")} breadcrumb="Home  ›  Poojas & Services" />

      <div className="max-w-7xl mx-auto px-4 pt-8 pb-10">
        <div className="grid lg:grid-cols-[290px_1fr] gap-6 items-start">
          {/* ── Categories sidebar (sticky, accordion) ── */}
          <aside className="lg:sticky lg:top-24 space-y-4">
            {/* Search — lives with the filters so both columns start level */}
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tr("Search pooja / seva…")}
                className="input !pl-9 text-black"
              />
            </div>

            <div className="card p-4">
              <div className="font-display text-base uppercase tracking-widest text-maroon-900 mb-1"><T>Categories</T></div>
              <Flourish className="justify-start mb-3" width="w-8" />

              {/* All Services */}
              <button
                onClick={() => selectCat('all')}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-[0.8125rem] font-semibold transition-colors mb-1.5 ${cat === 'all' ? 'bg-gold-cta text-maroon-900' : 'text-black hover:bg-gold-50'}`}
              >
                <span className="flex items-center gap-2.5"><LayoutGrid size={16} />{' '}<T>All Services</T></span>
                <span className={`text-[0.6875rem] ${cat === 'all' ? 'text-maroon-800' : 'text-black'}`}>({catCount('all')})</span>
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
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-[0.8125rem] font-semibold transition-colors ${isActive ? 'text-maroon-800' : 'text-black hover:bg-gold-50'}`}
                      >
                        <span className="flex items-center gap-2.5"><Icon size={16} className={isActive ? 'text-maroon-700' : 'text-gold-500'} /> {c.label}</span>
                        <span className="flex items-center gap-1.5 text-[0.6875rem] text-black">
                          ({rows.length})
                          <ChevronDown size={15} className={`transition-transform ${isOpen ? 'rotate-180 text-maroon-600' : ''}`} />
                        </span>
                      </button>

                      {/* AccordionDetails — fee table */}
                      <div className={`grid transition-all duration-300 ease-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                        <div className="overflow-hidden">
                          <div className="px-3 pb-3">
                            {rows.length === 0 ? (
                              <div className="text-[0.6875rem] text-black py-2"><T>No poojas listed.</T></div>
                            ) : (
                              <table className="w-full text-[0.75rem]">
                                <thead>
                                  <tr className="text-gold-600 border-b border-gold-200">
                                    <th className="text-left font-bold py-1.5"><T>Pooja</T></th>
                                    {showFreq && <th className="text-left font-bold py-1.5 px-2"><T>Plan</T></th>}
                                    <th className="text-right font-bold py-1.5"><T>Fee</T></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {rows.map((s) => {
                                    const picked = detail?.id === s.id   // row whose detail is open
                                    return (
                                      <tr
                                        key={s.id}
                                        onClick={() => setDetail(s)}
                                        className={`cursor-pointer border-b border-gold-100 last:border-0 transition-colors ${
                                          picked ? 'bg-gold-100' : 'hover:bg-gold-50'
                                        }`}
                                      >
                                        <td className={`py-1.5 pr-2 ${picked ? 'font-bold text-maroon-700' : 'text-black'}`}>{s.name}</td>
                                        {showFreq && <td className="py-1.5 px-2 text-black whitespace-nowrap">{s.plans || '—'}</td>}
                                        <td className="py-1.5 text-right font-semibold text-maroon-700">
                                          {s.committee ? <span className="text-[0.625rem] text-black font-medium"><T>Committee Decided</T></span> : <span className="whitespace-nowrap">₹{fmt(s.amount)}</span>}
                                        </td>
                                      </tr>
                                    )
                                  })}
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
              <div className="flex items-center gap-2 text-maroon-700 font-bold text-sm"><PhoneCall size={16} className="text-gold-500" />{' '}<T>Need Help?</T></div>
              <div className="mt-3 space-y-2">
                <a href="tel:+9104023353589" className="flex items-center gap-2 text-sm text-black hover:text-maroon-700">
                  <span className="w-7 h-7 rounded-full border border-gold-300 bg-gold-50 text-maroon-600 grid place-items-center shrink-0"><Phone size={13} /></span>
                  +91 040 2335 3589
                </a>
                <div className="flex items-center gap-2 text-sm text-black">
                  <span className="w-7 h-7 rounded-full border border-gold-300 bg-gold-50 text-maroon-600 grid place-items-center shrink-0"><Clock size={13} /></span><T>9:00 AM – 8:00 PM</T>{' '}</div>
              </div>
            </div>
          </aside>

          {/* ── Right content ── */}
          <div>
            {detail ? (
              <ServiceDetail
                key={detail.id}
                seva={detail}
                image={SEVA_IMAGE[detail.name] || catImage[detail.category] || catImage.Daily}
                emoji={sevaEmoji[detail.code]}
                onBack={() => setDetail(null)}
              />
            ) : (
              <div className="animate-fade-in">
                <div className="flex items-baseline justify-between gap-3 mb-4">
                  <h2 className="font-serif text-2xl font-bold text-maroon-700">{activeLabel}</h2>
                  <span className="shrink-0 text-[0.6875rem] font-semibold text-maroon-700 bg-gold-50 border border-gold-200 rounded-full px-2.5 py-1">
                    {filtered.length} {filtered.length === 1 ? 'service' : 'services'}
                  </span>
                </div>

                {filtered.length === 0 ? (
                  <div className="card p-10 text-center text-black text-sm"><T>No services match your search.</T></div>
                ) : (
                  <div className="space-y-4">
                    {filtered.map((s, i) => (
                      <ServiceCard
                        key={s.id}
                        seva={s}
                        image={SEVA_IMAGE[s.name] || catImage[s.category] || catImage.Daily}
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
  const { lang } = useLang()
  return (
    <div className="card overflow-hidden flex flex-col sm:flex-row group animate-slide-up" style={style}>
      <div className="sm:w-36 sm:h-36 shrink-0 relative overflow-hidden">
        <img src={image} alt={seva.name} className="w-full h-28 sm:h-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
        <div className="absolute inset-0 bg-gradient-to-t from-maroon-900/40 to-transparent" />
        <span className="absolute top-1.5 left-1.5 text-[0.5625rem] font-bold uppercase tracking-wide bg-white/90 text-maroon-700 rounded-full px-1.5 py-0.5">{seva.category}</span>
        {emoji && <span className="absolute bottom-1.5 right-1.5 text-lg drop-shadow-lg">{emoji}</span>}
      </div>

      <div className="flex-1 p-3.5 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-sm text-maroon-700">{seva.name}</h3>
          {lang === 'te' && seva.nameTe && <p className="text-[0.625rem] text-black font-telugu">{seva.nameTe}</p>}
          {/* Two-line teaser (full text in the detail view) so wide rows don't sit hollow */}
          {(SEVA_ABOUT[seva.name] || seva.desc) && (
            <p className="hidden sm:block text-[0.6875rem] text-gray-600 leading-relaxed mt-1.5 line-clamp-2 max-w-xl">
              {SEVA_ABOUT[seva.name] || seva.desc}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {seva.plans && (
              <span className="text-[0.625rem] font-semibold text-maroon-700 bg-maroon-50 rounded-full px-2 py-0.5">{seva.plans}</span>
            )}
            {DURATION[seva.category] && (
              <span className="text-[0.625rem] font-semibold text-gold-700 bg-gold-50 border border-gold-200 rounded-full px-2 py-0.5">{DURATION[seva.category]}</span>
            )}
          </div>
        </div>

        <div className="sm:text-right shrink-0">
          <div className="text-[0.5625rem] uppercase tracking-wide text-[#800020] font-semibold"><T>Starting From</T></div>
          <div className="text-lg font-extrabold text-maroon-700 leading-tight">
            {seva.committee ? <span className="text-xs"><T>Committee decided</T></span> : <>₹{fmt(seva.amount)}</>}
          </div>
          <button
            onClick={onView}
            className="btn-maroon !rounded-lg !py-1.5 !px-3 !text-[0.6875rem] mt-2 hover:!bg-gold-cta hover:!text-maroon-900"
          >
            View Details <ArrowRight size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── In-place detail view (no route / modal — replaces the list) ── */
function ServiceDetail({ seva, image, emoji, onBack }) {
  const { lang } = useLang()
  const plans = seva.planRows || []
  const multi = plans.length > 1
  // Multi-plan poojas start unselected (the table is the chooser); single-plan
  // poojas are implicitly "selected".
  const [planIdx, setPlanIdx] = useState(multi ? null : 0)
  const selected = planIdx != null ? plans[planIdx] : null

  const info = [
    { icon: Users, label: 'Category', value: `${seva.category} Pooja` },
    { icon: Clock, label: 'Duration', value: selected?.plan || DURATION[seva.category] || '1 Day' },
    { icon: FlameIcon, label: 'Type', value: `${seva.category} Pooja` },
    { icon: UserCheck, label: 'Performed By', value: 'Temple Priests' },
    { icon: Heart, label: 'Best For', value: 'All Devotees' },
    { icon: CalendarCheck, label: 'Booking', value: 'Advance booking recommended' },
  ]

  return (
    <div className="animate-fade-in">
      <button onClick={onBack} className="btn-ghost !px-2 !py-1 !text-xs mb-2 text-maroon-700">
        <ArrowLeft size={14} />{' '}<T>Back to list</T>{' '}</button>

      <div className="card overflow-hidden animate-slide-up">
        <div className="grid md:grid-cols-[40%_60%]">
          {/* Left — image */}
          <div className="relative min-h-[9.375rem]">
            <img src={image} alt={seva.name} className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-maroon-900/50 to-transparent" />
            {emoji && <span className="absolute bottom-2 left-2 text-xl drop-shadow-lg">{emoji}</span>}
            <span className="absolute top-2 left-2 text-[0.5625rem] font-bold uppercase tracking-wide bg-white/90 text-maroon-700 rounded-full px-2 py-0.5">{seva.category}</span>
          </div>

          {/* Right — details */}
          <div className="p-4">
            <div className="font-script text-lg text-gold-500 leading-none"><T>About</T></div>
            <h2 className="font-serif text-lg font-bold text-maroon-700">{seva.name}</h2>
            {lang === 'te' && seva.nameTe && <p className="text-[0.6875rem] text-black font-telugu">{seva.nameTe}</p>}
            <Flourish className="justify-start my-1.5" width="w-8" />
            <p className="text-[0.75rem] text-black leading-relaxed">
              {SEVA_ABOUT[seva.name] || seva.desc || `${seva.name} is a sacred offering performed at the temple as an expression of devotion, bringing peace, prosperity and blessings to devotees.`}
            </p>

            {/* A pooja offered on several plans lists them all; a single-plan
                pooja just shows its one offering price. */}
            {multi ? (
              <div className="mt-4">
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-[0.6875rem] uppercase tracking-wide text-black font-semibold"><T>Available Plans</T>{' '}</span>
                  <span className="text-[0.6875rem] text-gold-600"><T>Select a plan for details</T></span>
                </div>

                <table className="w-full text-sm border border-gold-200 rounded-xl overflow-hidden">
                  <thead>
                    <tr className="bg-gold-50 text-gold-600 text-[0.6875rem] uppercase tracking-wide">
                      <th className="text-left font-bold px-3 py-2"><T>Plan</T></th>
                      <th className="text-right font-bold px-3 py-2"><T>Fee</T></th>
                    </tr>
                  </thead>
                  <tbody>
                    {plans.map((p, i) => (
                      <tr
                        key={p.plan}
                        onClick={() => setPlanIdx(i)}
                        className={`border-t border-gold-100 cursor-pointer transition-colors ${
                          planIdx === i ? 'bg-gold-100' : 'hover:bg-gold-50'
                        }`}
                      >
                        <td className={`px-3 py-2 ${planIdx === i ? 'font-bold text-maroon-700' : 'text-black'}`}>
                          {p.plan}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-maroon-700 whitespace-nowrap">
                          {p.committee
                            ? <span className="text-xs text-black font-medium"><T>Committee Decided</T></span>
                            : `₹${fmt(p.amount)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {selected && (
                  <div key={selected.plan}
                       className="mt-3 rounded-xl border border-gold-300 bg-gold-50 px-4 py-3 animate-fade-in">
                    <div className="text-[0.625rem] font-bold uppercase tracking-wide text-gold-600"><T>Selected Plan</T></div>
                    <div className="font-serif text-lg font-bold text-maroon-700 mt-0.5">
                      {seva.name} — {selected.plan}
                    </div>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-[0.6875rem] uppercase tracking-wide text-black font-semibold"><T>Offering</T></span>
                      <span className="text-xl font-extrabold text-maroon-700">
                        {selected.committee ? <span className="text-base"><T>Committee Decided</T></span> : `₹${fmt(selected.amount)}`}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-[0.625rem] uppercase tracking-wide text-black font-semibold"><T>Offering</T></span>
                <span className="text-lg font-extrabold text-maroon-700">{priceLabel(seva)}</span>
                {!seva.committee && <span className="text-xs font-semibold text-black">/-</span>}
              </div>
            )}

            {/* Responsive info grid (2 columns) */}
            <div className="grid sm:grid-cols-2 gap-2 mt-4">
              {info.map((it) => {
                const Icon = it.icon
                return (
                  <div key={it.label} className="rounded-lg border border-gold-200 bg-ivory px-2.5 py-2 flex items-start gap-2">
                    <span className="w-7 h-7 rounded-full border border-gold-300 bg-gold-50 text-maroon-600 grid place-items-center shrink-0"><Icon size={13} /></span>
                    <div>
                      <div className="text-[0.625rem] font-bold uppercase tracking-wide text-gold-600">{it.label}</div>
                      <div className="text-[0.75rem] text-black font-medium">{it.value}</div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* How to book — counter-first, matching the temple's actual flow */}
            <div className="mt-4 flex items-center gap-2.5 bg-gold-50 border border-gold-200 rounded-xl px-3.5 py-2.5">
              <PhoneCall size={15} className="text-gold-600 shrink-0" />
              <p className="text-[0.75rem] text-black"><T>Book this pooja at the temple counter — a ticket with a scannable QR is issued instantly. For queries call</T>{' '}<a href="tel:+9104023353589" className="font-semibold text-maroon-700 hover:underline">+91 040 2335 3589</a>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
