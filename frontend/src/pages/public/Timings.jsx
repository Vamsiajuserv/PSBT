import React from 'react'
import { SectionTitle } from '../../components/common/UI.jsx'
import { useSite } from '../../lib/SiteContext.jsx'
import { T, tr } from '../../i18n/LanguageContext.jsx'

export default function Timings() {
  const site = useSite()
  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <SectionTitle title={tr("🕐 Darshan Timings")} subtitle="Open all days. Devotees are welcome." />
      <div className="mt-10 space-y-3">
        {(site?.timings || []).map((t) => (
          <div key={t.session} className="flex items-center justify-between card px-5 py-4">
            <span className="flex items-center gap-3 font-semibold text-gray-800"><span className="text-2xl">{t.icon}</span><T>{t.session}</T></span>
            <span className="text-sm font-bold text-saffron-700 bg-saffron-50 px-3 py-1 rounded-full border border-saffron-200"><T>{t.time}</T></span>
          </div>
        ))}
      </div>
      <div className="bg-saffron-50 border border-saffron-200 rounded-xl p-4 mt-6 text-sm text-saffron-900">
        🛕 <strong><T>Special Note:</T></strong> <T>{site?.temple?.timingsNote || 'On Thursdays and festival days, the temple remains open from 4:30 AM to 10:30 PM. Please call for special seva timings.'}</T>
      </div>
    </div>
  )
}
