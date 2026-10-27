import React, { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Plus, X } from 'lucide-react'
import { PageTitle } from '../../components/admin/ui.jsx'
import { useAuth } from '../../auth/AuthContext.jsx'
import { canAccessKey } from '../../auth/access.js'
import { T, tr } from '../../i18n/LanguageContext.jsx'
import { AnnadanamForm, AnnadanamRegister, AnnadanamReceiptModal, canWriteAnnadanam } from './annadanam/shared.jsx'

// Annadanam is recorded and viewed from Donation Management (its "Annadanam" tab and
// view). This route only redirects there; a login that holds Annadanam without
// Donations access keeps this standalone screen.
export default function Annadanam() {
  const { user } = useAuth()
  const canWrite = canWriteAnnadanam(user)
  const [drawer, setDrawer] = useState(false)
  const [printDoc, setPrintDoc] = useState(null)
  const [listKey, setListKey] = useState(0)

  if (canAccessKey(user, 'donations')) return <Navigate to="/admin/donations?view=annadanam" replace />

  return (
    <div>
      <PageTitle title={tr("Annadanam Management")} subtitle={tr("Record annadanam donations, accept payments and generate receipt for devotees.")}
        actions={canWrite ? <button onClick={() => setDrawer(true)} className="btn-maroon !py-2.5"><Plus size={16} />{' '}<T>Record Annadanam Donation</T></button> : <span className="px-2.5 py-1 rounded-full text-[0.6875rem] font-semibold bg-blue-50 text-blue-700"><T>View only</T></span>} />

      <AnnadanamRegister key={listKey} />

      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawer(false)} />
          <div className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
              <div><h3 className="font-serif text-xl font-bold text-maroon-800"><T>Record Annadanam Donation</T></h3>
                <p className="text-[0.8125rem] text-gray-500 mt-0.5"><T>Select devotee, enter number of persons, record payment and generate receipt.</T></p></div>
              <button type="button" onClick={() => setDrawer(false)} className="text-gray-400 hover:text-maroon-700"><X size={20} /></button>
            </div>
            <AnnadanamForm onCancel={() => setDrawer(false)} onSaved={(created) => { setDrawer(false); setListKey((k) => k + 1); setPrintDoc(created) }} />
          </div>
        </div>
      )}

      <AnnadanamReceiptModal doc={printDoc} onClose={() => setPrintDoc(null)} />
    </div>
  )
}
