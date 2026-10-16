import React, { useCallback, useEffect, useState } from 'react'
import { Tag } from 'lucide-react'
import { PageTitle, Pill, fmtDate } from '../../../components/admin/ui.jsx'
import { StoresAPI, getErrorMessage } from '../../../api/client.js'
import { useAuth } from '../../../auth/AuthContext.jsx'
import { TableStates } from '../../../components/common/states.jsx'
import { Select } from '../../../components/common/Field.jsx'
import { T, tr, personName, useLang } from '../../../i18n/LanguageContext.jsx'
import { TagItemsDrawer, canWriteStores, progressText } from './shared.jsx'

const SOURCE_TONE = { Donation: 'blue', Hundi: 'violet', Manual: 'amber' }

export default function PendingTagging() {
  const { user } = useAuth()
  const { lang } = useLang()
  const canWrite = canWriteStores(user)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const [type, setType] = useState('')
  const [tagging, setTagging] = useState(null)

  const load = useCallback(() => {
    setLoading(true); setLoadErr('')
    return StoresAPI.pending().then((r) => setRows(r.items || []))
      .catch((ex) => { setLoadErr(tr(getErrorMessage(ex, "Couldn't load — check your connection and retry."))); setRows([]) })
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const shown = type ? rows.filter((r) => r.source_type === type) : rows
  return (
    <div>
      <PageTitle title={tr('Pending Tagging')} subtitle={tr('Material donations, hundi valuables and verified manual entries whose pieces do not have IDs yet. Nothing leaves this list until every piece is tagged.')} />
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 flex flex-wrap items-end gap-3 justify-between">
          <div className="w-[12rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Source</T></label>
            <Select className="input" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">{tr('All')}</option><option value="Donation">{tr('Donation')}</option><option value="Hundi">{tr('Hundi')}</option><option value="Manual">{tr('Manual entry')}</option>
            </Select></div>
          <div className="text-[0.8125rem] text-gray-600">{shown.length} {tr('waiting')}</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-700">
              <th className="px-4 py-3 font-semibold">{tr('Source')}</th>
              <th className="px-4 py-3 font-semibold">{tr('Donor')}</th>
              <th className="px-4 py-3 font-semibold">{tr('Item')}</th>
              <th className="px-4 py-3 font-semibold">{tr('Quantity')}</th>
              <th className="px-4 py-3 font-semibold">{tr('Tagged')}</th>
              <th className="px-4 py-3 font-semibold">{tr('Date')}</th>
              <th className="px-4 py-3 font-semibold">{tr('Actions')}</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {shown.map((r) => (
                <tr key={`${r.source_type}-${r.source_id}`} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3"><div className="font-mono text-[0.78rem] text-gray-700">{r.source_ref}</div><Pill tone={SOURCE_TONE[r.source_type]}>{tr(r.source_type === 'Manual' ? 'Manual entry' : r.source_type)}</Pill></td>
                  <td className="px-4 py-3 text-gray-800">{personName({ name: r.donor_name }, lang)}{r.donor_mobile && <div className="text-[0.6875rem] text-gray-400">{r.donor_mobile}</div>}</td>
                  <td className="px-4 py-3 font-semibold text-gray-800">{tr(r.item_name)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{r.quantity != null ? `${Number(r.quantity).toLocaleString('en-IN')} ${tr(r.unit || '')}` : '—'}</td>
                  <td className="px-4 py-3 text-[0.8125rem]"><Pill tone="amber">{progressText(r.progress)}</Pill></td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-600 text-[0.8125rem]">{fmtDate(r.date)}</td>
                  <td className="px-4 py-3">{canWrite
                    ? <button onClick={() => setTagging({ type: r.source_type, id: r.source_id })} className="btn-maroon !py-1.5 !px-3 text-[0.78rem]"><Tag size={14} />{' '}<T>Tag now</T></button>
                    : <span className="text-[0.75rem] text-gray-400"><T>Counter staff tag</T></span>}</td>
                </tr>
              ))}
              {shown.length === 0 && <TableStates colSpan={7} loading={loading} error={loadErr} onRetry={load} empty={tr('Everything is tagged.')} />}
            </tbody>
          </table>
        </div>
      </div>
      {tagging && <TagItemsDrawer source={tagging} onClose={() => { setTagging(null); load() }} />}
    </div>
  )
}
