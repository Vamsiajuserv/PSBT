import React from 'react'
import { Badge, MinimalBanner } from '../../components/common/UI.jsx'
import { useSite } from '../../lib/SiteContext.jsx'

export default function Festivals() {
  const site = useSite()
  return (
    <div className="bg-cream">
      <MinimalBanner title="Festivals & Events" breadcrumb="Home  ›  Festivals" />

      <div className="max-w-7xl mx-auto px-4 py-14">
        <p className="text-center text-black max-w-xl mx-auto -mt-2 mb-10">
          Major celebrations observed at the temple through the year, in keeping with Shirdi traditions.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {(site?.festivals || []).map((f) => (
            <div key={f.name} className="card overflow-hidden group">
              <div className="aspect-[16/7] relative overflow-hidden">
                <img src={f.img} alt={f.name} className="w-full h-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
                <span className="absolute bottom-2 left-3 text-3xl drop-shadow-lg">{f.icon}</span>
              </div>
              <div className="p-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-serif text-lg font-bold text-maroon-700">{f.name}</h3>
                  <Badge tone="amber">{f.month}</Badge>
                </div>
                <p className="text-xs text-black font-telugu">{f.nameTe}</p>
                <p className="text-sm text-black mt-2 leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
