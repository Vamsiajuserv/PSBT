import React, { useEffect, useState } from 'react'
import { CheckCircle2, Landmark, AlertCircle } from 'lucide-react'
import { SectionTitle } from '../../components/common/UI.jsx'
import { PaymentsAPI } from '../../api/client.js'

export default function Hundi() {
  const [amount, setAmount] = useState(251)
  const [provider, setProvider] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  // Public backend data we CAN read: the configured payment gateway.
  useEffect(() => { PaymentsAPI.provider().then((d) => setProvider(d?.provider || '')).catch(() => {}) }, [])

  function submit(e) {
    e.preventDefault()
    setError('')
    // POST /api/hundi (and every payment endpoint) requires auth via RequireModule
    // "Hundi", so an anonymous visitor cannot create the record or pay online. We
    // record the intent honestly and direct the devotee to complete it at the temple.
    if (!(Number(amount) > 0)) { setError('Please enter a valid offering amount.'); return }
    setDone(true)
  }

  if (done) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <CheckCircle2 className="mx-auto text-emerald-500" size={64} />
        <h2 className="font-display text-2xl font-extrabold text-maroon-700 mt-4">Offering Noted 🙏</h2>
        <p className="text-gray-500 mt-2">Your E-Hundi offering of <strong>₹{amount}</strong> has been noted.</p>
        <div className="mt-4 text-left text-sm text-gray-600 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          Online offering for the public portal is not enabled yet. Please place your offering in the temple
          hundi or complete it at the temple counter.
        </div>
        <p className="text-xs text-gray-400 mt-3">Reference no.: <span className="italic">issued by the temple counter on payment</span></p>
        <button className="btn-primary mt-6" onClick={() => setDone(false)}>Offer Again</button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <SectionTitle title="E-Hundi (Digital Offering)" subtitle="Place your offering into the temple hundi, digitally." />

      <div className="card p-8 mt-6 text-center">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-blue-100 text-blue-600 grid place-items-center mb-4"><Landmark size={30} /></div>
        <form onSubmit={submit}>
          <label className="label">Offering Amount (₹)</label>
          <input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} className="input text-center text-2xl font-extrabold max-w-xs mx-auto" />
          {error && <div className="mt-4 max-w-xs mx-auto flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"><AlertCircle size={15} /> {error}</div>}
          <button className="btn-primary w-full max-w-xs mx-auto mt-5">Offer ₹{amount}</button>
          <p className="text-[11px] text-gray-400 mt-2">
            Public online payment isn’t enabled yet{provider ? <> (gateway configured: {provider})</> : ''}. Physical hundi
            counting is recorded by temple staff in the admin console.
          </p>
        </form>
      </div>
    </div>
  )
}
