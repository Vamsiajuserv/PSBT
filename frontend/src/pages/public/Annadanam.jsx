import React from 'react'
import { Link } from 'react-router-dom'
import {
  Info, UtensilsCrossed, HandHeart, CalendarDays, Users, Phone, Mail,
  Cake, Heart, Flower2, Sparkles, Stethoscope, Bell, ReceiptText, MapPin,
} from 'lucide-react'
import { SectionTitle, CountUp } from '../../components/common/UI.jsx'
import { useSite } from '../../lib/SiteContext.jsx'
import { useLang } from '../../i18n/LanguageContext.jsx'

// Sponsorship tiers actually used at the counter (amount = plates × published rate).
const TIERS = [
  { plates: 5, label: 'Seva Start' },
  { plates: 11, label: 'Blessing' },
  { plates: 50, label: 'Family Seva', popular: true },
  { plates: 100, label: 'Shatam Seva' },
  { plates: 500, label: 'Maha Seva' },
  { plates: 1000, label: 'Sahasram Seva' },
]

// Occasions devotees sponsor annadanam for (occasion is recorded on the receipt).
const OCCASIONS = [
  { icon: Cake, title: 'Birthdays', desc: 'Begin a birthday with the merit of feeding devotees.' },
  { icon: Heart, title: 'Anniversaries', desc: 'Celebrate a wedding day or milestone with seva.' },
  { icon: Flower2, title: 'In Memory', desc: 'Offer food in remembrance of departed loved ones.' },
  { icon: Sparkles, title: 'Festival Days', desc: 'Sri Rama Navami, Guru Purnima, Thursdays & more.' },
]

// How a sponsorship works at the temple.
const STEPS = [
  { icon: MapPin, title: 'Visit the Counter', desc: 'Come to the temple counter or call the office.' },
  { icon: CalendarDays, title: 'Choose Date & Plates', desc: 'Pick the day and the number of plates.' },
  { icon: ReceiptText, title: 'Pay & Get Receipt', desc: 'Pay by cash or UPI — an official receipt is issued.' },
  { icon: UtensilsCrossed, title: 'Annadanam Served', desc: 'Food is offered to devotees on your chosen day.' },
]

export default function Annadanam() {
  const { t } = useLang()
  const site = useSite()
  const TEMPLE = site?.temple || {}
  const IMG = site?.images || {}
  const ann = site?.annadanam || {}
  const rate = ann.rate || 50

  const IMPACT = [
    { icon: UtensilsCrossed, value: ann.total_plates || 0, label: 'Plates Served', sub: 'Through devotee sponsorships' },
    { icon: HandHeart, value: ann.total_sponsorships || 0, label: 'Sponsorships', sub: 'Recorded at the temple' },
    { icon: Users, value: ann.month_plates || 0, label: 'Plates This Month', sub: 'And counting…' },
  ]

  return (
    <div className="bg-[#FAF7F2] min-h-screen">

      {/* ── Page banner ── */}
      <header
        className="relative w-full overflow-hidden flex items-center"
        style={{ minHeight: '50px', background: 'linear-gradient(90deg,#4A0F0F 0%,#5E1918 50%,#4A0F0F 100%)' }}
      >
        <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(212,175,55,0.18) 0%, rgba(212,175,55,0) 62%)' }} />
        <div className="pointer-events-none absolute inset-0" style={{ boxShadow: 'inset 0 0 130px rgba(0,0,0,0.55)' }} />
        <div className="relative w-full px-5 sm:px-8 md:px-12 py-2">
          <h1 className="font-serif font-normal text-white leading-none tracking-[0.5px] text-[1.0625rem] sm:text-[1.25rem] md:text-[1.5rem]"
              style={{ textShadow: '0 3px 14px rgba(0,0,0,0.4)' }}>
            {t('Annadanam')}
          </h1>
          <nav aria-label="Breadcrumb" className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-poppins text-[0.625rem] sm:text-[0.6875rem] md:text-xs font-medium">
            <Link to="/" className="text-white hover:text-[#D4AF37] transition-colors">{t('Home')}</Link>
            <span className="text-white/70">›</span>
            <span className="text-[#D4AF37]">{t('Annadanam')}</span>
          </nav>
        </div>
      </header>

      {/* ── Hero: image + live impact ── */}
      <section className="relative bg-maroon-900 text-cream overflow-hidden">
        <img src={IMG.banner || IMG.hero} alt="Annadanam seva" className="absolute inset-0 w-full h-full object-cover opacity-25" loading="lazy" />
        <div className="absolute inset-0 bg-gradient-to-b from-maroon-900/60 via-maroon-900/80 to-maroon-900" />
        <div className="relative max-w-5xl mx-auto px-4 py-14 text-center">
          <div className="font-script text-2xl text-gold-300">{t('Sacred Food Offering')}</div>
          <h2 className="font-serif text-3xl md:text-4xl font-bold text-gold-200 mt-2">{t('Feed Devotees, Serve Humanity')}</h2>
          <p className="text-cream/85 text-sm md:text-base leading-relaxed max-w-2xl mx-auto mt-4">
            {t('Annadanam is the sacred offering of food — considered the highest of all danas. Every day, devotee sponsorships help the temple serve free prasadam meals to devotees and the needy.')}
          </p>

          <div className="grid sm:grid-cols-3 gap-4 mt-10">
            {IMPACT.map((s) => {
              const Icon = s.icon
              return (
                <div key={s.label} className="rounded-2xl border border-gold-400/30 bg-white/[0.06] backdrop-blur px-6 py-6">
                  <div className="w-11 h-11 mx-auto rounded-full bg-gold-400/15 border border-gold-400/40 text-gold-300 grid place-items-center"><Icon size={20} /></div>
                  <div className="font-serif text-3xl md:text-4xl font-bold text-gold-200 mt-3 tabular-nums"><CountUp value={s.value} /></div>
                  <div className="font-bold text-sm text-cream mt-1">{t(s.label)}</div>
                  <div className="text-[0.6875rem] text-cream/60 mt-0.5">{t(s.sub)}</div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── Baba's teaching ── */}
      <section className="bg-ivory border-b border-gold-200/60">
        <div className="max-w-3xl mx-auto px-4 py-10 text-center">
          <div className="text-gold-500 text-3xl leading-none">❝</div>
          <p className="font-serif text-xl md:text-2xl text-maroon-800 leading-relaxed mt-1">
            {t('Feed the hungry, and I shall consider it as feeding Me.')}
          </p>
          <div className="mt-3 flex items-center justify-center gap-2 text-gold-500">
            <span className="h-px w-12 bg-gold-400/70" /><span className="text-sm font-semibold text-maroon-700">{t('— Teaching of Shri Sai Baba')}</span><span className="h-px w-12 bg-gold-400/70" />
          </div>
        </div>
      </section>

      {/* ── Sponsorship tiers ── */}
      <section className="max-w-6xl mx-auto px-4 py-14">
        <SectionTitle title={t('Sponsor Annadanam')} subtitle={t(`Published rate ₹${rate} per plate — choose the seva that suits your occasion.`)} />
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mt-10">
          {TIERS.map((tier) => (
            <div key={tier.plates}
                 className={`relative card p-5 text-center flex flex-col ${tier.popular ? 'border-gold-400 ring-2 ring-gold-300/60' : ''}`}>
              {tier.popular && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-gold-500 text-maroon-900 text-[0.625rem] font-bold uppercase tracking-wide rounded-full px-2.5 py-0.5">{t('Popular')}</span>
              )}
              <div className="text-[0.6875rem] uppercase tracking-widest text-gold-600 font-bold">{t(tier.label)}</div>
              <div className="font-serif text-3xl font-bold text-maroon-800 mt-2">{tier.plates}</div>
              <div className="text-[0.6875rem] text-gray-500 -mt-0.5">{t('plates')}</div>
              <div className="mt-3 pt-3 border-t border-gold-200/70 text-maroon-700 font-extrabold">₹{(tier.plates * rate).toLocaleString('en-IN')}</div>
            </div>
          ))}
        </div>
        <p className="text-center text-[0.75rem] text-gray-500 mt-5">
          {t('Any number of plates may be sponsored — these are the sevas devotees choose most.')}
        </p>
      </section>

      {/* ── Occasions ── */}
      <section className="bg-ivory border-y border-gold-200/60">
        <div className="max-w-6xl mx-auto px-4 py-14">
          <SectionTitle title={t('Occasions for Annadanam Seva')} />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-10">
            {OCCASIONS.map((o) => {
              const Icon = o.icon
              return (
                <div key={o.title} className="card p-6 text-center">
                  <div className="w-12 h-12 mx-auto rounded-full bg-maroon-50 text-maroon-700 grid place-items-center"><Icon size={20} /></div>
                  <div className="font-bold text-maroon-700 mt-3">{t(o.title)}</div>
                  <p className="text-[0.75rem] text-black leading-relaxed mt-1.5">{t(o.desc)}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── Annadanam at our temple (real traditions) ── */}
      <section className="max-w-6xl mx-auto px-4 py-14">
        <SectionTitle title={t('Annadanam at Our Temple')} />
        <div className="grid md:grid-cols-3 gap-5 mt-10">
          <div className="card p-6">
            <div className="w-11 h-11 rounded-full bg-gold-100 text-gold-600 grid place-items-center"><Sparkles size={19} /></div>
            <div className="font-bold text-maroon-700 mt-3">{t('Sri Rama Navami Maha Annadanam')}</div>
            <p className="text-[0.78125rem] text-black leading-relaxed mt-1.5">
              {t('Every year on Sri Rama Navami, annadanam is served on a grand scale — free food reaches thousands of devotees in a single day.')}
            </p>
          </div>
          <div className="card p-6">
            <div className="w-11 h-11 rounded-full bg-gold-100 text-gold-600 grid place-items-center"><Bell size={19} /></div>
            <div className="font-bold text-maroon-700 mt-3">{t('Thursday Palki Seva')}</div>
            <p className="text-[0.78125rem] text-black leading-relaxed mt-1.5">
              {t("Every Thursday evening Baba's palki is taken through Dwarakapuri Colony with bhajans, followed by prasadam distribution to devotees.")}
            </p>
          </div>
          <div className="card p-6">
            <div className="w-11 h-11 rounded-full bg-gold-100 text-gold-600 grid place-items-center"><Stethoscope size={19} /></div>
            <div className="font-bold text-maroon-700 mt-3">{t('Seva Beyond Food')}</div>
            <p className="text-[0.78125rem] text-black leading-relaxed mt-1.5">
              {t('The trust also runs free medical services for the public — doctor consultations, physiotherapy, a pathology lab and a free pharmacy.')}
            </p>
          </div>
        </div>
      </section>

      {/* ── How to sponsor ── */}
      <section className="bg-ivory border-t border-gold-200/60">
        <div className="max-w-6xl mx-auto px-4 py-14">
          <SectionTitle title={t('How to Sponsor')} />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-10">
            {STEPS.map((s, i) => {
              const Icon = s.icon
              return (
                <div key={s.title} className="card p-6 text-center relative">
                  <div className="absolute top-3 left-3 w-6 h-6 rounded-full bg-maroon-700 text-cream text-[0.6875rem] font-bold grid place-items-center">{i + 1}</div>
                  <div className="w-12 h-12 mx-auto rounded-full bg-gradient-to-br from-gold-200 to-gold-400 text-maroon-800 grid place-items-center"><Icon size={20} /></div>
                  <div className="font-bold text-maroon-700 mt-3 text-sm">{t(s.title)}</div>
                  <p className="text-[0.75rem] text-black leading-relaxed mt-1.5">{t(s.desc)}</p>
                </div>
              )
            })}
          </div>

          {/* Contact + note */}
          <div className="max-w-3xl mx-auto mt-10">
            <div className="flex items-start gap-3 bg-saffron-50 border border-saffron-100 rounded-xl px-4 py-3">
              <Info size={16} className="text-saffron-600 shrink-0 mt-0.5" />
              <p className="text-[0.8125rem] text-black">
                {t('To sponsor annadanam, please visit the temple counter or contact the temple office. Our staff will help you arrange the date, occasion and number of plates — an official receipt is issued for every sponsorship.')}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3 mt-5">
              {TEMPLE.phone && (
                <a href={`tel:${TEMPLE.phone}`} className="btn-maroon !py-2.5 text-xs"><Phone size={14} /> {TEMPLE.phone}</a>
              )}
              {TEMPLE.email && (
                <a href={`mailto:${TEMPLE.email}`} className="btn-outline !py-2.5 text-xs"><Mail size={14} /> {TEMPLE.email}</a>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
