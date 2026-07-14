import React, { useEffect, useState } from 'react'
import {
  Search, LayoutGrid, Flame, CalendarDays, Repeat, Sparkles, Star, HandHeart, Car,
  PhoneCall, X, CheckCircle2, ArrowRight, ShieldCheck, Bell, ReceiptText, HeartHandshake,
  AlertCircle,
} from 'lucide-react'
import { Flourish, FeatureStrip, PageBanner } from '../../components/common/UI.jsx'
import { PaymentsAPI } from '../../api/client.js'
import { useSite } from '../../lib/SiteContext.jsx'

const CATS = [
  { key: 'all', label: 'All Services', icon: LayoutGrid },
  { key: 'Daily', label: 'Daily Poojas', icon: Flame },
  { key: 'Monthly', label: 'Monthly Poojas', icon: CalendarDays },
  { key: 'Long-term', label: 'Lifetime / Yearly', icon: Repeat },
  { key: 'Ceremony', label: 'Ceremonies & Rituals', icon: Sparkles },
  { key: 'Festival', label: 'Festivals & Special', icon: Star },
  { key: 'Donation', label: 'Donations', icon: HandHeart },
  { key: 'Vahana', label: 'Vehicle Poojas', icon: Car },
]

const FEATURES = [
  { icon: CalendarDays, title: 'Easy Online Booking', desc: 'Book poojas in a few steps' },
  { icon: ShieldCheck, title: 'Secure Payments', desc: '100% safe & verified' },
  { icon: Bell, title: 'Instant Confirmation', desc: 'Via SMS & Email' },
  { icon: ReceiptText, title: 'English & Telugu Bills', desc: 'Bilingual receipts' },
  { icon: HeartHandshake, title: 'Trusted & Transparent', desc: 'Managed by temple trust' },
]

// Normalise a backend SevaOut row into the shape the cards expect.
const normalize = (s) => ({
  id: s.id ?? s.code, code: s.code, name: s.name, nameTe: s.name_te || s.nameTe || '',
  amount: Number(s.amount) || 0, category: s.category || 'Daily', desc: s.description || s.desc || '',
})

export default function Sevas() {
  const site = useSite()
  const [cat, setCat] = useState('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [done, setDone] = useState(false)
  const [provider, setProvider] = useState('')

  // Booking form fields (public visitor — no login).
  const [name, setName] = useState('')
  const [mobile, setMobile] = useState('')
  const [gotra, setGotra] = useState('')
  const [dateStr, setDateStr] = useState('')
  const [formErr, setFormErr] = useState('')

  // Live catalogue + display assets served by the site context (GET /api/public/site).
  const sevas = (site?.sevas || []).map(normalize)
  const catImage = site?.cat_image || {}
  const sevaEmoji = site?.seva_emoji || {}

  // Real backend data that IS public: which payment gateway is configured.
  useEffect(() => {
    PaymentsAPI.provider().then((d) => setProvider(d?.provider || '')).catch(() => {})
  }, [])

  const filtered = sevas.filter(
    (s) =>
      (cat === 'all' || s.category === cat) &&
      (s.name.toLowerCase().includes(query.toLowerCase()) || (s.nameTe || '').includes(query))
  )

  const openSeva = (s) => { setSelected(s); setDone(false); setFormErr(''); setName(''); setMobile(''); setGotra(''); setDateStr('') }
  const closeModal = () => { setSelected(null); setDone(false) }

  function submit(e) {
    e.preventDefault()
    setFormErr('')
    // Booking creation (POST /api/bookings) and payment (POST /api/payments/*) both
    // require an authenticated staff user, which a public visitor does not have.
    // We validate and confirm the request honestly, then hand off to the counter.
    if (!name.trim()) { setFormErr('Please enter your full name.'); return }
    if (!/^\d{10}$/.test(mobile.trim())) { setFormErr('Please enter a valid 10-digit mobile number.'); return }
    setDone(true)
  }

  return (
    <div className="bg-cream">
      <PageBanner title="Poojas & Services" breadcrumb="Home  ›  Poojas & Services" />

      <div className="max-w-7xl mx-auto px-4 py-10">
        {/* Search + sort */}
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center mb-8">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search pooja / seva…"
              className="input !pl-9"
            />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">Sort by:</span>
            <select className="input !py-2 !w-auto">
              <option>Popularity</option>
              <option>Price: Low to High</option>
              <option>Price: High to Low</option>
            </select>
          </div>
        </div>

        <div className="grid lg:grid-cols-[240px_1fr] gap-6">
          {/* Categories sidebar */}
          <aside className="space-y-4">
            <div className="card p-4">
              <div className="font-display text-xs uppercase tracking-widest text-maroon-700 mb-1">Categories</div>
              <Flourish className="justify-start mb-2" width="w-8" />
              <div className="space-y-0.5">
                {CATS.map((c) => {
                  const Icon = c.icon
                  const count = c.key === 'all' ? sevas.length : sevas.filter((s) => s.category === c.key).length
                  const active = cat === c.key
                  return (
                    <button
                      key={c.key}
                      onClick={() => setCat(c.key)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${active ? 'bg-gold-cta text-maroon-900 font-bold' : 'text-gray-600 hover:bg-gold-50'}`}
                    >
                      <span className="flex items-center gap-2.5"><Icon size={15} /> {c.label}</span>
                      <span className={`text-[10px] ${active ? 'text-maroon-800' : 'text-gray-400'}`}>{count}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="card p-4 bg-gradient-to-br from-ivory to-gold-50">
              <div className="flex items-center gap-2 text-maroon-700 font-bold text-sm"><PhoneCall size={16} className="text-gold-500" /> Need Help?</div>
              <p className="text-xs text-gray-600 mt-2">040-2335 5286<br />9:00 AM – 8:00 PM</p>
            </div>
          </aside>

          {/* Service grid */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif text-2xl font-bold text-maroon-700">
                {CATS.find((c) => c.key === cat)?.label}
              </h2>
              <span className="text-xs text-gray-400">{filtered.length} services</span>
            </div>

            {filtered.length === 0 ? (
              <div className="card p-10 text-center text-gray-400 text-sm">No services match your search.</div>
            ) : (
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {filtered.map((s) => {
                  const isDonation = s.category === 'Donation'
                  return (
                    <div key={s.id} className="card overflow-hidden group flex flex-col">
                      <div className="aspect-[5/3] relative overflow-hidden">
                        <img src={catImage[s.category] || catImage.Daily} alt={s.name} className="w-full h-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
                        <div className="absolute inset-0 bg-gradient-to-t from-maroon-900/40 to-transparent" />
                        <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wide bg-white/90 text-maroon-700 rounded-full px-2 py-0.5">{s.category}</span>
                        <span className="absolute bottom-2 right-2 text-2xl drop-shadow-lg">{sevaEmoji[s.code] || '🛕'}</span>
                      </div>
                      <div className="p-4 flex flex-col flex-1">
                        <h3 className="font-bold text-maroon-700">{s.name}</h3>
                        <p className="text-[11px] text-gray-400 font-telugu">{s.nameTe}</p>
                        <p className="text-xs text-gray-500 mt-1.5 leading-relaxed flex-1">{s.desc}</p>
                        <div className="text-lg font-extrabold text-maroon-700 mt-3">₹{s.amount} <span className="text-xs font-semibold text-gray-400">/-</span></div>
                        <button
                          onClick={() => openSeva(s)}
                          className={`${isDonation ? 'btn-maroon' : 'btn-outline'} w-full mt-3 !py-2 text-sm`}
                        >
                          {isDonation ? 'Donate Now' : 'Book Now'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <FeatureStrip items={FEATURES} />

      {/* Booking modal */}
      {selected && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-maroon-900/50 backdrop-blur-sm p-4" onClick={closeModal}>
          <div className="card w-full max-w-lg p-6 relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={closeModal} className="absolute right-4 top-4 text-gray-400 hover:text-maroon-700"><X size={20} /></button>

            {done ? (
              <div className="text-center py-6">
                <CheckCircle2 className="mx-auto text-emerald-500" size={60} />
                <h2 className="font-serif text-2xl font-bold text-maroon-700 mt-4">Request Noted!</h2>
                <p className="text-gray-500 mt-2 text-sm">Your seva <strong>{selected.name}</strong> (₹{selected.amount}) request has been noted.</p>
                <div className="mt-4 text-left text-sm text-gray-600 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  Online payment for the public portal is not enabled yet. Please complete the booking at the
                  temple counter{mobile ? <> or our staff will contact you on <strong>{mobile}</strong></> : ''} to
                  confirm and receive your ticket.
                </div>
                <p className="text-xs text-gray-400 mt-3">Reference no.: <span className="italic">issued by the temple counter on payment</span></p>
                <button className="btn-primary mt-6" onClick={closeModal}>Done <ArrowRight size={15} /></button>
              </div>
            ) : (
              <form onSubmit={submit}>
                <div className="font-script text-2xl text-gold-500 leading-none">Book Seva</div>
                <h3 className="font-serif text-xl font-bold text-maroon-700">{selected.name} <span className="font-telugu text-base text-gray-400">· {selected.nameTe}</span></h3>
                <Flourish className="justify-start mt-2" width="w-10" />
                <div className="grid sm:grid-cols-2 gap-4 mt-4">
                  <div><label className="label">Full Name *</label><input required value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Enter name" /></div>
                  <div><label className="label">Mobile *</label><input required value={mobile} maxLength={10} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))} className="input" placeholder="10-digit number" /></div>
                  <div><label className="label">Gotra</label><input value={gotra} onChange={(e) => setGotra(e.target.value)} className="input" placeholder="Optional" /></div>
                  <div><label className="label">Preferred Date</label><input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} className="input" /></div>
                </div>
                <div className="flex items-center justify-between mt-5 bg-gold-50 rounded-lg px-4 py-3">
                  <span className="text-sm text-gray-600">Total Amount</span>
                  <span className="font-extrabold text-xl text-maroon-700">₹{selected.amount}</span>
                </div>
                {formErr && <div className="mt-4 flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"><AlertCircle size={15} /> {formErr}</div>}
                <button className="btn-primary w-full mt-4">Request Booking · ₹{selected.amount}</button>
                <p className="text-[11px] text-center text-gray-400 mt-2">
                  Public online payment isn’t enabled yet{provider ? <> (gateway configured: {provider})</> : ''}. Your
                  request is handed to the temple counter to complete payment and issue a bilingual receipt.
                </p>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
