import React, { useState } from 'react'
import { Info } from 'lucide-react'
import { SectionTitle } from '../../components/common/UI.jsx'
import { useSite } from '../../lib/SiteContext.jsx'

export default function Donations() {
  const site = useSite()
  // Donation-fund catalogue served by the site context (GET /api/public/site).
  const funds = site?.funds || []
  const [fundId, setFundId] = useState(null)
  const fund = funds.find((f) => f.id === fundId) || funds[0] || {}

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

      <div className="card p-6 mt-6 flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 grid place-items-center shrink-0"><Info size={20} /></div>
        <div>
          <h3 className="font-bold text-gray-900">How to Donate</h3>
          <p className="text-sm text-gray-600 mt-1 leading-relaxed">
            To make a contribution and receive an official 80G receipt, please visit the temple counter or
            call the temple office. Our staff will be happy to assist you.
          </p>
        </div>
      </div>
    </div>
  )
}
