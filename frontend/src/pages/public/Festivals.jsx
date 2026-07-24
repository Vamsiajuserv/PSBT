import React from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, Bell, Sparkles, ArrowRight, Clock } from 'lucide-react'
import { Badge, MinimalBanner, SectionTitle } from '../../components/common/UI.jsx'
import { useSite } from '../../lib/SiteContext.jsx'
import { useLang } from '../../i18n/LanguageContext.jsx'

const DAY = 24 * 60 * 60 * 1000
const norm = (s) => (s || '').toLowerCase().replace(/[^a-z]/g, '')

function fmtRange(start, end) {
  const f = (s) => new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  if (!start) return null
  return !end || end === start ? f(start) : `${f(start)} – ${f(end)}`
}

export default function Festivals() {
  const { t } = useLang()
  const site = useSite()
  const festivals = site?.festivals || []
  const dates = site?.festival_dates || []

  // Match a content card to its live Festival-Master dates by name.
  const dateFor = (name) => dates.find((d) => norm(d.name) === norm(name) ||
    norm(d.name).includes(norm(name)) || norm(name).includes(norm(d.name)))

  // Upcoming schedule (today or later), soonest first — for the hero strip.
  const today = new Date(new Date().toDateString())
  const upcoming = dates
    .filter((d) => d.end && new Date(d.end + 'T00:00:00') >= today)
    .sort((a, b) => (a.start || '').localeCompare(b.start || ''))
  const next = upcoming[0]
  const daysTo = next ? Math.max(0, Math.round((new Date(next.start + 'T00:00:00') - today) / DAY)) : null

  const major = festivals.filter((f) => f.major)
  // Weekly Thursday seva gets its own featured palki band below — keep the
  // annual-celebrations grid to actual annual festivals (and a full 4-up row).
  const others = festivals.filter((f) => !f.major && f.month !== 'Weekly')

  return (
    <div className="bg-cream">
      <MinimalBanner title={t('Festivals & Events')} breadcrumb="Home  ›  Festivals" />

      {/* ── Hero: next festival + upcoming schedule (live from Festival Master) ── */}
      {next && (
        <section className="relative bg-maroon-900 text-cream overflow-hidden">
          <div className="absolute inset-0 bg-mandala" />
          <div className="relative max-w-6xl mx-auto px-4 py-10">
            <div className="grid lg:grid-cols-[1fr_auto] gap-8 items-center">
              <div>
                <div className="font-script text-2xl text-gold-300">{t('Utsavams in the Shirdi Tradition')}</div>
                <h2 className="font-serif text-2xl md:text-3xl font-bold text-gold-200 mt-1">
                  {t('Next Celebration')}: {t(next.name)}
                </h2>
                <div className="flex flex-wrap items-center gap-3 mt-3 text-sm">
                  <span className="inline-flex items-center gap-1.5 bg-white/10 border border-gold-400/30 rounded-full px-3 py-1">
                    <CalendarDays size={14} className="text-gold-300" /> {fmtRange(next.start, next.end)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 bg-gold-500 text-maroon-900 font-bold rounded-full px-3 py-1">
                    <Clock size={14} /> {daysTo === 0 ? t('Today!') : `${daysTo} ${t('days to go')}`}
                  </span>
                </div>
              </div>
              {/* Upcoming list */}
              <div className="rounded-2xl border border-gold-400/30 bg-white/[0.06] px-5 py-4 min-w-[16rem]">
                <div className="text-[0.6875rem] uppercase tracking-widest text-gold-300 font-bold mb-2">{t('Upcoming This Year')}</div>
                <ul className="space-y-1.5">
                  {upcoming.slice(0, 4).map((u) => (
                    <li key={u.name} className="flex items-center justify-between gap-6 text-[0.8125rem]">
                      <span className="text-cream/90">{t(u.name)}</span>
                      <span className="text-gold-300 font-semibold whitespace-nowrap">
                        {new Date(u.start + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="max-w-7xl mx-auto px-4 py-14">
        {/* ── The three great Shirdi festivals ── */}
        <SectionTitle title={t('The Three Great Festivals of Shirdi')}
          subtitle={t('As at Shirdi itself, Sri Rama Navami, Guru Purnima and Vijayadashami are the principal utsavams of the temple.')} />
        <div className="grid md:grid-cols-3 gap-6 mt-10">
          {major.map((f) => {
            const live = dateFor(f.name)
            return (
              <div key={f.name} className="card overflow-hidden group border-gold-300 ring-1 ring-gold-200/70">
                <div className="aspect-[16/9] relative overflow-hidden">
                  <img src={f.img} alt={f.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                  <span className="absolute bottom-2 left-3 text-3xl drop-shadow-lg">{f.icon}</span>
                  <span className="absolute top-2 right-2 bg-gold-500 text-maroon-900 text-[0.625rem] font-bold uppercase tracking-wide rounded-full px-2.5 py-0.5">{t('Major Festival')}</span>
                </div>
                <div className="p-5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-serif text-lg font-bold text-maroon-700">{t(f.name)}</h3>
                    <Badge tone="amber">{live?.start ? fmtRange(live.start, live.end) : t(f.month)}</Badge>
                  </div>
                  <p className="text-xs text-black font-telugu">{f.nameTe}</p>
                  <p className="text-sm text-black mt-2 leading-relaxed">{t(f.desc)}</p>
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Other celebrations ── */}
        <div className="mt-14">
          <SectionTitle title={t('Celebrations Through the Year')} />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-10">
            {others.map((f) => {
              const live = dateFor(f.name)
              return (
                <div key={f.name} className="card overflow-hidden group">
                  <div className="aspect-[16/9] relative overflow-hidden">
                    <img src={f.img} alt={f.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                    <span className="absolute bottom-2 left-3 text-2xl drop-shadow-lg">{f.icon}</span>
                  </div>
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-serif text-base font-bold text-maroon-700">{t(f.name)}</h3>
                      <Badge tone="amber">{live?.start ? fmtRange(live.start, live.end) : t(f.month)}</Badge>
                    </div>
                    <p className="text-[0.6875rem] text-black font-telugu">{f.nameTe}</p>
                    <p className="text-[0.8125rem] text-black mt-1.5 leading-relaxed">{t(f.desc)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Thursday palki band — the temple's weekly signature ── */}
      <section className="bg-ivory border-y border-gold-200/60">
        <div className="max-w-6xl mx-auto px-4 py-14 grid lg:grid-cols-2 gap-10 items-center">
          <div className="rounded-2xl overflow-hidden border-4 border-gold-300 shadow-card">
            <img src="/images/festivals/palki.jpg" alt="Palki seva" className="w-full object-cover aspect-[16/10]" loading="lazy" />
          </div>
          <div>
            <div className="font-display text-xs uppercase tracking-[0.2em] text-gold-600 flex items-center gap-2">
              <Bell size={14} /> {t('Every Thursday')} <span className="h-px w-10 bg-gold-400" />
            </div>
            <h2 className="font-serif text-3xl font-bold text-maroon-700 mt-3 leading-tight">{t("Baba's Palki Yatra")}</h2>
            <p className="text-black text-sm leading-relaxed mt-4">
              {t("Thursday is Baba's day. Every Thursday evening at 7:30 PM, Baba's palki is carried on devotees' shoulders through Dwarakapuri Colony and Hindi Colony to the singing of bhajans, returning to the temple for aarti and prasadam distribution. Devotees from across Hyderabad join this weekly procession.")}
            </p>
            <div className="flex flex-wrap gap-3 mt-6">
              <span className="inline-flex items-center gap-1.5 bg-maroon-50 text-maroon-700 text-xs font-semibold rounded-full px-3 py-1.5"><Clock size={13} /> 7:30 PM {t('every Thursday')}</span>
              <span className="inline-flex items-center gap-1.5 bg-gold-50 text-gold-700 text-xs font-semibold rounded-full px-3 py-1.5"><Sparkles size={13} /> {t('Bhajans · Aarti · Prasadam')}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="max-w-4xl mx-auto px-4 py-12 text-center">
        <h3 className="font-serif text-2xl font-bold text-maroon-700">{t('Take Part in a Festival')}</h3>
        <p className="text-sm text-black mt-2 max-w-xl mx-auto">
          {t('Festival poojas can be booked at the temple counter, and annadanam may be sponsored for any festival day.')}
        </p>
        <div className="flex flex-wrap justify-center gap-3 mt-6">
          <Link to="/sevas" className="btn-maroon">{t('View Festival Poojas')} <ArrowRight size={15} /></Link>
          <Link to="/annadanam" className="btn-primary">{t('Sponsor Annadanam')} <ArrowRight size={15} /></Link>
        </div>
      </section>
    </div>
  )
}
