import React from 'react'
import { MinimalBanner, GoldRule, GOLD, GOLD_DEEP } from '../../components/common/UI.jsx'
import { useSite } from '../../lib/SiteContext.jsx'
import { T, tr } from '../../i18n/LanguageContext.jsx'

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

export default function History() {
  const site = useSite()
  const history = site?.history || []
  const story = site?.baba_story || []
  const templeImg = site?.images?.about || site?.images?.hero || ''

  return (
    <div className="bg-cream">
      <MinimalBanner title={tr("Temple History")} breadcrumb="Home  ›  About Temple  ›  History" />

      {/* ── The story of Shirdi Sai Baba ── */}
      {story.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 pt-12 pb-4">
          <div className="text-center">
            <div className="font-script text-2xl text-gold-500"><T>The Life of</T></div>
            <h2 className="font-serif text-3xl md:text-4xl font-bold text-maroon-700 mt-1"><T>Shirdi Sai Baba</T></h2>
            <GoldDivider />
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-10">
            {story.map((s, i) => (
              <article key={s.era} className="card overflow-hidden animate-slide-up"
                       style={{ animationDelay: `${i * 120}ms` }}>
                <div className="aspect-[4/3] overflow-hidden">
                  <img src={s.img} alt={s.title} className="w-full h-full object-cover" loading="lazy" />
                </div>
                <div className="p-5">
                  <div className="text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-[#B8860B]">{s.era}</div>
                  <h3 className="font-serif text-lg font-bold text-[#6A1E1E] mt-1">{s.title}</h3>
                  <p className="text-[0.8125rem] text-black leading-relaxed mt-1.5">{s.desc}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* ── Baba's promise — quote band ── */}
      <section className="max-w-3xl mx-auto px-4 py-10 text-center">
        <div className="text-gold-500 text-3xl leading-none">❝</div>
        <p className="font-serif text-xl md:text-2xl text-maroon-800 leading-relaxed mt-1"><T>Why fear when I am here? I shall be active and vigorous even from my tomb.</T>{' '}</p>
        <div className="mt-3 flex items-center justify-center gap-2 text-gold-500">
          <span className="h-px w-12 bg-gold-400/70" />
          <span className="text-sm font-semibold text-maroon-700"><T>— Shri Sai Baba of Shirdi</T></span>
          <span className="h-px w-12 bg-gold-400/70" />
        </div>
      </section>

      {/* ── Our temple's journey heading ── */}
      <div className="text-center pt-2 pb-0">
        <div className="font-script text-2xl text-gold-500"><T>Carrying the Light Forward</T></div>
        <h2 className="font-serif text-3xl md:text-4xl font-bold text-maroon-700 mt-1"><T>Our Temple's Journey</T></h2>
        <div className="mt-2"><GoldDivider /></div>
      </div>

      {/* ── Timeline — styled with the site's core card language (ivory band,
             white gold-bordered cards), matching the About/Festivals sections. ── */}
      <section className="bg-ivory border-y border-gold-200/60 mt-6">
        <div className="max-w-7xl mx-auto px-4 py-14">
          <div className="grid lg:grid-cols-[35%_1fr] gap-10 lg:gap-14 items-start">
            {/* Left — temple image, framed exactly like the About section */}
            <figure className="lg:sticky lg:top-24">
              {templeImg && (
                <div className="rounded-2xl overflow-hidden border-4 border-gold-300 shadow-card">
                  <img src={templeImg} alt="Sri Shirdi Sai Baba Temple"
                       className="w-full object-cover aspect-[4/5]" loading="lazy" />
                </div>
              )}
            </figure>

            {/* Right — vertical timeline with standard cards */}
            <div className="relative pl-8 sm:pl-12">
              {/* Vertical gold line */}
              <span className="absolute left-[0.375rem] top-3 bottom-3 w-px bg-gold-300 pointer-events-none" />

              <div className="space-y-6">
                {history.map((h) => (
                  <div key={h.year} className="relative">
                    {/* Gold milestone dot on the line */}
                    <span className="absolute -left-8 sm:-left-12 top-7 w-3 h-3 rounded-full bg-gold-400 ring-4 ring-gold-100" />
                    <article className="card p-6">
                      <div className="text-[0.6875rem] font-bold uppercase tracking-[0.2em] text-gold-600"><T>{h.year}</T></div>
                      <h3 className="font-serif text-xl font-bold text-maroon-700 mt-1.5"><T>{h.title}</T></h3>
                      <p className="text-sm text-black mt-2 leading-relaxed"><T>{h.desc}</T></p>
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
