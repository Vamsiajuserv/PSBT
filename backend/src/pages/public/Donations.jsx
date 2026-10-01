import React from 'react'
import { Link } from 'react-router-dom'
import {
  HeartHandshake, Gift, Star, Landmark, HeartPulse, Utensils, Building2,
  PiggyBank, Sparkles, Flame, Sun, ClipboardList, CreditCard, Banknote,
  QrCode, Globe, Phone, IndianRupee, Users, ReceiptText, BadgeCheck,
  ArrowRight, Gem, CircleDot, Box,
} from 'lucide-react'
import { CountUp, Flourish } from '../../components/common/UI.jsx'
import { useSite } from '../../lib/SiteContext.jsx'
import { useLang, tr, T } from '../../i18n/LanguageContext.jsx'

/* ── Custom SVG Icons for better visuals ── */
const TempleIcon = ({ size = 24, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 2L3 9h18L12 2z" />
    <path d="M5 9v10h14V9" />
    <path d="M9 19v-6h6v6" />
    <path d="M3 19h18" />
    <circle cx="12" cy="6" r="1" fill="currentColor" />
  </svg>
)

const TreasureIcon = ({ size = 24, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M3 10h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V10z" />
    <path d="M3 10l2-6h14l2 6" />
    <circle cx="12" cy="15" r="2" />
    <path d="M12 13v-1" />
  </svg>
)

const HundiIcon = ({ size = 24, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <ellipse cx="12" cy="6" rx="8" ry="3" />
    <path d="M4 6v12c0 1.66 3.58 3 8 3s8-1.34 8-3V6" />
    <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" />
    <path d="M10 9h4" />
  </svg>
)

const GoldBarIcon = ({ size = 24, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M4 18h16l2-8H2l2 8z" />
    <path d="M6 10l1-4h10l1 4" />
    <path d="M8 14h8" />
    <path d="M9 6h6" />
  </svg>
)

const SilverCoinIcon = ({ size = 24, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <path d="M12 7v1" />
    <path d="M12 16v1" />
    <path d="M7 12h1" />
    <path d="M16 12h1" />
  </svg>
)

const FestivalIcon = ({ size = 24, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 2v3" />
    <path d="M12 5c-3 0-6 2-6 6v8h12v-8c0-4-3-6-6-6z" />
    <path d="M6 19h12" />
    <path d="M8 2l2 3" />
    <path d="M16 2l-2 3" />
    <circle cx="12" cy="11" r="2" fill="currentColor" />
  </svg>
)

const DiyaIcon = ({ size = 24, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 6c-1 0-2-.5-2-2s1-2 2-2 2 .5 2 2-1 2-2 2z" fill="currentColor" />
    <path d="M12 6v2" />
    <ellipse cx="12" cy="14" rx="7" ry="4" />
    <path d="M5 14c0 3 3 6 7 6s7-3 7-6" />
    <path d="M9 14c0 1.5 1.5 3 3 3s3-1.5 3-3" />
  </svg>
)

/* ── Static fallbacks ──────── */
const CASH_CARDS = [
  { name: 'Temple Development Donation', desc: 'Support temple renovation and expansion.', Icon: TempleIcon },
  { name: 'Corpus / Endowment Donation', desc: 'Create a permanent fund for temple activities.', Icon: TreasureIcon },
]

const MATERIAL_CARDS = [
  { name: 'General Donation (Hundi)', unit: 'Grams', Icon: HundiIcon },
  { name: 'Gold', unit: 'Grams', Icon: GoldBarIcon },
  { name: 'Silver', unit: 'Grams', Icon: SilverCoinIcon },
]

const SPONSOR_CARDS = [
  { name: 'Festival Sponsorship', desc: 'Sponsor a temple festival celebration.', Icon: FestivalIcon },
  { name: 'Pooja Sponsorship', desc: 'Sponsor a special pooja in your name.', Icon: DiyaIcon },
]

const STEPS = [
  { title: 'Visit Temple Counter', desc: 'Come to our donation desk during temple hours' },
  { title: 'Register Details', desc: 'Provide your name and mobile number' },
  { title: 'Select Category', desc: 'Choose from cash, material, or sponsorship' },
  { title: 'Make Donation', desc: 'Pay by cash or UPI / scan QR code' },
  { title: 'Get Receipt', desc: 'Receive official receipt instantly' },
]

const PAYMENTS = [
  { icon: Banknote, title: 'Cash', desc: 'At temple counter' },
  { icon: QrCode, title: 'UPI / QR', desc: 'Scan & pay instantly' },
  { icon: Globe, title: 'Online', desc: 'Coming soon', disabled: true },
]

export default function Donations() {
  const { t } = useLang()
  const site = useSite()
  const TEMPLE = site?.temple || {}
  const impact = site?.donations_impact || {}

  const IMPACT = [
    { icon: IndianRupee, value: impact.year_amount || 0, prefix: '₹', label: `${t('Donations in')} ${impact.year || new Date().getFullYear()}`, sub: 'Cash & sponsorships received' },
    { icon: ReceiptText, value: impact.year_count || 0, label: 'Receipts Issued', sub: 'Every donation recorded' },
    { icon: Users, value: impact.donor_count || 0, label: 'Generous Donors', sub: 'Devotees who contributed' },
  ]

  return (
    <div className="bg-cream min-h-screen">
      {/* ── Minimal Banner ── */}
      <header className="relative bg-gradient-to-r from-maroon-900 via-maroon-800 to-maroon-900 overflow-hidden">
        <div className="absolute inset-0 bg-mandala opacity-10" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <h1 className="font-serif text-xl md:text-2xl font-bold text-gold-200 tracking-wide">
            <T>Donations</T>
          </h1>
          <nav className="flex items-center gap-2 text-xs text-cream/70 mt-1">
            <Link to="/" className="hover:text-gold-300 transition-colors"><T>Home</T></Link>
            <span>›</span>
            <span className="text-gold-300"><T>Donations</T></span>
          </nav>
        </div>
      </header>

      {/* ── Impact Stats Hero ── */}
      <section className="relative bg-gradient-to-br from-maroon-800 to-maroon-900 overflow-hidden">
        <div className="absolute inset-0 bg-mandala opacity-5" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-10 md:py-14">
          <div className="text-center mb-8">
            <div className="font-script text-2xl md:text-3xl text-gold-300"><T>Shraddha · Saburi</T></div>
            <h2 className="font-serif text-2xl md:text-3xl font-bold text-gold-100 mt-2">
              <T>Every Offering Becomes Seva</T>
            </h2>
            <p className="text-cream/80 text-sm md:text-base max-w-2xl mx-auto mt-3 leading-relaxed">
              <T>Donations sustain the daily poojas, annadanam, free medical services and the upkeep of the temple.</T>
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-4 md:gap-6">
            {IMPACT.map((s) => {
              const Icon = s.icon
              return (
                <div key={s.label} className="bg-white/5 backdrop-blur-sm border border-gold-400/20 rounded-2xl p-5 md:p-6 text-center hover:bg-white/10 transition-colors">
                  <div className="w-12 h-12 mx-auto rounded-full bg-gold-400/10 border border-gold-400/30 text-gold-300 grid place-items-center">
                    <Icon size={22} />
                  </div>
                  <div className="font-serif text-2xl md:text-3xl font-bold text-gold-200 mt-3 tabular-nums">
                    {s.prefix || ''}<CountUp value={s.value} />
                  </div>
                  <div className="font-semibold text-cream text-sm mt-1">{t(s.label)}</div>
                  <div className="text-xs text-cream/60 mt-0.5">{t(s.sub)}</div>
                </div>
              )
            })}
          </div>

          <div className="flex justify-center mt-6">
            <div className="inline-flex items-center gap-2 bg-emerald-500/15 border border-emerald-400/30 text-emerald-200 rounded-full px-4 py-2 text-sm font-medium">
              <BadgeCheck size={16} /> <T>Medical donations are eligible for 80G tax benefit</T>
            </div>
          </div>
        </div>
      </section>

      {/* ── Three Columns: Cash | Material | Sponsorships ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 md:py-12">
        <div className="grid md:grid-cols-3 gap-6">

          {/* ── Cash Donations Column ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-maroon-700 to-maroon-800 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 grid place-items-center text-white">
                  <HeartHandshake size={20} />
                </div>
                <h3 className="font-serif text-lg font-bold text-gold-100"><T>Cash Donations</T></h3>
              </div>
            </div>
            <div className="p-4 space-y-3">
              {CASH_CARDS.map((c) => {
                const Icon = c.Icon
                return (
                  <div key={c.name} className="group p-4 rounded-xl border border-maroon-100 hover:border-maroon-300 hover:shadow-lg transition-all duration-300 bg-gradient-to-br from-maroon-50/50 to-white">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-maroon-600 to-maroon-700 text-gold-200 grid place-items-center shrink-0 shadow-md group-hover:scale-110 group-hover:shadow-lg transition-all duration-300">
                        <Icon size={24} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-serif font-bold text-maroon-800 text-[0.9375rem] leading-tight">{t(c.name)}</h4>
                        <p className="text-gray-600 text-xs mt-1.5 leading-relaxed">{t(c.desc)}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Material Donations Column ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 grid place-items-center text-white">
                  <Gift size={20} />
                </div>
                <h3 className="font-serif text-lg font-bold text-white"><T>Material Donations</T></h3>
              </div>
            </div>
            <div className="p-4 space-y-3">
              {MATERIAL_CARDS.map((m) => {
                const Icon = m.Icon
                return (
                  <div key={m.name} className="group p-4 rounded-xl border border-emerald-100 hover:border-emerald-300 hover:shadow-lg transition-all duration-300 bg-gradient-to-br from-emerald-50/50 to-white">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-700 text-emerald-100 grid place-items-center shrink-0 shadow-md group-hover:scale-110 group-hover:shadow-lg transition-all duration-300">
                        <Icon size={24} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-serif font-bold text-gray-800 text-[0.9375rem]">{t(m.name)}</h4>
                        <p className="text-emerald-600 text-xs mt-0.5 font-medium">({t(m.unit)})</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="px-4 pb-4">
              <p className="text-emerald-700 text-xs text-center bg-emerald-50 rounded-lg py-2 px-3">
                <T>Material offerings are weighed at the counter.</T>
              </p>
            </div>
          </div>

          {/* ── Sponsorships Column ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-violet-600 to-violet-700 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 grid place-items-center text-white">
                  <Star size={20} />
                </div>
                <h3 className="font-serif text-lg font-bold text-white"><T>Sponsorships</T></h3>
              </div>
            </div>
            <div className="p-4 space-y-3">
              {SPONSOR_CARDS.map((s) => {
                const Icon = s.Icon
                return (
                  <div key={s.name} className="group p-4 rounded-xl border border-violet-100 hover:border-violet-300 hover:shadow-lg transition-all duration-300 bg-gradient-to-br from-violet-50/50 to-white">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-600 to-violet-700 text-violet-100 grid place-items-center shrink-0 shadow-md group-hover:scale-110 group-hover:shadow-lg transition-all duration-300">
                        <Icon size={24} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-serif font-bold text-gray-800 text-[0.9375rem] leading-tight">{t(s.name)}</h4>
                        <p className="text-gray-600 text-xs mt-1.5 leading-relaxed">{t(s.desc)}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="px-4 pb-4">
              <Link to="/annadanam" className="flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold px-4 py-2.5 rounded-lg text-sm transition-colors w-full">
                <T>Sponsor Annadanam</T> <ArrowRight size={14} />
              </Link>
            </div>
          </div>

        </div>

        {/* ── How to Donate + Payment Methods ── */}
        <div className="grid lg:grid-cols-2 gap-6 mt-10">

          {/* How to Donate */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-amber-600 to-amber-700 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 grid place-items-center text-white">
                  <ClipboardList size={20} />
                </div>
                <h3 className="font-serif text-lg font-bold text-white"><T>How to Donate</T></h3>
              </div>
            </div>
            <div className="p-5">
              <div className="space-y-4">
                {STEPS.map((step, i) => (
                  <div key={step.title} className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 grid place-items-center text-sm font-bold shrink-0">
                      {i + 1}
                    </div>
                    <div>
                      <div className="font-semibold text-gray-800 text-sm">{t(step.title)}</div>
                      <div className="text-gray-500 text-xs mt-0.5">{t(step.desc)}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-gray-100">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
                  <BadgeCheck size={12} /> <T>80G for medical</T>
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-maroon-700 bg-maroon-50 border border-maroon-200 rounded-full px-2.5 py-1">
                  <ReceiptText size={12} /> <T>Instant receipts</T>
                </span>
              </div>
            </div>
          </div>

          {/* Payment Methods + Contact */}
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/20 grid place-items-center text-white">
                    <CreditCard size={20} />
                  </div>
                  <h3 className="font-serif text-lg font-bold text-white"><T>Payment Methods</T></h3>
                </div>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-3 gap-3">
                  {PAYMENTS.map((p) => (
                    <div key={p.title} className={`text-center p-3 rounded-xl ${p.disabled ? 'opacity-50' : 'bg-gray-50'}`}>
                      <div className="w-12 h-12 mx-auto rounded-full bg-blue-100 text-blue-600 grid place-items-center mb-2">
                        <p.icon size={22} />
                      </div>
                      <div className="font-semibold text-gray-800 text-sm">{t(p.title)}</div>
                      <div className="text-gray-500 text-xs mt-0.5">{t(p.desc)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-11 h-11 rounded-full bg-blue-600 text-white grid place-items-center shrink-0">
                  <Phone size={20} />
                </div>
                <div>
                  <h4 className="font-serif text-lg font-bold text-blue-900"><T>Need Assistance?</T></h4>
                  <p className="text-blue-700 text-xs"><T>Temple Office</T></p>
                </div>
              </div>
              <p className="text-blue-800 text-sm mb-3"><T>Our staff will help you with donation registration, receipt generation, and 80G tax guidance.</T></p>
              {TEMPLE.phone && (
                <a href={`tel:${TEMPLE.phone}`} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors">
                  <Phone size={14} /> {TEMPLE.phone}
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
