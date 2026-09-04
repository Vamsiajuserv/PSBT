import React, { useEffect, useState } from 'react'
import { X, ChevronLeft, ChevronRight, Camera } from 'lucide-react'
import { MinimalBanner } from '../../components/common/UI.jsx'
import { useSite } from '../../lib/SiteContext.jsx'
import { useLang } from '../../i18n/LanguageContext.jsx'

export default function Gallery() {
  const { t } = useLang()
  const site = useSite()
  const items = site?.gallery || []

  // Lightbox — index into the photo list; null = closed.
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

        {/* Photo grid — clean tiles, click to open the lightbox. */}
        {items.length === 0 ? (
          <div className="mt-12 mb-8 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-gold-50 border border-gold-200 grid place-items-center text-gold-500"><Camera size={26} /></div>
            <p className="mt-4 text-maroon-700 font-semibold">{t('Photo gallery coming soon')}</p>
            <p className="mt-1 text-sm text-black/70">{t('Our temple photographs will be added here shortly.')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-10">
            {items.map((g, i) => (
              <button key={g.id} onClick={() => setOpen(i)}
                className="group relative aspect-square overflow-hidden rounded-xl border border-gold-200 shadow-card focus:outline-none focus:ring-2 focus:ring-gold-400">
                <img src={g.img} alt=""
                     className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <Camera size={16} className="absolute bottom-2.5 right-2.5 text-white opacity-0 group-hover:opacity-90 transition-opacity" />
              </button>
            ))}
          </div>
        )}
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
            <img src={show.img} alt=""
                 className="w-full max-h-[80vh] object-contain rounded-xl shadow-2xl" />
            <figcaption className="text-center mt-3 text-[0.75rem] text-white/60">{open + 1} / {items.length}</figcaption>
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
