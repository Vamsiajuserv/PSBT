import React from 'react'
import { Link } from 'react-router-dom'
import {
  Clock, MapPin, Phone, Mail, HandHeart, UtensilsCrossed, Landmark, Gavel,
  Flower2, Info, ArrowRight, Leaf, HandHeart as SevaIcon, Star,
} from 'lucide-react'
import { SectionTitle, CountUp } from '../../components/common/UI.jsx'
import { useSite } from '../../lib/SiteContext.jsx'
import { useLang } from '../../i18n/LanguageContext.jsx'

// ── Services & offerings (informational — no online booking) ─────────────────
const SERVICES = [
  { icon: Flower2, title: 'Poojas & Services', desc: 'View the list of available poojas, rituals and seva details.', to: '/sevas', cta: 'View Details' },
  { icon: UtensilsCrossed, title: 'Annadanam', desc: 'Information about Annadanam seva and sponsorship details.', to: '/annadanam', cta: 'View Details' },
  { icon: Info, title: 'Temple Information', desc: 'General temple information and daily rituals.', to: '/about', cta: 'Learn More' },
]

// ── About highlights ─────────────────────────────────────────────────────────
const HIGHLIGHTS = [
  { icon: Leaf, title: 'Spiritual Environment', desc: 'Experience peace and positive energy' },
  { icon: SevaIcon, title: 'Seva to Society', desc: 'Committed to service and welfare' },
  { icon: Star, title: 'Devotion for All', desc: "Baba's grace is for everyone" },
]

export default function Home() {
  const { t } = useLang()
  const site = useSite()
  const TEMPLE = site?.temple || {}
  const IMG = site?.images || {}
  const GALLERY = site?.gallery || []
  const ann = site?.annadanam || {}
  // Years of continuous service, derived from the configured established year.
  const yearsOfSeva = Math.max(0, new Date().getFullYear() - (parseInt(TEMPLE.established, 10) || 1987))

  // ── Info strip below the hero ──
  const INFO = [
    { icon: Clock, title: 'Temple Timings', lines: [TEMPLE.timings, 'Everyday'] },
    { icon: MapPin, title: 'Temple Location', lines: ['Dwarakapuri Colony,', 'Punjagutta, Hyderabad'] },
    { icon: Phone, title: 'Contact', lines: [TEMPLE.phone] },
    { icon: Mail, title: 'Email', lines: [TEMPLE.email] },
  ]

  return (
    <div>
      {/* ── Hero ── */}
      <section className="relative bg-maroon-900 text-cream overflow-hidden">
        <img src={IMG.hero} alt="Sri Shirdi Sai Baba Temple" className="absolute inset-0 w-full h-full object-cover object-right" />
        <div className="absolute inset-0 bg-gradient-to-r from-maroon-900 via-maroon-900/85 to-maroon-900/20" />
        <div className="absolute inset-0 bg-mandala" />

        <div className="relative max-w-7xl mx-auto px-4 py-20 lg:py-28">
          <div className="max-w-xl">
            <div className="font-script text-3xl text-gold-300 leading-none">|| {'Om Sri Sai Ram'} ||</div>
            <div className="font-serif text-4xl md:text-5xl font-bold mt-4 leading-tight">{t('Welcome to')}</div>
            <h1 className="font-serif text-4xl md:text-6xl font-bold mt-1 leading-tight text-gold-200">{t('Sri Shirdi Sai Baba Temple')}</h1>
            <div className="mt-5 flex items-center gap-2 text-gold-400"><span className="h-px w-16 bg-gold-400/70" /><span>❖</span><span className="h-px w-16 bg-gold-400/70" /></div>
            <p className="text-cream/85 mt-5 text-lg leading-relaxed">{t(TEMPLE.tagline)}</p>
          </div>
        </div>
      </section>

      {/* ── Info strip ── */}
      <section className="max-w-7xl mx-auto px-4 -mt-10 relative z-10">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {INFO.map((it) => {
            const Icon = it.icon
            return (
              <div key={it.title} className="card p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-maroon-50 text-maroon-700 grid place-items-center shrink-0"><Icon size={20} /></div>
                <div className="min-w-0">
                  <div className="font-bold text-sm text-maroon-700">{t(it.title)}</div>
                  {it.lines.map((l) => (
                    <div key={l} className="text-[0.75rem] text-black leading-snug truncate">{t(l)}</div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Our Services & Offerings ── */}
      <section className="max-w-7xl mx-auto px-4 py-14">
        <SectionTitle title={t('Our Services & Offerings')} />
        {/* 3 cards — centered under the heading (a 6-col grid here left the row leaning left) */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-10 max-w-4xl mx-auto">
          {SERVICES.map((s) => {
            const Icon = s.icon
            return (
              <div key={s.title} className="card p-6 flex flex-col text-center items-center">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-gold-200 to-gold-400 text-maroon-800 grid place-items-center shrink-0"><Icon size={24} /></div>
                <h4 className="font-bold text-maroon-700 mt-4">{t(s.title)}</h4>
                <p className="text-[0.75rem] text-black leading-relaxed mt-2 flex-1">{t(s.desc)}</p>
                <Link to={s.to} className="btn-maroon w-full mt-4 !py-2 text-xs">{t(s.cta)}</Link>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── About our temple ── */}
      <section className="bg-ivory border-y border-gold-200/60">
        <div className="max-w-7xl mx-auto px-4 py-16 grid lg:grid-cols-2 gap-12 items-center">
          <div className="rounded-2xl overflow-hidden border-4 border-gold-300 shadow-card">
            <img src={IMG.about} alt="Sri Sai Baba shrine" className="w-full h-full object-cover aspect-[4/3]" loading="lazy" />
          </div>
          <div>
            <div className="font-display text-xs uppercase tracking-[0.2em] text-gold-600 flex items-center gap-2">{t('About Our Temple')} <span className="h-px w-10 bg-gold-400" /></div>
            <h2 className="font-serif text-3xl md:text-4xl font-bold text-maroon-700 mt-3 leading-tight">{t('A Place of Faith, Devotion and Compassion')}</h2>
            <p className="text-black text-sm leading-relaxed mt-5">
              {t("Sri Shirdi Sai Baba Temple, Dwarakapuri Colony, Punjagutta, Hyderabad is dedicated to spreading the teachings of Shirdi Sai Baba. The temple serves as a spiritual center where devotees from all walks of life come together to seek Baba's blessings.")}
            </p>
            <div className="grid sm:grid-cols-3 gap-6 mt-8">
              {HIGHLIGHTS.map((h) => {
                const Icon = h.icon
                return (
                  <div key={h.title}>
                    <div className="w-11 h-11 rounded-full bg-maroon-50 text-maroon-700 grid place-items-center"><Icon size={18} /></div>
                    <div className="font-bold text-sm text-maroon-700 mt-3">{t(h.title)}</div>
                    <div className="text-[0.75rem] text-black leading-snug mt-1">{t(h.desc)}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── Seva impact band — live numbers from the temple's records ── */}
      <section className="relative bg-maroon-900 text-cream overflow-hidden">
        <div className="absolute inset-0 bg-mandala" />
        <div className="relative max-w-7xl mx-auto px-4 py-14">
          <div className="text-center">
            <div className="font-script text-2xl text-gold-300">{t('Seva in Numbers')}</div>
            <h2 className="font-serif text-2xl md:text-3xl font-bold text-gold-200 mt-1">{t("Baba's Grace at Work — Every Day")}</h2>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-10">
            {[
              { value: yearsOfSeva, plus: true, label: 'Years of Service', sub: `Serving devotees since ${TEMPLE.established || '1987'}` },
              { value: ann.total_plates || 0, label: 'Meals Served', sub: 'Through Annadanam seva' },
              { value: (site?.sevas || []).length, plus: true, label: 'Poojas & Sevas', sub: 'Performed as in Shirdi' },
              { value: ann.total_sponsorships || 0, label: 'Annadanam Sponsors', sub: 'Devotees who fed devotees' },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-gold-400/30 bg-white/[0.06] px-6 py-6 text-center">
                <div className="font-serif text-3xl md:text-4xl font-bold text-gold-200 tabular-nums">
                  <CountUp value={s.value} />{s.plus ? '+' : ''}
                </div>
                <div className="font-bold text-sm mt-1.5">{t(s.label)}</div>
                <div className="text-[0.6875rem] text-cream/60 mt-0.5">{t(s.sub)}</div>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link to="/annadanam" className="btn-primary">{t('Sponsor Annadanam')} <ArrowRight size={16} /></Link>
          </div>
        </div>
      </section>

      {/* ── Gallery ── */}
      <section className="max-w-7xl mx-auto px-4 py-16">
        <SectionTitle title={t('Gallery')} />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mt-10">
          {GALLERY.slice(0, 5).map((g) => (
            <div key={g.id} className="rounded-xl overflow-hidden border border-gold-200 shadow-card group aspect-[4/5]">
              <img src={g.img} alt={g.caption} className="w-full h-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
            </div>
          ))}
        </div>
        <div className="text-center mt-8">
          <Link to="/gallery" className="btn-primary">{t('View More Photos')} <ArrowRight size={16} /></Link>
        </div>
      </section>
    </div>
  )
}
