import React, { useEffect, useState } from 'react'
import { CheckCircle2, AlertCircle } from 'lucide-react'
import { SectionTitle } from '../../components/common/UI.jsx'
import { PaymentsAPI } from '../../api/client.js'

// Per-plate rate — there is no public GET for the annadanam rate (annadanam
// endpoints require auth), so this display rate stays static.
const PER_PLATE = 50

export default function Annadanam() {
  const [plates, setPlates] = useState(100)
  const [name, setName] = useState('')
  const [mobile, setMobile] = useState('')
  const [dateStr, setDateStr] = useState('')
  const [occasion, setOccasion] = useState('')
  const [provider, setProvider] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const amount = plates * PER_PLATE

  useEffect(() => { PaymentsAPI.provider().then((d) => setProvider(d?.provider || '')).catch(() => {}) }, [])

  function submit(e) {
    e.preventDefault()
    setError('')
    // POST /api/annadanam requires auth (RequireModule "Annadanam"), and so does
    // every payment endpoint — an anonymous visitor cannot create the sponsorship
    // or pay online. Capture the request honestly and hand off to the counter.
    if (!name.trim()) { setError('Please enter your full name.'); return }
    if (!/^\d{10}$/.test(mobile.trim())) { setError('Please enter a valid 10-digit mobile number.'); return }
    setDone(true)
  }

  if (done) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <CheckCircle2 className="mx-auto text-emerald-500" size={64} />
        <h2 className="font-display text-2xl font-extrabold text-maroon-700 mt-4">Annadanam Request Noted 🙏</h2>
        <p className="text-gray-500 mt-2">Your offering of <strong>{plates} plates</strong> (₹{amount.toLocaleString('en-IN')}) has been noted. May Baba bless you abundantly.</p>
        <div className="mt-4 text-left text-sm text-gray-600 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          Online payment for the public portal is not enabled yet. Please complete your sponsorship at the
          temple counter{mobile ? <> or our staff will contact you on <strong>{mobile}</strong></> : ''} to confirm.
        </div>
        <p className="text-xs text-gray-400 mt-3">Reference no.: <span className="italic">issued by the temple counter on payment</span></p>
        <button className="btn-green mt-6" onClick={() => { setDone(false); setName(''); setMobile(''); setDateStr(''); setOccasion('') }}>Make Another Offering</button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <SectionTitle title="🍲 Annadanam Seva" subtitle="Sacred food donation — feed devotees, serve humanity." />

      <form onSubmit={submit} className="card p-6 mt-6">
        <label className="label">Number of plates</label>
        <div className="flex items-center gap-3 mb-4">
          <input type="range" min="10" max="1000" step="10" value={plates} onChange={(e) => setPlates(+e.target.value)} className="flex-1 accent-saffron-600" />
          <span className="font-extrabold text-maroon-700 w-20 text-right">{plates}</span>
        </div>
        <div className="bg-cream rounded-xl p-4 text-center mb-4 border border-saffron-100">
          <div className="text-xs text-gray-500">Total Contribution <span className="text-gray-400">(₹{PER_PLATE}/plate)</span></div>
          <div className="text-3xl font-extrabold text-saffron-700">₹{amount.toLocaleString('en-IN')}</div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className="label">Full Name *</label><input required value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Enter name" /></div>
          <div><label className="label">Mobile *</label><input required value={mobile} maxLength={10} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))} className="input" placeholder="10-digit number" /></div>
          <div><label className="label">Date</label><input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} className="input" /></div>
          <div><label className="label">Occasion</label><input value={occasion} onChange={(e) => setOccasion(e.target.value)} className="input" placeholder="Birthday, memory of..." /></div>
        </div>
        {error && <div className="mt-4 flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"><AlertCircle size={15} /> {error}</div>}
        <button className="btn-green w-full mt-5">Offer Annadanam ₹{amount.toLocaleString('en-IN')}</button>
        <p className="text-[11px] text-center text-gray-400 mt-2">
          Public online payment isn’t enabled yet{provider ? <> (gateway configured: {provider})</> : ''}. Your request is
          handed to the temple counter to complete the payment.
        </p>
      </form>
    </div>
  )
}
