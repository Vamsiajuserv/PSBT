import React from 'react'
import { Landmark, Info } from 'lucide-react'
import { SectionTitle } from '../../components/common/UI.jsx'
import { T, tr } from '../../i18n/LanguageContext.jsx'

export default function Hundi() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <SectionTitle title={tr("Temple Hundi")} subtitle="Place your offering into the temple hundi." />

      <div className="card p-8 mt-6 text-center">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-blue-100 text-blue-600 grid place-items-center mb-4"><Landmark size={30} /></div>
        <p className="text-sm text-gray-600 leading-relaxed max-w-md mx-auto"><T>The hundi is the temple's traditional offering box. Devotees may place their offerings directly into the hundi within the temple premises. All collections are counted and recorded by temple staff.</T>{' '}</p>
        <div className="mt-6 flex items-start gap-3 text-left bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 max-w-md mx-auto">
          <Info size={18} className="text-blue-500 shrink-0 mt-0.5" />
          <p className="text-sm text-gray-600"><T>To make an offering, please visit the temple in person. For any assistance, contact the temple office.</T>{' '}</p>
        </div>
      </div>
    </div>
  )
}
