import React from 'react'
import { MapPin, Phone, Mail, Clock } from 'lucide-react'
import { Flourish, MinimalBanner } from '../../components/common/UI.jsx'
import { useSite } from '../../lib/SiteContext.jsx'

export default function Contact() {
  const site = useSite()
  const TEMPLE = site?.temple || {}

  const items = [
    { icon: MapPin, label: 'Address', value: TEMPLE.address },
    { icon: Phone, label: 'Phone', value: TEMPLE.phone },
    { icon: Mail, label: 'Email', value: TEMPLE.email },
    { icon: Clock, label: 'Timings', value: TEMPLE.timings },
  ]

  return (
    <div className="bg-cream">
      <MinimalBanner title="Contact Us" breadcrumb="Home  ›  Contact Us" />

      <div className="max-w-6xl mx-auto px-4 py-12 grid md:grid-cols-2 gap-6">
        {/* Details */}
        <div className="space-y-3">
          {items.map((it) => {
            const Icon = it.icon
            return (
              <div key={it.label} className="card p-4 flex items-start gap-3">
                <div className="w-10 h-10 rounded-full border border-gold-300 bg-gold-50 text-maroon-600 grid place-items-center shrink-0"><Icon size={18} /></div>
                <div>
                  <div className="text-[0.6875rem] font-bold uppercase tracking-wide text-gold-600 mb-0.5">{it.label}</div>
                  <div className="text-sm text-black">{it.value}</div>
                </div>
              </div>
            )
          })}
          <div className="card overflow-hidden">
            <iframe
              title="Sri Shirdi Sai Baba Temple location map"
              src="https://www.google.com/maps?q=Shirdi+Sai+Baba+Temple+Dwarakapuri+Colony+Punjagutta+Hyderabad&z=16&output=embed"
              className="w-full aspect-[16/9] border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
            <a
              href="https://www.google.com/maps/search/?api=1&query=Shirdi+Sai+Baba+Temple+Dwarakapuri+Colony+Punjagutta+Hyderabad"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-maroon-700 bg-gold-50 border-t border-gold-200 hover:bg-gold-100 transition-colors"
            >
              <MapPin size={14} /> View on Google Maps &amp; Get Directions
            </a>
          </div>
        </div>

        {/* Get in touch — static contact info */}
        <div>
          <div className="card p-6">
            <div className="font-script text-2xl text-gold-500 leading-none">Get in Touch</div>
            <h3 className="font-serif text-xl font-bold text-maroon-700">We'd Love to Hear From You</h3>
            <Flourish className="justify-start my-2" width="w-10" />
            <p className="text-sm text-black leading-relaxed">
              For enquiries about poojas, sevas, donations, or temple events, please reach out to us directly.
              Our office is happy to assist you during temple hours.
            </p>
            <div className="mt-5 space-y-3">
              {TEMPLE.phone && (
                <a href={`tel:${String(TEMPLE.phone).replace(/\s+/g, '')}`} className="flex items-center gap-3 text-sm text-black hover:text-maroon-700">
                  <span className="w-9 h-9 rounded-full border border-gold-300 bg-gold-50 text-maroon-600 grid place-items-center shrink-0"><Phone size={16} /></span>
                  {TEMPLE.phone}
                </a>
              )}
              {TEMPLE.email && (
                <a href={`mailto:${TEMPLE.email}`} className="flex items-center gap-3 text-sm text-black hover:text-maroon-700">
                  <span className="w-9 h-9 rounded-full border border-gold-300 bg-gold-50 text-maroon-600 grid place-items-center shrink-0"><Mail size={16} /></span>
                  {TEMPLE.email}
                </a>
              )}
              {TEMPLE.address && (
                <div className="flex items-start gap-3 text-sm text-black">
                  <span className="w-9 h-9 rounded-full border border-gold-300 bg-gold-50 text-maroon-600 grid place-items-center shrink-0"><MapPin size={16} /></span>
                  {TEMPLE.address}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
