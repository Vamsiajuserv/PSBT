import React, { useEffect, useMemo, useState } from 'react'
import { X, ChevronLeft, ChevronRight, Camera } from 'lucide-react'
import { MinimalBanner } from '../../components/common/UI.jsx'
import { useSite } from '../../lib/SiteContext.jsx'
import { useLang } from '../../i18n/LanguageContext.jsx'

export default function Gallery() {
  const { t } = useLang()
  const site = useSite()
  const all = site?.gallery || []

  const cats = useMemo(() => ['All', ...[...new Set(all.map((g) => g.cat).filter(Boolean))]], [all])
  const [cat, setCat] = useState('All')
  const items = cat === 'All' ? all : all.filter((g) => g.cat === cat)

  // Lightbox — index into the *filtered* list; null = closed.
  const [open, setOpen] = useState(null)
  const show = open !== null ? items[open] : null
  const step = (d) => setOpen((i) => (i + d + items.length) % items.length)

  // Keyboard: Esc closes, arrows navigate. Lock body scroll while open.
  useEffect(() => {
    if (open === null) return
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(null)
      if (e.key === 'ArrowRight') step(1)
      if (e.key === 'ArrowLeft') step(-1)
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [open, items.length]) // eslint-disable-line

  return (
    <div className="bg-cream">
      <MinimalBanner title={t('Gallery')} breadcrumb="Home  ›  Gallery" />

      <div className="max-w-7xl mx-auto px-4 py-14">
        <p className="text-center text-black max-w-xl mx-auto -mt-2">
          {t('Glimpses of sevas, festivals and temple life at Sri Shirdi Sai Baba Temple.')}
        </p>

        {/* Category filter chips */}
        <div className="flex flex-wrap justify-center gap-2 mt-8">
          {cats.map((c) => (
            <button key={c} onClick={() => { setCat(c); setOpen(null) }}
              className={`rounded-full px-4 py-1.5 text-[0.8125rem] font-semibold border transition-colors ${
                cat === c ? 'bg-maroon-700 text-cream border-maroon-700'
                          : 'bg-white text-maroon-700 border-gold-300 hover:bg-gold-50'}`}>
              {t(c)}{c !== 'All' && <span className="text-[0.6875rem] opacity-70"> · {all.filter((g) => g.cat === c).length}</span>}
            </button>
          ))}
        </div>

        {/* Photo grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-8">
          {items.map((g, i) => (
            <button key={g.id} onClick={() => setOpen(i)}
              className="card overflow-hidden group text-left focus:outline-none focus:ring-2 focus:ring-gold-400">
              <div className="aspect-square overflow-hidden relative">
                <img src={g.img} alt={g.caption}
                     className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <Camera size={16} className="absolute bottom-2.5 right-2.5 text-white opacity-0 group-hover:opacity-90 transition-opacity" />
              </div>
              <div className="px-3 py-2.5 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-maroon-700 truncate">{t(g.caption)}</p>
                {g.cat && <span className="shrink-0 text-[0.625rem] font-semibold text-gold-600 bg-gold-50 border border-gold-200 rounded-full px-2 py-0.5">{t(g.cat)}</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Lightbox ── */}
      {show && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
             onClick={() => setOpen(null)}>
          <button onClick={() => setOpen(null)} aria-label="Close"
                  className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 text-white grid place-items-center">
            <X size={20} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); step(-1) }} aria-label="Previous"
                  className="absolute left-3 sm:left-6 w-11 h-11 rounded-full bg-white/10 hover:bg-white/25 text-white grid place-items-center">
            <ChevronLeft size={22} />
          </button>
          <figure className="max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
            <img src={show.img} alt={show.caption}
                 className="w-full max-h-[74vh] object-contain rounded-xl shadow-2xl" />
            <figcaption className="text-center mt-4">
              <div className="font-serif text-lg font-bold text-gold-200">{t(show.caption)}</div>
              <div className="text-[0.75rem] text-white/60 mt-0.5">
                {show.cat && <span className="text-gold-300">{t(show.cat)}</span>}
                <span className="mx-2">·</span>{open + 1} / {items.length}
              </div>
            </figcaption>
          </figure>
          <button onClick={(e) => { e.stopPropagation(); step(1) }} aria-label="Next"
                  className="absolute right-3 sm:right-6 w-11 h-11 rounded-full bg-white/10 hover:bg-white/25 text-white grid place-items-center">
            <ChevronRight size={22} />
          </button>
        </div>
      )}
    </div>
  )
}
