import React from 'react'
import { PageBanner } from '../../components/common/UI.jsx'
import { useSite } from '../../lib/SiteContext.jsx'

export default function Gallery() {
  const site = useSite()
  return (
    <div className="bg-cream">
      <PageBanner title="Gallery" breadcrumb="Home  ›  Gallery" />

      <div className="max-w-7xl mx-auto px-4 py-14">
        <p className="text-center text-gray-500 max-w-xl mx-auto -mt-2 mb-10">
          Glimpses of sevas, festivals and temple life at Sri Shirdi Sai Baba Temple.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {(site?.gallery || []).map((g) => (
            <div key={g.id} className="card overflow-hidden group">
              <div className="aspect-square overflow-hidden">
                <img src={g.img} alt={g.caption} className="w-full h-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
              </div>
              <p className="text-xs font-semibold text-maroon-700 px-3 py-2.5">{g.caption}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
