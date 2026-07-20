import React, { useState } from 'react'
import { Gavel, Clock, X, PhoneCall } from 'lucide-react'
import { SectionTitle, Badge } from '../../components/common/UI.jsx'
import { useSite } from '../../lib/SiteContext.jsx'

const TONE = { Live: 'green', Upcoming: 'blue', Closed: 'gray' }

export default function Auction() {
  const site = useSite()
  const [bidFor, setBidFor] = useState(null)
  // Auction catalogue served by the site context (GET /api/public/site). The
  // backend has no public bid endpoint — bids are placed with the temple.
  const auctions = site?.auctions || []
  const phone = site?.temple?.phone || ''

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <SectionTitle title="🔨 Seva Auctions" subtitle="Bid for the honour of leading special sevas during festivals." />

      <div className="grid md:grid-cols-2 gap-5 mt-8">
        {auctions.map((a) => (
          <div key={a.id} className="card p-6">
            <div className="flex items-start justify-between">
              <div className="w-11 h-11 rounded-xl bg-violet-100 text-violet-600 grid place-items-center"><Gavel size={20} /></div>
              <Badge tone={TONE[a.status]}>{a.status}</Badge>
            </div>
            <h3 className="font-bold text-gray-900 mt-3">{a.item}</h3>
            <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-1"><Clock size={12} /> Closes {a.closes}</div>

            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-[10px] uppercase text-gray-400 font-bold">Base Price</div>
                <div className="font-bold text-gray-700">₹{a.base.toLocaleString('en-IN')}</div>
              </div>
              <div className="bg-violet-50 rounded-lg p-3">
                <div className="text-[10px] uppercase text-violet-400 font-bold">Current Bid</div>
                <div className="font-bold text-violet-700">₹{a.current.toLocaleString('en-IN')}</div>
              </div>
            </div>
            <div className="flex items-center justify-between mt-4">
              <span className="text-xs text-gray-400">{a.bids} bids placed</span>
              <button
                onClick={() => a.status !== 'Closed' && setBidFor(a)}
                disabled={a.status === 'Closed'}
                title={a.status === 'Closed' ? 'This auction has closed' : 'Bids are placed with the temple'}
                className="btn-primary !py-2 text-xs disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {a.status === 'Closed' ? 'Auction Closed' : 'How to Bid'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Online bidding isn't offered on the public site — direct devotees to the temple. */}
      {bidFor && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-maroon-900/50 backdrop-blur-sm p-4" onClick={() => setBidFor(null)}>
          <div className="card w-full max-w-md p-6 relative text-center" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setBidFor(null)} className="absolute right-4 top-4 text-gray-400 hover:text-maroon-700"><X size={20} /></button>
            <div className="w-12 h-12 mx-auto rounded-2xl bg-violet-100 text-violet-600 grid place-items-center mb-3"><Gavel size={24} /></div>
            <h3 className="font-serif text-xl font-bold text-maroon-700">{bidFor.item}</h3>
            <p className="text-sm text-gray-500 mt-2">
              Bids for this auction are placed in person at the temple or over the phone with our office —
              online bidding is not available on the public site.
            </p>
            <div className="mt-4 flex items-center justify-center gap-2 text-maroon-700 font-bold">
              <PhoneCall size={16} className="text-gold-500" /> {phone}
            </div>
            <p className="text-xs text-gray-400 mt-1">9:00 AM – 8:00 PM · Current bid ₹{bidFor.current.toLocaleString('en-IN')}</p>
            <button className="btn-primary mt-5" onClick={() => setBidFor(null)}>Got it</button>
          </div>
        </div>
      )}
    </div>
  )
}
