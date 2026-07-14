import React, { useState } from 'react'
import { MapPin, Phone, Mail, Clock, CheckCircle2 } from 'lucide-react'
import { Flourish, DemoNote, PageBanner } from '../../components/common/UI.jsx'
import { useSite } from '../../lib/SiteContext.jsx'

export default function Contact() {
  const [sent, setSent] = useState(false)
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
      <PageBanner title="Contact Us" breadcrumb="Home  ›  Contact Us" />

      <div className="max-w-6xl mx-auto px-4 py-12 grid md:grid-cols-2 gap-6">
        {/* Details */}
        <div className="space-y-3">
          {items.map((it) => {
            const Icon = it.icon
            return (
              <div key={it.label} className="card p-4 flex items-start gap-3">
                <div className="w-10 h-10 rounded-full border border-gold-300 bg-gold-50 text-maroon-600 grid place-items-center shrink-0"><Icon size={18} /></div>
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-gold-600 mb-0.5">{it.label}</div>
                  <div className="text-sm text-gray-700">{it.value}</div>
                </div>
              </div>
            )
          })}
          <div className="card overflow-hidden">
            <div className="aspect-[16/9] bg-gradient-to-br from-gold-100 to-maroon-200 grid place-items-center text-maroon-600/60 text-sm">
              🗺️ Map placeholder — embed in Phase 1
            </div>
          </div>
        </div>

        {/* Enquiry form */}
        <div>
          {sent ? (
            <div className="card p-8 text-center">
              <CheckCircle2 className="mx-auto text-emerald-500" size={56} />
              <h3 className="font-serif text-2xl font-bold text-maroon-700 mt-3">Message Sent</h3>
              <p className="text-sm text-gray-500 mt-1">We will get back to you shortly. 🙏</p>
              <button className="btn-outline mt-5" onClick={() => setSent(false)}>Send Another</button>
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); setSent(true) }} className="card p-6">
              <div className="font-script text-2xl text-gold-500 leading-none">Get in Touch</div>
              <h3 className="font-serif text-xl font-bold text-maroon-700">Send an Enquiry</h3>
              <Flourish className="justify-start my-2" width="w-10" />
              <div className="mb-4"><DemoNote>Demo — message is not delivered.</DemoNote></div>
              <div className="space-y-4">
                <div><label className="label">Full Name *</label><input required className="input" placeholder="Enter name" /></div>
                <div><label className="label">Mobile *</label><input required className="input" placeholder="10-digit number" /></div>
                <div><label className="label">Email</label><input type="email" className="input" placeholder="Optional" /></div>
                <div><label className="label">Message *</label><textarea required rows={4} className="input" placeholder="How can we help?" /></div>
              </div>
              <button className="btn-primary w-full mt-5">Send Message</button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
