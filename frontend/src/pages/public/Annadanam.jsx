import React from 'react'
import { Info } from 'lucide-react'
import { SectionTitle } from '../../components/common/UI.jsx'

// Per-plate rate — published for information only. Annadanam sponsorships are
// arranged at the temple counter.
const PER_PLATE = 50

export default function Annadanam() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <SectionTitle title="🍲 Annadanam Seva" subtitle="Sacred food donation — feed devotees, serve humanity." />

      <div className="card p-6 mt-6">
        <p className="text-sm text-gray-600 leading-relaxed">
          Annadanam is the sacred offering of food to devotees. Sponsoring annadanam is considered one of the
          most meritorious sevas. Devotees may sponsor annadanam on birthdays, anniversaries, or in memory of
          loved ones.
        </p>

        <div className="bg-cream rounded-xl p-4 text-center my-5 border border-saffron-100">
          <div className="text-xs text-gray-500">Published Rate</div>
          <div className="text-3xl font-extrabold text-saffron-700">₹{PER_PLATE} <span className="text-base font-semibold text-gray-400">/ plate</span></div>
        </div>

        <div className="flex items-start gap-3 bg-saffron-50 border border-saffron-100 rounded-xl px-4 py-3">
          <Info size={18} className="text-saffron-600 shrink-0 mt-0.5" />
          <p className="text-sm text-gray-600">
            To sponsor annadanam, please visit the temple counter or contact the temple office. Our staff will
            help you arrange the date and number of plates.
          </p>
        </div>
      </div>
    </div>
  )
}
