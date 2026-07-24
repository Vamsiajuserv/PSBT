import React, { useState } from 'react'
import {
  MapPin, Phone, Mail, Clock, TrainFront, Landmark, CarFront, Send,
  CheckCircle2, User, MessageSquare,
} from 'lucide-react'
import { Flourish, MinimalBanner } from '../../components/common/UI.jsx'
import { useSite } from '../../lib/SiteContext.jsx'
import { useLang, tr } from '../../i18n/LanguageContext.jsx'
import { Select } from '../../components/common/Field.jsx'

const MAPS_URL = 'https://www.google.com/maps/search/?api=1&query=Shirdi+Sai+Baba+Temple+Dwarakapuri+Colony+Punjagutta+Hyderabad'

// Getting here — real local directions for the Dwarakapuri Colony temple.
const REACH = [
  { icon: TrainFront, title: 'By Metro', desc: 'Punjagutta Metro Station is about 1 km away — a 5-minute auto ride or 12-minute walk.' },
  { icon: Landmark, title: 'Landmark', desc: 'Near Punjagutta Police Station, beside Model House Lane, Dwarakapuri Colony.' },
  { icon: CarFront, title: 'By Car', desc: 'Parking is available at the temple premises. Thursdays and festival days are busiest.' },
]

const SUBJECTS = ['General', 'Pooja Enquiry', 'Donation', 'Annadanam', 'Festival']

export default function Contact() {
  const { t } = useLang()
  const site = useSite()
  const TEMPLE = site?.temple || {}

  const items = [
    { icon: MapPin, label: 'Address', value: TEMPLE.address, href: MAPS_URL },
    { icon: Phone, label: 'Phone', value: TEMPLE.phone, href: TEMPLE.phone ? `tel:${String(TEMPLE.phone).replace(/\s+/g, '')}` : null },
    { icon: Mail, label: 'Email', value: TEMPLE.email, href: TEMPLE.email ? `mailto:${TEMPLE.email}` : null },
    { icon: Clock, label: 'Timings', value: `${TEMPLE.timings || ''} · ${t('Everyday')}` },
  ]

  // ── Inquiry form state ──
  const [form, setForm] = useState({ name: '', mobile: '', email: '', subject: 'General', message: '', website: '' })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/public/contact', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.detail || 'Could not send your message. Please try again.')
      }
      setDone(true)
    } catch (ex) {
      setError(ex.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-cream">
      <MinimalBanner title={t('Contact Us')} breadcrumb="Home  ›  Contact Us" />

      <div className="max-w-6xl mx-auto px-4 py-12 grid md:grid-cols-2 gap-6 items-start">
        {/* ── Left — details + map ── */}
        <div className="space-y-3">
          {items.map((it) => {
            const Icon = it.icon
            const inner = (
              <>
                <div className="w-10 h-10 rounded-full border border-gold-300 bg-gold-50 text-maroon-600 grid place-items-center shrink-0"><Icon size={18} /></div>
                <div className="min-w-0">
                  <div className="text-[0.6875rem] font-bold uppercase tracking-wide text-gold-600 mb-0.5">{t(it.label)}</div>
                  <div className="text-sm text-black">{it.value}</div>
                </div>
              </>
            )
            return it.href ? (
              <a key={it.label} href={it.href} target={it.href.startsWith('http') ? '_blank' : undefined}
                 rel="noopener noreferrer" className="card p-4 flex items-start gap-3 hover:border-gold-400 transition-colors">
                {inner}
              </a>
            ) : (
              <div key={it.label} className="card p-4 flex items-start gap-3">{inner}</div>
            )
          })}

          <div className="card overflow-hidden">
            <iframe
              title={tr("Sri Shirdi Sai Baba Temple location map")}
              src="https://www.google.com/maps?q=Shirdi+Sai+Baba+Temple+Dwarakapuri+Colony+Punjagutta+Hyderabad&z=16&output=embed"
              className="w-full aspect-[16/9] border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
            <a href={MAPS_URL} target="_blank" rel="noopener noreferrer"
               className="flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-maroon-700 bg-gold-50 border-t border-gold-200 hover:bg-gold-100 transition-colors">
              <MapPin size={14} /> {t('View on Google Maps & Get Directions')}
            </a>
          </div>
        </div>

        {/* ── Right — message form ── */}
        <div className="card p-6">
          <div className="font-script text-2xl text-gold-500 leading-none">{t('Get in Touch')}</div>
          <h3 className="font-serif text-xl font-bold text-maroon-700">{t('Send Us a Message')}</h3>
          <Flourish className="justify-start my-2" width="w-10" />

          {done ? (
            <div className="text-center py-10">
              <div className="w-14 h-14 mx-auto rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 grid place-items-center"><CheckCircle2 size={26} /></div>
              <h4 className="font-serif text-lg font-bold text-maroon-700 mt-4">{t('Om Sai Ram — message received!')}</h4>
              <p className="text-sm text-gray-600 mt-1.5 max-w-sm mx-auto">
                {t('Your message has reached the temple office. Our staff will get back to you during temple hours.')}
              </p>
              <button onClick={() => { setDone(false); setForm({ name: '', mobile: '', email: '', subject: 'General', message: '', website: '' }) }}
                      className="btn-outline mt-5 !py-2 text-xs">{t('Send another message')}</button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3.5 mt-1">
              <p className="text-[0.8125rem] text-gray-600">
                {t('For enquiries about poojas, donations, annadanam or festivals — our office replies during temple hours.')}
              </p>
              {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">{error}</div>}
              <div>
                <label className="label">{t('Your Name')} *</label>
                <div className="relative">
                  <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input required minLength={2} className="input !pl-8" placeholder={t('Full name')} value={form.name} onChange={set('name')} />
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="label">{t('Mobile')}</label>
                  <input className="input" inputMode="tel" placeholder={tr("98xxxxxxxx")} value={form.mobile} onChange={set('mobile')} />
                </div>
                <div>
                  <label className="label">{t('Email')}</label>
                  <input className="input" type="email" placeholder={tr("you@example.com")} value={form.email} onChange={set('email')} />
                </div>
              </div>
              <div>
                <label className="label">{t('Subject')}</label>
                <Select value={form.subject} onChange={set('subject')}>
                  {SUBJECTS.map((s) => <option key={s}>{s}</option>)}
                </Select>
              </div>
              <div>
                <label className="label">{t('Message')} *</label>
                <div className="relative">
                  <MessageSquare size={14} className="absolute left-3 top-3 text-gray-400" />
                  <textarea required minLength={5} rows={4} className="input !pl-8 resize-y"
                            placeholder={t('How can we help you?')} value={form.message} onChange={set('message')} />
                </div>
              </div>
              {/* Honeypot — hidden from real users, catches naive bots */}
              <input type="text" value={form.website} onChange={set('website')} tabIndex={-1} autoComplete="off"
                     className="hidden" aria-hidden="true" placeholder={tr("Leave this empty")} />
              <p className="text-[0.6875rem] text-gray-400">{t('Please share a mobile number or email so we can reach you.')}</p>
              <button disabled={busy} className="btn-maroon w-full !py-2.5">
                <Send size={15} /> {busy ? t('Sending…') : t('Send Message')}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* ── Getting here ── */}
      <section className="bg-ivory border-t border-gold-200/60">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <div className="text-center">
            <div className="font-script text-2xl text-gold-500">{t('Visiting the Temple')}</div>
            <h2 className="font-serif text-2xl md:text-3xl font-bold text-maroon-700 mt-1">{t('How to Reach')}</h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-5 mt-8">
            {REACH.map((r) => {
              const Icon = r.icon
              return (
                <div key={r.title} className="card p-6 text-center">
                  <div className="w-12 h-12 mx-auto rounded-full bg-maroon-50 text-maroon-700 grid place-items-center"><Icon size={20} /></div>
                  <div className="font-bold text-maroon-700 mt-3">{t(r.title)}</div>
                  <p className="text-[0.8125rem] text-black leading-relaxed mt-1.5">{t(r.desc)}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>
    </div>
  )
}
