import React from 'react'
import { Link } from 'react-router-dom'
import {
  Landmark, MapPin, CalendarDays, Clock, Phone, Mail, ArrowRight,
  Sparkles, HandHeart, Flame, Users, HeartHandshake, Gem,
} from 'lucide-react'
import { SectionTitle, Flourish, MinimalBanner } from '../../components/common/UI.jsx'
import { useSite } from '../../lib/SiteContext.jsx'

const PRINCIPLES = [
  { icon: Sparkles, title: 'Faith', desc: 'Strengthening faith in Sai Baba and His teachings.' },
  { icon: HandHeart, title: 'Service', desc: 'Serving devotees and society with compassion.' },
  { icon: Flame, title: 'Devotion', desc: 'Promoting daily worship, bhajans and practices.' },
  { icon: Users, title: 'Community', desc: 'Building a spiritual community based on unity.' },
  { icon: HeartHandshake, title: 'Charity', desc: 'Medical aid, annadanam and social activities.' },
  { icon: Gem, title: 'Values', desc: 'Living by truth, righteousness and humility.' },
]

export default function About() {
  const site = useSite()
  const TEMPLE = site?.temple || {}
  const ABOUT = site?.about || {}
  const IMG = site?.images || {}

  const INFO = [
    { icon: Landmark, label: 'Temple Name', value: TEMPLE.name },
    { icon: MapPin, label: 'Location', value: TEMPLE.address },
    { icon: CalendarDays, label: 'Established', value: String(TEMPLE.established) },
    { icon: Clock, label: 'Timings', value: TEMPLE.timings },
    { icon: Phone, label: 'Phone', value: TEMPLE.phone },
    { icon: Mail, label: 'Email', value: TEMPLE.email },
  ]

  return (
    <div className="bg-cream">
      <MinimalBanner title="About Our Temple" breadcrumb="Home  ›  About Temple" />

      <div className="max-w-7xl mx-auto px-4 py-12 grid lg:grid-cols-[300px_1fr_300px] gap-8">
        {/* Image */}
        <div className="card overflow-hidden h-fit">
          <div className="aspect-[3/4] overflow-hidden"><img src={IMG.about} alt={TEMPLE.name} className="w-full h-full object-cover" loading="lazy" /></div>
          <p className="text-xs font-semibold text-center text-maroon-700 py-3">{TEMPLE.name}</p>
        </div>

        {/* Narrative */}
        <div>
          <div className="font-script text-3xl text-gold-500 leading-none">Sai Sharanam</div>
          <h2 className="font-serif text-3xl font-bold text-maroon-700 mt-1">A Divine Abode of Faith and Service</h2>
          <Flourish className="justify-start mt-3" width="w-16" />
          <div className="text-black leading-relaxed space-y-4 mt-5">
            <p>{ABOUT.intro}</p>
            <p>{ABOUT.mission}</p>
          </div>
          <div className="bg-gold-50 border-l-4 border-gold-400 rounded-r-xl px-5 py-4 mt-6">
            <p className="font-serif italic text-maroon-700">“Have faith and patience, and everything will be possible.”</p>
            <p className="text-xs text-black mt-1">— Shri Sai Baba</p>
          </div>
          <div className="flex flex-wrap gap-3 mt-7">
            <Link to="/history" className="btn-outline">Temple History <ArrowRight size={15} /></Link>
            <Link to="/festivals" className="btn-primary">Festivals & Events <ArrowRight size={15} /></Link>
          </div>
        </div>

        {/* Info card */}
        <div className="card p-5 h-fit">
          <div className="font-display text-xs uppercase tracking-widest text-maroon-700">Temple Information</div>
          <Flourish className="justify-start my-2" width="w-8" />
          <div className="space-y-3.5 mt-3">
            {INFO.map((it) => {
              const Icon = it.icon
              return (
                <div key={it.label} className="flex gap-3">
                  <div className="w-9 h-9 rounded-full border border-gold-300 text-maroon-600 grid place-items-center shrink-0"><Icon size={15} /></div>
                  <div>
                    <div className="text-[0.6875rem] font-bold uppercase tracking-wide text-gold-600">{it.label}</div>
                    <div className="text-sm text-black leading-snug">{it.value}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Guiding principles */}
      <section className="max-w-7xl mx-auto px-4 pb-16">
        <SectionTitle eyebrow="Our Values" title="Our Guiding Principles" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mt-10">
          {PRINCIPLES.map((p) => {
            const Icon = p.icon
            return (
              <div key={p.title} className="card p-5 text-center hover:-translate-y-1 transition-transform">
                <div className="w-12 h-12 mx-auto rounded-full border border-gold-300 bg-gold-50 text-maroon-600 grid place-items-center"><Icon size={20} /></div>
                <h3 className="font-bold text-maroon-700 mt-3">{p.title}</h3>
                <p className="text-[0.6875rem] text-black mt-1.5 leading-relaxed">{p.desc}</p>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
