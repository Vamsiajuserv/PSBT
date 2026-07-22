import React from 'react'
import { MinimalBanner, Mandala, GoldRule, Particles, GOLD, GOLD_DEEP } from '../../components/common/UI.jsx'
import { useSite } from '../../lib/SiteContext.jsx'

/* Soft floral watermark for the section corners (purely ornamental). */
function Floral({ className = '' }) {
  return (
    <svg viewBox="0 0 120 120" className={className} fill="none" stroke={GOLD_DEEP}
         strokeWidth="1.1" aria-hidden="true">
      <path d="M8 112 C 30 94, 40 70, 42 46" />
      <path d="M42 46 C 30 40, 18 44, 14 56 C 26 62, 38 56, 42 46Z" />
      <path d="M42 46 C 54 40, 66 46, 68 58 C 56 63, 45 57, 42 46Z" />
      <path d="M42 46 C 44 30, 58 20, 72 22 C 70 38, 56 46, 42 46Z" />
      <circle cx="42" cy="46" r="3.5" />
      <path d="M58 102 C 74 88, 86 74, 92 58" />
      <circle cx="92" cy="54" r="4" />
    </svg>
  )
}

/* Small gold ornamental divider with flourishes. */
function GoldDivider() {
  return (
    <div className="flex items-center justify-center gap-3" aria-hidden="true">
      <GoldRule width="w-16 sm:w-24" />
      <svg viewBox="0 0 40 16" className="w-10 h-4" fill="none" stroke={GOLD_DEEP} strokeWidth="1.2">
        <path d="M20 2 L26 8 L20 14 L14 8 Z" />
        <path d="M4 8 H12" /><path d="M28 8 H36" />
        <circle cx="20" cy="8" r="1.6" fill={GOLD} stroke="none" />
      </svg>
      <GoldRule width="w-16 sm:w-24" dir="left" />
    </div>
  )
}

// Positions/delays for the drifting golden particles.
const PARTICLES = [
  { left: '12%', bottom: '18%', size: 5, delay: '0s' },
  { left: '27%', bottom: '32%', size: 3, delay: '1.6s' },
  { left: '46%', bottom: '12%', size: 4, delay: '3.1s' },
  { left: '63%', bottom: '26%', size: 3, delay: '4.4s' },
  { left: '78%', bottom: '15%', size: 5, delay: '2.3s' },
  { left: '90%', bottom: '38%', size: 3, delay: '5.7s' },
]

export default function History() {
  const site = useSite()
  const history = site?.history || []
  const templeImg = site?.images?.about || site?.images?.hero || ''

  return (
    <div className="bg-cream">
      <MinimalBanner title="Temple History" breadcrumb="Home  ›  About Temple  ›  History" />

      <section className="history-hero relative overflow-hidden">
        {/* ── Decorative wallpaper layers (all non-interactive) ── */}
        <div className="history-parchment absolute inset-0 pointer-events-none" />
        <div className="history-rays absolute inset-0 pointer-events-none opacity-60" />

        {/* Mandala motif — right side, 8% opacity */}
        <Mandala strokeWidth={0.35}
                 className="absolute -right-24 top-1/2 -translate-y-1/2 w-[32.5rem] h-[32.5rem]
                            opacity-[0.08] pointer-events-none hidden md:block"
                 style={{ color: GOLD_DEEP }} />

        {/* Floral watermarks in the corners */}
        <Floral className="absolute top-0 left-0 w-40 h-40 -translate-x-6 -translate-y-6
                           opacity-[0.07] pointer-events-none" />
        <Floral className="absolute bottom-0 right-0 w-48 h-48 translate-x-8 translate-y-8
                           rotate-180 opacity-[0.07] pointer-events-none" />

        {/* Soft glowing particles */}
        <Particles items={PARTICLES} />

        {/* Light mist near the bottom */}
        <div className="history-mist absolute inset-x-0 bottom-0 h-40 pointer-events-none" />

        {/* ── Content ── */}
        <div className="relative max-w-[90rem] mx-auto px-5 sm:px-8 pt-6 pb-14 lg:pt-8 lg:pb-20 animate-fade-in">
          <div className="grid lg:grid-cols-[35%_1fr] gap-10 lg:gap-16 items-start">
            {/* Left — temple image, glowing and fading into the background */}
            <figure className="relative lg:sticky lg:top-8">
              <div className="history-glow absolute -inset-6 pointer-events-none" />
              {templeImg && (
                <img
                  src={templeImg}
                  alt="Sri Shirdi Sai Baba Temple"
                  className="temple-mask relative w-full h-56 sm:h-80 lg:h-[28.75rem] object-cover"
                  loading="lazy"
                />
              )}
              {/* Warm golden lighting wash + bottom fade into mist */}
              <div className="absolute inset-0 pointer-events-none mix-blend-soft-light"
                   style={{ background: 'linear-gradient(160deg, rgba(255,226,150,0.55), transparent 55%)' }} />
              <div className="absolute inset-x-0 bottom-0 h-24 pointer-events-none"
                   style={{ background: 'linear-gradient(to top, #F5E5C4, transparent)' }} />
            </figure>

            {/* Right — golden timeline + floating glass milestone cards */}
            <div className="relative pl-10 sm:pl-16">
              {/* Thin vertical golden line */}
              <span
                className="absolute left-[0.375rem] top-3 bottom-3 w-[2px] rounded-full pointer-events-none"
                style={{ background: 'linear-gradient(to bottom, transparent, #C89B3C 12%, #E8C76A 50%, #C89B3C 88%, transparent)' }}
              />

              <div className="space-y-8">
                {history.map((h, i) => (
                  <div
                    key={h.year}
                    className="relative animate-slide-up"
                    style={{ animationDelay: `${i * 130}ms` }}
                  >
                    {/* Golden circular milestone, centred on the line */}
                    <span
                      className="timeline-dot absolute -left-10 sm:-left-16 top-8 w-3.5 h-3.5 rounded-full"
                      style={{
                        background: 'radial-gradient(circle at 35% 30%, #F6E3A8, #D4AF37 60%, #C89B3C)',
                        border: '2px solid rgba(255,255,255,0.9)',
                      }}
                    />

                    <article className="glass-card p-6 sm:p-7">
                      <div className="text-[0.6875rem] font-bold uppercase tracking-[0.2em] text-[#B8860B]">
                        {h.year}
                      </div>
                      <h3 className="font-serif text-xl font-bold text-[#6A1E1E] mt-1.5">
                        {h.title}
                      </h3>
                      <p className="text-sm text-black mt-2 leading-[1.75]">
                        {h.desc}
                      </p>
                    </article>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
