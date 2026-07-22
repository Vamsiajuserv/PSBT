import React from 'react'
import { Link } from 'react-router-dom'
import {
  HeartHandshake, Gift, Star, Landmark, HeartPulse, Utensils, Building2,
  PiggyBank, Sparkles, Flame, Sun, ClipboardList, CreditCard, Banknote,
  QrCode, Globe, Phone, IndianRupee, Users, ReceiptText, BadgeCheck,
} from 'lucide-react'
import { CountUp } from '../../components/common/UI.jsx'
import { useSite } from '../../lib/SiteContext.jsx'
import { useLang } from '../../i18n/LanguageContext.jsx'

/* ── Static fallbacks (used until donation categories are configured) ──────── */
const CASH_FALLBACK = [
  { name: 'General Donation (Hundi)', desc: 'Support the daily needs and maintenance of the temple.' },
  { name: 'Medical Donation', desc: 'Help provide charitable medical services.' },
  { name: 'Annadanam Donation', desc: 'Contribute towards free meals for devotees.' },
  { name: 'Temple Development Donation', desc: 'Support temple renovation and expansion.' },
  { name: 'Corpus / Endowment Donation', desc: 'Create a permanent fund for temple activities.' },
]
const MATERIAL_FALLBACK = [
  { name: 'Gold', unit: 'Grams' }, { name: 'Silver', unit: 'Grams' },
  { name: 'Rice Bags', unit: 'Bags / Kg' }, { name: 'Grocery', unit: 'Kg / Packs' },
  { name: 'Oil', unit: 'Liters' }, { name: 'Ghee', unit: 'Liters / Kg' },
  { name: 'Flowers', unit: 'Kg / Garlands' }, { name: 'Fruits', unit: 'Kg' },
  { name: 'Pooja Materials', unit: 'Item-wise' }, { name: 'Utensils', unit: 'Piece-wise' },
]
const SPONSOR_FALLBACK = [
  { name: 'Festival Sponsorship', desc: 'Sponsor a temple festival celebration.' },
  { name: 'Annadanam Sponsorship', desc: 'Sponsor free meals for devotees.' },
  { name: 'Pooja Sponsorship', desc: 'Sponsor a special pooja in your name.' },
  { name: 'Aarti Sponsorship', desc: 'Sponsor the sacred aarti ceremony.' },
]

/* Icon / emoji pickers — keyword-matched so admin-added categories get a
   sensible visual without a code change. */
function cashIcon(name) {
  const n = (name || '').toLowerCase()
  if (n.includes('hundi') || n.includes('general')) return Landmark
  if (n.includes('medical')) return HeartPulse
  if (n.includes('annadanam') || n.includes('food')) return Utensils
  if (n.includes('development') || n.includes('construction')) return Building2
  if (n.includes('corpus') || n.includes('endowment')) return PiggyBank
  return HeartHandshake
}
function materialEmoji(name) {
  const n = (name || '').toLowerCase()
  if (n.includes('gold')) return '🪙'
  if (n.includes('silver')) return '🥈'
  if (n.includes('rice')) return '🌾'
  if (n.includes('grocery')) return '🛒'
  if (n.includes('oil')) return '🛢️'
  if (n.includes('ghee')) return '🧈'
  if (n.includes('flower')) return '🌸'
  if (n.includes('fruit')) return '🍎'
  if (n.includes('pooja')) return '🪔'
  if (n.includes('utensil')) return '🍽️'
  return '🎁'
}
function sponsorIcon(name) {
  const n = (name || '').toLowerCase()
  if (n.includes('festival')) return Sparkles
  if (n.includes('annadanam')) return Utensils
  if (n.includes('pooja')) return Flame
  if (n.includes('aarti')) return Sun
  return Star
}

const STEPS = [
  'Visit the Temple Counter',
  'Register Name and Mobile',
  'Select Donation Category',
  'Enter Amount or Hand Over Material',
  'Pay by Cash or UPI',
  'Receive Official Receipt',
]
const PAYMENTS = [
  { icon: Banknote, title: 'Cash' },
  { icon: QrCode, title: 'UPI / QR Code' },
  { icon: Globe, title: 'Online Payment', note: 'Future Enhancement' },
]
const ASSIST = [
  'Donation Registration', 'Material Donations', 'Sponsorship Booking',
  'Receipt Generation', '80G Tax Guidance',
]

function Ribbon({ icon: Icon, title, color }) {
  return (
    <div className="flex items-center justify-center gap-2.5 mx-auto mb-4 w-fit rounded-full px-5 py-1.5 shadow-md" style={{ backgroundColor: color }}>
      <Icon size={18} className="text-white" strokeWidth={2} />
      <h2 className="font-serif text-white text-base md:text-xl font-bold tracking-wide uppercase">{title}</h2>
    </div>
  )
}

const cardBase =
  'bg-white border border-[#EADFC0] rounded-[1.125rem] shadow-[0_10px_30px_rgba(90,30,30,0.06)] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_18px_44px_rgba(90,30,30,0.13)]'

export default function Donations() {
  const { t } = useLang()
  const site = useSite()
  const TEMPLE = site?.temple || {}
  const impact = site?.donations_impact || {}
  const funds = site?.funds || []

  // Live categories by type; graceful fallback to the curated lists.
  const byType = (ty) => funds.filter((f) => f.type === ty)
  const cash = byType('Cash').length ? byType('Cash') : CASH_FALLBACK
  const material = byType('Material').length ? byType('Material') : MATERIAL_FALLBACK
  const sponsor = byType('Sponsorship').length ? byType('Sponsorship') : SPONSOR_FALLBACK

  const IMPACT = [
    { icon: IndianRupee, value: impact.year_amount || 0, prefix: '₹ ', label: `Donations in ${impact.year || new Date().getFullYear()}`, sub: 'Cash & sponsorships received' },
    { icon: ReceiptText, value: impact.year_count || 0, label: 'Receipts This Year', sub: 'Every donation is recorded' },
    { icon: Users, value: impact.donor_count || 0, label: 'Generous Donors', sub: 'Devotees who gave with faith' },
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
            {t('Donations')}
          </h1>
          <nav aria-label="Breadcrumb" className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-poppins text-[0.625rem] sm:text-[0.6875rem] md:text-xs font-medium">
            <Link to="/" className="text-white hover:text-[#D4AF37] transition-colors">{t('Home')}</Link>
            <span className="text-white/70">›</span>
            <span className="text-[#D4AF37]">{t('Donations')}</span>
          </nav>
        </div>
      </header>

      {/* ── Impact hero — live numbers from the donation ledger ── */}
      <section className="relative bg-maroon-900 text-cream overflow-hidden">
        <div className="absolute inset-0 bg-mandala" />
        <div className="relative max-w-5xl mx-auto px-4 py-12 text-center">
          <div className="font-script text-2xl text-gold-300">{t('Shraddha · Saburi')}</div>
          <h2 className="font-serif text-2xl md:text-3xl font-bold text-gold-200 mt-1">{t('Every Offering Becomes Seva')}</h2>
          <p className="text-cream/85 text-sm leading-relaxed max-w-2xl mx-auto mt-3">
            {t('Donations sustain the daily poojas, annadanam, free medical services and the upkeep of the temple. Every rupee and every offering is receipted and accounted for.')}
          </p>
          <div className="grid sm:grid-cols-3 gap-4 mt-8">
            {IMPACT.map((s) => {
              const Icon = s.icon
              return (
                <div key={s.label} className="rounded-2xl border border-gold-400/30 bg-white/[0.06] px-6 py-5">
                  <div className="w-10 h-10 mx-auto rounded-full bg-gold-400/15 border border-gold-400/40 text-gold-300 grid place-items-center"><Icon size={18} /></div>
                  <div className="font-serif text-2xl md:text-3xl font-bold text-gold-200 mt-2.5 tabular-nums">
                    {s.prefix || ''}<CountUp value={s.value} />
                  </div>
                  <div className="font-bold text-sm mt-1">{t(s.label)}</div>
                  <div className="text-[0.6875rem] text-cream/60 mt-0.5">{t(s.sub)}</div>
                </div>
              )
            })}
          </div>
          <div className="inline-flex items-center gap-2 mt-6 bg-emerald-500/10 border border-emerald-400/30 text-emerald-200 rounded-full px-4 py-1.5 text-[0.75rem] font-semibold">
            <BadgeCheck size={14} /> {t('Medical donations are eligible for 80G tax benefit')}
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 md:py-10">

        {/* ── Section 1 — Cash Donations (live categories) ── */}
        <section>
          <Ribbon icon={HeartHandshake} title={t('Cash Donations')} color="#6E2C2C" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {cash.map((c) => {
              const Icon = cashIcon(c.name)
              const is80g = /medical/i.test(c.name)
              return (
                <div key={c.name} className={`${cardBase} p-4 text-center`}>
                  <div className="w-12 h-12 mx-auto rounded-full grid place-items-center bg-[#F7EFE3] text-[#6E2C2C] mb-3">
                    <Icon size={22} strokeWidth={1.8} />
                  </div>
                  <h3 className="font-serif text-[#5A1E1E] font-bold text-base leading-snug">{t(c.name)}</h3>
                  {is80g && (
                    <span className="inline-block mt-2 text-[0.625rem] font-semibold uppercase tracking-wide text-[#3D5A34] bg-[#EAF0E5] rounded-full px-2 py-0.5">
                      {t('80G Eligible')}
                    </span>
                  )}
                  <p className="font-poppins text-[0.8125rem] text-[#666] mt-2 leading-relaxed">{t(c.desc)}</p>
                </div>
              )
            })}
          </div>
        </section>

        {/* ── Section 2 — Material Donations (live categories) ── */}
        <section className="mt-8">
          <Ribbon icon={Gift} title={t('Material Donations')} color="#3D5A34" />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
            {material.map((m) => (
              <div key={m.name} className={`${cardBase} p-3.5 text-center`}>
                <div className="text-3xl mb-1.5 leading-none">{materialEmoji(m.name)}</div>
                <h3 className="font-serif text-[#5A1E1E] font-semibold">{t(m.name)}</h3>
                <p className="font-poppins text-xs text-[#8a8a8a] mt-0.5">({t(m.unit || 'Item-wise')})</p>
              </div>
            ))}
          </div>
          <p className="text-center font-poppins text-[0.75rem] text-[#8a8a8a] mt-4">
            {t('Material offerings are weighed / counted at the counter and receipted in your name.')}
          </p>
        </section>

        {/* ── Section 3 — Sponsorships (live categories) ── */}
        <section className="mt-8">
          <Ribbon icon={Star} title={t('Sponsorships')} color="#5B3B7A" />
          <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${sponsor.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3 max-w-4xl mx-auto'}`}>
            {sponsor.map((s) => {
              const Icon = sponsorIcon(s.name)
              return (
                <div key={s.name} className={`${cardBase} p-4 text-center`}>
                  <div className="w-12 h-12 mx-auto rounded-full grid place-items-center bg-[#F1ECF6] text-[#5B3B7A] mb-2.5">
                    <Icon size={22} strokeWidth={1.8} />
                  </div>
                  <h3 className="font-serif text-[#5A1E1E] font-bold">{t(s.name)}</h3>
                  <p className="font-poppins text-[0.8125rem] text-[#666] mt-1.5 leading-relaxed">{t(s.desc || 'Arranged at the temple counter.')}</p>
                </div>
              )
            })}
          </div>
          <div className="text-center mt-5">
            <Link to="/annadanam" className="btn-primary !py-2.5 text-xs">{t('Sponsor Annadanam')} →</Link>
          </div>
        </section>

        {/* ── Bottom — How to Donate + Payments ── */}
        <section className="mt-10 grid md:grid-cols-2 gap-5">

          {/* Left — How to Donate */}
          <div className={`${cardBase} hover:translate-y-0 p-5 sm:p-6`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-full grid place-items-center bg-[#FBEEE0] text-[#C2611F] shrink-0">
                <ClipboardList size={22} strokeWidth={1.9} />
              </div>
              <h3 className="font-serif text-xl font-bold text-[#5A1E1E] uppercase tracking-wide">{t('How to Donate')}</h3>
            </div>
            <ol className="space-y-2.5">
              {STEPS.map((step, i) => (
                <li key={step} className="flex items-start gap-3">
                  <span className="mt-0.5 w-6 h-6 shrink-0 rounded-full grid place-items-center bg-[#C2611F] text-white text-xs font-semibold font-poppins">
                    {i + 1}
                  </span>
                  <span className="font-poppins text-[0.875rem] text-[#555] leading-relaxed">{t(step)}</span>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-dashed border-[#EADFC0]">
              <span className="inline-flex items-center gap-1.5 text-[0.6875rem] font-semibold text-[#3D5A34] bg-[#EAF0E5] rounded-full px-2.5 py-1">
                <BadgeCheck size={12} /> {t('Medical donations eligible for 80G')}
              </span>
              <span className="inline-flex items-center gap-1.5 text-[0.6875rem] font-semibold text-[#6E2C2C] bg-[#F7EFE3] rounded-full px-2.5 py-1">
                <ReceiptText size={12} /> {t('Every donation is recorded by the temple')}
              </span>
            </div>
          </div>

          {/* Right — Payments + Assistance */}
          <div className="space-y-5">
            <div className={`${cardBase} hover:translate-y-0 overflow-hidden`}>
              <div className="flex items-center gap-3 px-5 sm:px-6 py-3 bg-[#2F5C8F]">
                <CreditCard size={20} className="text-white" strokeWidth={1.9} />
                <h3 className="font-serif text-base font-bold text-white uppercase tracking-wide">{t('Accepted Payment Methods')}</h3>
              </div>
              <div className="grid grid-cols-3 gap-3 p-5 sm:p-6">
                {PAYMENTS.map((p) => (
                  <div key={p.title} className="text-center">
                    <div className="w-12 h-12 mx-auto rounded-full grid place-items-center bg-[#EAF1F9] text-[#2F5C8F] mb-2">
                      <p.icon size={24} strokeWidth={1.8} />
                    </div>
                    <p className="font-poppins text-[0.8125rem] font-medium text-[#444] leading-tight">{t(p.title)}</p>
                    {p.note && <p className="font-poppins text-[0.625rem] text-[#999] mt-0.5">({t(p.note)})</p>}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[#EAF1F9] border border-[#CFE0F0] rounded-[1.125rem] p-5 sm:p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full grid place-items-center bg-[#2F5C8F] text-white shrink-0">
                  <Phone size={18} strokeWidth={2} />
                </div>
                <div>
                  <h4 className="font-serif text-lg font-bold text-[#1F3A5C]">{t('Need Assistance?')}</h4>
                  <p className="font-poppins text-xs text-[#3F5A78]">{t('Temple Office')}</p>
                </div>
              </div>
              <p className="font-poppins text-[0.8125rem] text-[#3F5A78] mb-3">{t('Our staff will help you with:')}</p>
              <ul className="space-y-1.5">
                {ASSIST.map((a) => (
                  <li key={a} className="flex items-center gap-2 font-poppins text-[0.8125rem] text-[#2F5C8F]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#2F5C8F]" />
                    {t(a)}
                  </li>
                ))}
              </ul>
              {TEMPLE.phone && (
                <a href={`tel:${TEMPLE.phone}`} className="btn-maroon !py-2 text-xs mt-4"><Phone size={13} /> {TEMPLE.phone}</a>
              )}
            </div>
          </div>
        </section>

      </div>
    </div>
  )
}
