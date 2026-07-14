import React from 'react'
import { PageBanner } from '../../components/common/UI.jsx'
import { useSite } from '../../lib/SiteContext.jsx'

export default function History() {
  const site = useSite()
  return (
    <div className="bg-cream">
      <PageBanner title="Temple History" breadcrumb="Home  ›  About Temple  ›  History" />

      <div className="max-w-3xl mx-auto px-4 py-14">
        <div className="relative pl-8 border-l-2 border-gold-300 space-y-8">
          {(site?.history || []).map((h) => (
            <div key={h.year} className="relative">
              <span className="absolute -left-[41px] top-0.5 w-5 h-5 rounded-full bg-gold-cta border-4 border-cream" />
              <div className="card p-5">
                <div className="font-display text-xs font-bold uppercase tracking-widest text-gold-600">{h.year}</div>
                <h3 className="font-serif text-lg font-bold text-maroon-700 mt-1">{h.title}</h3>
                <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">{h.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
