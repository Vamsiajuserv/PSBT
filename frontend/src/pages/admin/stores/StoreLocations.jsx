import React, { useCallback, useEffect, useState } from 'react'
import { Plus, Pencil, X } from 'lucide-react'
import { PageTitle, Pill, num } from '../../../components/admin/ui.jsx'
import { StoresAPI, getErrorMessage } from '../../../api/client.js'
import { TableStates } from '../../../components/common/states.jsx'
import { Select, Combobox } from '../../../components/common/Field.jsx'
import { toast } from '../../../components/common/Dialog.jsx'
import { T, tr } from '../../../i18n/LanguageContext.jsx'

const TYPES = ['Valuables', 'Cloth', 'Utensils', 'Consumables', 'General']
const errText = (ex, fallback) => tr(getErrorMessage(ex, fallback)).replace(/^Value error, /, '')

export default function StoreLocations() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const [drawer, setDrawer] = useState(null)

  const load = useCallback(() => {
    setLoading(true); setLoadErr('')
    return StoresAPI.locations().then((r) => setRows(r.items || []))
      .catch((ex) => { setLoadErr(errText(ex, "Couldn't load — check your connection and retry.")); setRows([]) })
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  async function save(e) {
    e.preventDefault()
    const body = { name: drawer.name.trim(), loc_type: (drawer.loc_type || '').trim() || null, custodian: drawer.custodian.trim() || null, active: drawer.active }
    try {
      if (drawer.id) await StoresAPI.updateLocation(drawer.id, body)
      else await StoresAPI.createLocation(body)
      toast(tr('Saved.')); setDrawer(null); load()
    } catch (ex) { toast(errText(ex, 'Could not save the location.'), 'error') }
  }

  return (
    <div>
      <PageTitle title={tr('Store Locations')} subtitle={tr('Where tagged pieces are kept. Staff pick from this list when tagging or moving a piece.')}
        actions={<button onClick={() => setDrawer({ name: '', loc_type: 'General', custodian: '', active: true })} className="btn-maroon !py-2.5"><Plus size={16} />{' '}<T>Add Location</T></button>} />
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-700">
            <th className="px-4 py-3 font-semibold">{tr('Code')}</th><th className="px-4 py-3 font-semibold">{tr('Location')}</th>
            <th className="px-4 py-3 font-semibold">{tr('Type')}</th><th className="px-4 py-3 font-semibold">{tr('Custodian')}</th>
            <th className="px-4 py-3 font-semibold">{tr('Pieces in store')}</th><th className="px-4 py-3 font-semibold">{tr('Status')}</th>
            <th className="px-4 py-3 font-semibold">{tr('Actions')}</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((l) => (
              <tr key={l.id} className="hover:bg-gray-50/60">
                <td className="px-4 py-3 font-mono text-[0.78rem] text-gray-500">{l.code}</td>
                <td className="px-4 py-3 font-semibold text-gray-800">{tr(l.name)}</td>
                <td className="px-4 py-3 text-gray-700">{tr(l.loc_type || '—')}</td>
                <td className="px-4 py-3 text-gray-700">{l.custodian || '—'}</td>
                <td className="px-4 py-3 tabular-nums">{num(l.pieces)}</td>
                <td className="px-4 py-3"><Pill tone={l.active ? 'green' : 'gray'}>{tr(l.active ? 'Active' : 'Inactive')}</Pill></td>
                <td className="px-4 py-3"><button onClick={() => setDrawer({ ...l, custodian: l.custodian || '', loc_type: l.loc_type || '' })} title={tr('Edit')} aria-label={tr('Edit')} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-700 hover:text-maroon-700"><Pencil size={15} /></button></td>
              </tr>
            ))}
            {rows.length === 0 && <TableStates colSpan={7} loading={loading} error={loadErr} onRetry={load} empty={tr('No locations yet. Add the vault, lockers and store rooms.')} />}
          </tbody>
        </table>
      </div>
      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawer(null)} />
          <form onSubmit={save} className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
              <h3 className="font-serif text-xl font-bold text-maroon-800">{drawer.id ? <T>Edit Location</T> : <T>Add Location</T>}</h3>
              <button type="button" onClick={() => setDrawer(null)} className="text-gray-400 hover:text-maroon-700" aria-label={tr('Close')}><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-4 flex-1">
              <div><label className="label"><T>Location name *</T></label><input required maxLength={120} className="input" value={drawer.name} onChange={(e) => setDrawer({ ...drawer, name: e.target.value })} placeholder={tr('e.g. Store Room A – Rack 2')} /></div>
              <div><label className="label"><T>Type</T></label>
                {/* Pick a common type or type your own (up to 30 characters) */}
                <Combobox className="input" value={drawer.loc_type} options={TYPES.map((t) => ({ value: t, label: tr(t) }))}
                  onChange={(e) => setDrawer({ ...drawer, loc_type: e.target.value.slice(0, 30) })} placeholder={tr('Select or type')} /></div>
              <div><label className="label"><T>Custodian</T></label><input maxLength={120} className="input" value={drawer.custodian} onChange={(e) => setDrawer({ ...drawer, custodian: e.target.value })} placeholder={tr('Person responsible for this location')} /></div>
              <div><label className="label"><T>Status</T></label><Select className="input" value={drawer.active ? 'Active' : 'Inactive'} onChange={(e) => setDrawer({ ...drawer, active: e.target.value === 'Active' })}><option value="Active">{tr('Active')}</option><option value="Inactive">{tr('Inactive')}</option></Select></div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 sticky bottom-0 bg-white">
              <button type="button" onClick={() => setDrawer(null)} className="btn-outline flex-1 justify-center"><T>Cancel</T></button>
              <button className="btn-maroon flex-1 justify-center"><T>Save</T></button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
