import React, { useEffect, useState } from 'react'
import { CheckCircle2, AlertCircle } from 'lucide-react'
import { SectionTitle } from '../../components/common/UI.jsx'
import { PaymentsAPI } from '../../api/client.js'
import { useSite } from '../../lib/SiteContext.jsx'

const PRESETS = [501, 1116, 2500, 5000, 11000]

export default function Donations() {
  const site = useSite()
  // Donation-fund catalogue served by the site context (GET /api/public/site).
  const funds = site?.funds || []
  const [fundId, setFundId] = useState(null)
  const fund = funds.find((f) => f.id === fundId) || funds[0] || {}
  const [amount, setAmount] = useState(1116)
  const [name, setName] = useState('')
  const [mobile, setMobile] = useState('')
  const [pan, setPan] = useState('')
  const [provider, setProvider] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  // Real backend data that IS public: which payment gateway is configured.
  useEffect(() => { PaymentsAPI.provider().then((d) => setProvider(d?.provider || '')).catch(() => {}) }, [])

  function submit(e) {
    e.preventDefault()
    setError('')
    // Public visitors have no login/JWT, and every write + payment endpoint on the
    // backend requires auth. We therefore cannot create the donation or take an
    // online payment here — record the intent honestly and hand off to the counter.
    if (!name.trim()) { setError('Please enter your full name.'); return }
    if (!/^\d{10}$/.test(mobile.trim())) { setError('Please enter a valid 10-digit mobile number.'); return }
    if (!(Number(amount) > 0)) { setError('Please enter a valid amount.'); return }
    setDone(true)
  }

  if (done) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <CheckCircle2 className="mx-auto text-emerald-500" size={64} />
        <h2 className="font-display text-2xl font-extrabold text-maroon-700 mt-4">Thank You! 🙏</h2>
        <p className="text-gray-500 mt-2">Your donation request of <strong className="text-emerald-600">₹{amount}</strong> to <strong>{fund.name}</strong> has been noted.</p>
        <div className="mt-4 text-left text-sm text-gray-600 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          Online payment for the public portal is not enabled yet. Please complete your contribution at the
          temple counter{mobile ? <> or our staff will contact you on <strong>{mobile}</strong></> : ''} to
          receive an official 80G receipt.
        </div>
        <p className="text-xs text-gray-400 mt-3">Reference no.: <span className="italic">issued by the temple counter on payment</span></p>
        <button className="btn-green mt-6" onClick={() => { setDone(false); setName(''); setMobile(''); setPan('') }}>Make Another Donation</button>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <SectionTitle title="Donations" subtitle="Support the temple. Donations may be eligible for 80G tax exemption." />

      <div className="grid md:grid-cols-2 gap-4 mt-8">
        {funds.map((f) => (
          <button key={f.id} onClick={() => setFundId(f.id)} className={`card p-5 text-left transition-all ${fund.id === f.id ? 'ring-2 ring-emerald-500' : 'hover:shadow-lg'}`}>
            <h3 className="font-bold text-gray-900">{f.name}</h3>
            <p className="text-sm text-gray-500 mt-1">{f.desc}</p>
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="card p-6 mt-6">
        <h3 className="font-bold text-gray-900 mb-4">Donate to {fund.name}</h3>
        <div className="flex flex-wrap gap-2 mb-4">
          {PRESETS.map((p) => (
            <button type="button" key={p} onClick={() => setAmount(p)} className={`px-4 py-2 rounded-lg text-sm font-bold border ${amount === p ? 'bg-emerald-600 text-white border-emerald-600' : 'border-gray-200 text-gray-600 hover:border-emerald-400'}`}>₹{p}</button>
          ))}
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className="label">Amount (₹)</label><input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} className="input" /></div>
          <div><label className="label">Full Name *</label><input required value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Enter name" /></div>
          <div><label className="label">Mobile *</label><input required value={mobile} maxLength={10} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))} className="input" placeholder="10-digit number" /></div>
          <div><label className="label">PAN (for 80G)</label><input value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} className="input" placeholder="Optional" /></div>
        </div>
        {error && <div className="mt-4 flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"><AlertCircle size={15} /> {error}</div>}
        <button className="btn-green w-full mt-5">Donate ₹{amount}</button>
        <p className="text-[11px] text-center text-gray-400 mt-2">
          Public online payment isn’t enabled yet{provider ? <> (gateway configured: {provider})</> : ''}. Your request is
          handed to the temple counter to complete the payment and issue your receipt.
        </p>
      </form>
    </div>
  )
}
