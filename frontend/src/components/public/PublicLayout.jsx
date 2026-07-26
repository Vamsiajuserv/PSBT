import React, { useState } from 'react'
import { Outlet, NavLink, Link } from 'react-router-dom'
import {
  Menu, X, Phone, Mail, MapPin, ChevronDown, Facebook, Instagram, Youtube, ShieldCheck, Clock, Languages,
} from 'lucide-react'
import { useLang, T, tr, useTempleAddress } from '../../i18n/LanguageContext.jsx'
import { useSiteContext, useTemple } from '../../lib/SiteContext.jsx'
import { getFontScale, setFontScale } from '../../lib/fontScale.js'
import TempleLoader from './TempleLoader.jsx'

function LangToggle({ className = '' }) {
  const { lang, setLang } = useLang()
  return (
    <div className={`inline-flex items-center rounded-full border border-gold-400/60 overflow-hidden text-[0.6875rem] font-bold ${className}`}>
      <button onClick={() => setLang('en')} className={`px-2 py-1 ${lang === 'en' ? 'bg-gold-500 text-maroon-900' : 'text-current hover:bg-white/10'}`}><T>EN</T></button>
      <button onClick={() => setLang('te')} className={`px-2 py-1 font-telugu ${lang === 'te' ? 'bg-gold-500 text-maroon-900' : 'text-current hover:bg-white/10'}`}>తెలుగు</button>
    </div>
  )
}

// Accessibility text-size control (A− / A / A+) — bumps the whole UI via the
// --font-scale CSS variable, remembered across visits (see lib/fontScale.js).
function FontSizeToggle({ className = '' }) {
  const [level, setLevel] = useState(getFontScale())
  const pick = (l) => setLevel(setFontScale(l))
  const btn = (l, node, title) => (
    <button onClick={() => pick(l)} title={title} aria-label={title}
      className={`px-2 py-1 leading-none ${level === l ? 'bg-gold-500 text-maroon-900' : 'text-current hover:bg-white/10'}`}>
      {node}
    </button>
  )
  return (
    <div className={`inline-flex items-stretch rounded-full border border-gold-400/60 overflow-hidden font-bold ${className}`}>
      {btn('small', <span className="text-[0.625rem]">A−</span>, 'Smaller text')}
      {btn('normal', <span className="text-[0.8125rem]">A</span>, 'Default text size')}
      {btn('large', <span className="text-[1rem]">A+</span>, 'Larger text')}
    </div>
  )
}

const NAV = [
  { to: '/', label: 'Home', end: true },
  {
    label: 'About Temple',
    children: [
      { to: '/about', label: 'About Temple' },
      { to: '/history', label: 'Temple History' },
      { to: '/festivals', label: 'Festivals & Events' },
    ],
  },
  {
    label: 'Poojas & Services',
    children: [
      { to: '/sevas', label: 'All Poojas & Sevas' },
      { to: '/annadanam', label: 'Annadanam' },
    ],
  },
  { to: '/donations', label: 'Donations' },
  { to: '/gallery', label: 'Gallery' },
  { to: '/contact', label: 'Contact Us' },
]

const QUICK_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/about', label: 'About Temple' },
  { to: '/sevas', label: 'Poojas & Services' },
  { to: '/donations', label: 'Donations' },
  { to: '/gallery', label: 'Gallery' },
  { to: '/contact', label: 'Contact Us' },
]

function Logo({ light = false }) {
  const temple = useTemple()
  const address = useTempleAddress()
  return (
    <Link to="/" className="flex items-center gap-3">
      {/* Official temple seal — the badge carries its own ring, so it sits
          directly on both the ivory header and the maroon footer. */}
      <img src="/images/temple-logo.png" alt="Sri Shirdi Sai Baba Temple" className="w-16 h-16 shrink-0 drop-shadow-sm" />
      <div className="leading-tight">
        <div className={`font-display font-bold text-[0.9375rem] sm:text-lg tracking-wide uppercase ${light ? 'text-gold-200' : 'text-maroon-700'}`}>
          {tr(temple?.name || 'Sri Shirdi Sai Baba Temple')}
        </div>
        <div className={`text-[0.625rem] sm:text-[0.6875rem] ${light ? 'text-cream/70' : 'text-black'}`}>
          {address}
        </div>
      </div>
    </Link>
  )
}

export default function PublicLayout() {
  const [open, setOpen] = useState(false)
  const { t, lang } = useLang()
  const { site, loading, error } = useSiteContext()
  const address = useTempleAddress()

  const flatMobile = NAV.flatMap((n) => (n.children ? n.children : [n]))

  if (loading) {
    return <TempleLoader label={t('Loading temple information…')} />
  }
  if (!site) {
    return (
      <div className="temple-loader min-h-screen grid place-items-center px-6 text-center">
        <div className="animate-fade-in">
          <div className="font-script text-3xl text-gold-300 mb-3">|| {t('Om Sri Sai Ram')} ||</div>
          <p className="text-cream/80 text-sm max-w-sm mx-auto">{error || t('Could not load temple information. Please try again.')}</p>
          <button onClick={() => window.location.reload()} className="btn-primary mt-5 !py-2 text-xs">{t('Retry')}</button>
        </div>
      </div>
    )
  }
  const TEMPLE = site.temple
  const MANTRA = site.mantra

  return (
    <div className={`min-h-screen flex flex-col ${lang === 'te' ? 'font-telugu' : ''}`}>
      {/* ── Top utility bar ── */}
      <div className="bg-maroon-900 text-gold-200 text-[0.6875rem]">
        <div className="max-w-7xl mx-auto px-4 h-9 flex items-center justify-between">
          <span className="font-telugu">🕉 || {MANTRA.hi} ||</span>
          <div className="flex items-center gap-3">
            {[[Facebook, 'facebook'], [Instagram, 'instagram'], [Youtube, 'youtube']].some(([, k]) => TEMPLE.social?.[k]) &&
              <span className="hidden sm:inline text-gold-200/80">{t('Follow Us :')}</span>}
            {[[Facebook, 'facebook'], [Instagram, 'instagram'], [Youtube, 'youtube']]
              .filter(([, k]) => TEMPLE.social?.[k])
              .map(([Ic, k]) => (
                <a key={k} href={TEMPLE.social[k]} target="_blank" rel="noopener noreferrer" aria-label={k}
                   className="w-6 h-6 rounded-full bg-white/10 hover:bg-gold-500 hover:text-maroon-900 grid place-items-center transition-colors">
                  <Ic size={12} />
                </a>
              ))}
            <FontSizeToggle className="text-gold-200" />
            <LangToggle className="text-gold-200" />
          </div>
        </div>
      </div>

      {/* ── Header ── */}
      <header className="sticky top-0 z-40 bg-ivory/95 backdrop-blur border-b-2 border-gold-300 shadow-soft">
        <div className="max-w-7xl mx-auto px-4 h-[4.5rem] flex items-center justify-between gap-4">
          <Logo />

          <nav className="hidden lg:flex items-center gap-0.5">
            {NAV.map((n) =>
              n.children ? (
                <div key={n.label} className="relative group">
                  <button className="px-3 py-2 rounded-lg text-[0.8125rem] font-semibold text-gray-700 hover:text-maroon-700 flex items-center gap-1">
                    {t(n.label)} <ChevronDown size={14} className="text-gold-500" />
                  </button>
                  <div className="absolute left-0 top-full pt-1 hidden group-hover:block">
                    <div className="w-56 card !rounded-xl p-1.5">
                      {n.children.map((c) => (
                        <NavLink
                          key={c.to + c.label}
                          to={c.to}
                          className={({ isActive }) =>
                            `block px-3 py-2 rounded-lg text-[0.8125rem] font-medium ${isActive ? 'bg-maroon-50 text-maroon-700' : 'text-gray-600 hover:bg-gold-50 hover:text-maroon-700'}`
                          }
                        >
                          {t(c.label)}
                        </NavLink>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  className={({ isActive }) =>
                    `px-3 py-2 rounded-lg text-[0.8125rem] font-semibold transition-colors border-b-2 ${isActive ? 'text-maroon-700 border-gold-400' : 'text-gray-700 border-transparent hover:text-maroon-700'}`
                  }
                >
                  {t(n.label)}
                </NavLink>
              )
            )}
          </nav>

          <div className="flex items-center gap-2">
            <Link to="/staff-login" className="btn-maroon !py-2 !px-3.5 text-xs">
              <ShieldCheck size={14} /> <span className="hidden sm:inline">{t('Temple Staff Login')}</span><span className="sm:hidden">{t('Staff Login')}</span>
            </Link>
            <button className="lg:hidden btn-ghost !p-2" onClick={() => setOpen(!open)}>
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {open && (
          <nav className="lg:hidden border-t border-gold-200 px-4 py-2 flex flex-col bg-ivory max-h-[70vh] overflow-y-auto">
            {flatMobile.map((l) => (
              <NavLink
                key={l.to + l.label}
                to={l.to}
                end={l.end}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `px-3 py-2.5 rounded-lg text-sm font-semibold ${isActive ? 'text-maroon-700 bg-gold-50' : 'text-gray-700'}`
                }
              >
                {t(l.label)}
              </NavLink>
            ))}
            <div className="px-3 py-2.5"><LangToggle className="text-maroon-700 border-maroon-300" /></div>
          </nav>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      {/* ── Footer ── */}
      <footer className="bg-temple text-cream/80">
        <div className="max-w-7xl mx-auto px-4 py-12 grid md:grid-cols-2 lg:grid-cols-5 gap-8">
          {/* Brand */}
          <div>
            <div className="font-display font-bold text-lg tracking-wide text-gold-200 uppercase">{t(TEMPLE.name)}</div>
            <p className="text-xs leading-relaxed text-cream/60 mt-3">
              {t(TEMPLE.tagline || 'A sacred place dedicated to Sri Shirdi Sai Baba, spreading love, faith and seva.')}
            </p>
            <div className="flex gap-2 mt-4">
              {[[Facebook, 'facebook'], [Instagram, 'instagram'], [Youtube, 'youtube']]
                .filter(([, k]) => TEMPLE.social?.[k])
                .map(([Ic, k]) => (
                  <a key={k} href={TEMPLE.social[k]} target="_blank" rel="noopener noreferrer" aria-label={k}
                     className="w-8 h-8 rounded-full bg-white/10 hover:bg-gold-500 hover:text-maroon-900 grid place-items-center transition-colors"><Ic size={15} /></a>
                ))}
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <div className="font-display text-xs uppercase tracking-widest text-gold-300 mb-3">{t('Quick Links')}</div>
            <ul className="space-y-2 text-xs">
              {QUICK_LINKS.map((l) => (
                <li key={l.label}><Link to={l.to} className="hover:text-gold-200 transition-colors flex items-center gap-1.5"><span className="text-gold-500">›</span>{t(l.label)}</Link></li>
              ))}
            </ul>
          </div>

          {/* Temple Information */}
          <div>
            <div className="font-display text-xs uppercase tracking-widest text-gold-300 mb-3">{t('Temple Information')}</div>
            <ul className="space-y-2 text-xs">
              {[
                // Reg. No is an identifier — it stays in Latin script, like the
                // email address and phone number below.
                [t('Established'), TEMPLE.established],
                [t('Managed By'), t(TEMPLE.managedBy)],
                [t('Trust Reg. No'), TEMPLE.regNo],
                [t('Pan No.'), t(TEMPLE.pan)],
              ].map(([label, value]) => (
                <li key={label} className="flex gap-1.5">
                  <span className="text-cream/50 w-24 shrink-0">{label}</span>
                  <span className="shrink-0">:</span>
                  <span className="min-w-0 break-words">{value}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact Us */}
          <div>
            <div className="font-display text-xs uppercase tracking-widest text-gold-300 mb-3">{t('Contact Us')}</div>
            <ul className="space-y-2 text-xs">
              <li className="flex gap-2"><MapPin size={14} className="text-gold-400 shrink-0 mt-0.5" /> {address}</li>
              <li className="flex gap-2"><Phone size={14} className="text-gold-400 shrink-0" /> {TEMPLE.phone}</li>
              <li className="flex gap-2"><Mail size={14} className="text-gold-400 shrink-0" /> {TEMPLE.email}</li>
            </ul>
          </div>

          {/* Temple Timings */}
          <div>
            <div className="font-display text-xs uppercase tracking-widest text-gold-300 mb-3">{t('Temple Timings')}</div>
            <div className="flex gap-2 text-xs">
              <Clock size={14} className="text-gold-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-cream">{TEMPLE.timings}</div>
                <div className="text-cream/60">{t('Everyday')}</div>
              </div>
            </div>
            <div className="mt-4 bg-gold-500/15 border border-gold-500/25 rounded-lg px-3 py-2.5 text-[0.6875rem] text-gold-100/90 leading-relaxed">
              {t(TEMPLE.timingsNote)}
            </div>
          </div>
        </div>

        <div className="border-t border-white/10">
          <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-[0.6875rem] text-cream/50">
            <span>© {new Date().getFullYear()} {t(TEMPLE.name)}. {t('All Rights Reserved.')}</span>
            <span>{t('Website designed and developed for Sri Shirdi Sai Baba Temple.')}</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
