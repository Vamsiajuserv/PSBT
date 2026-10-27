import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Send, AlertTriangle, PackageMinus, Undo2, Plus, Search, Receipt as ReceiptIcon } from 'lucide-react'
import { PageTitle, StatTile, KpiGrid, fmtDate, fmtStamp, num } from '../../../components/admin/ui.jsx'
import { StoresAPI, getErrorMessage } from '../../../api/client.js'
import { useAuth } from '../../../auth/AuthContext.jsx'
import { TableStates } from '../../../components/common/states.jsx'
import { T, tr, gramUnit } from '../../../i18n/LanguageContext.jsx'
import { canIssueStock, staffName, useStoresMeta } from './shared.jsx'
import { IssueDrawer, PieceIssueSlip, ReturnDialog, SlipStatus } from './issue.jsx'

const qty = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })

// Issue & Return register: pieces lent out of the store (abhishekam, alankaram, festivals…)
// and their return. Only the Stores Officer and the Administrator issue and take returns;
// other Stores roles see the register.
export default function IssueReturn() {
  const { user } = useAuth()
  const canIssue = canIssueStock(user)
  const { activeLocations } = useStoresMeta()
  const [tab, setTab] = useState('out')
  const [q, setQ] = useState('')
  const [applied, setApplied] = useState('')
  const [rows, setRows] = useState([])
  const [sum, setSum] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const [issuing, setIssuing] = useState(false)
  const [returning, setReturning] = useState(null)
  const [printing, setPrinting] = useState(null)

  const load = useCallback(() => {
    setLoading(true); setLoadErr('')
    Promise.all([StoresAPI.issueSlips({ tab, q: applied }), StoresAPI.issueSummary()])
      .then(([d, s]) => { setRows(d.items || []); setSum(s) })
      .catch((ex) => { setRows([]); setLoadErr(tr(getErrorMessage(ex, 'Could not load the issue register.'))) })
      .finally(() => setLoading(false))
  }, [tab, applied])
  useEffect(() => { load() }, [load])

  const tabBtn = (k, label) => (
    <button onClick={() => setTab(k)} className={`px-4 py-2 rounded-lg text-[0.8125rem] font-semibold ${tab === k ? 'bg-maroon-700 text-cream' : 'text-gray-600 hover:bg-gray-100'}`}>{tr(label)}</button>
  )

  return (
    <div>
      <PageTitle title={tr('Issue & Return')} subtitle={tr('Pieces lent out of the store for poojas, alankaram and festivals — who has them and when they come back.')}
        actions={canIssue && <button onClick={() => setIssuing(true)} className="btn-maroon !py-2.5"><Plus size={16} />{' '}<T>Issue items</T></button>} />

      <KpiGrid>
        <StatTile icon={PackageMinus} color="#8a1c1c" bg="bg-maroon-50" title={tr('Out now')} value={sum ? `${num(sum.out_now)} ${tr('piece(s)')}` : '—'} sub={tr('Issued, not yet back')} />
        <StatTile icon={AlertTriangle} color="#dc2626" bg="bg-red-50" title={tr('Overdue')} value={sum ? num(sum.overdue) : '—'} sub={tr('Past the return date')} />
        <StatTile icon={Send} color="#2563eb" bg="bg-blue-50" title={tr('Issued today')} value={sum ? num(sum.issued_today) : '—'} sub={tr('Pieces')} />
        <StatTile icon={Undo2} color="#059669" bg="bg-emerald-50" title={tr('Returned today')} value={sum ? num(sum.returned_today) : '—'} sub={tr('Pieces')} />
      </KpiGrid>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 flex flex-wrap items-center gap-3 border-b border-gray-100">
          <div className="flex gap-1">{tabBtn('out', 'Out now')}{tabBtn('history', 'History')}</div>
          <div className="relative ml-auto w-full sm:w-80"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input !pl-9" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setApplied(q)}
              placeholder={tr('ISS-0004, SLV-00002, name… (Enter)')} /></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-700">
              {['Slip', 'Pieces', 'Issued to', 'Purpose', 'Issued', 'Return by', 'Status', 'Actions'].map((h) => <th key={h} className="px-3 py-3 font-semibold whitespace-nowrap">{tr(h)}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((s) => (
                <tr key={s.id} className={s.overdue ? 'bg-red-50/60' : 'hover:bg-gray-50/60'}>
                  <td className="px-3 py-3 font-mono text-[0.78rem] font-semibold text-maroon-700 whitespace-nowrap">{s.code}</td>
                  <td className="px-3 py-3"><div className="space-y-0.5">{s.lines.map((l) => (
                    <div key={l.id} className={`text-[0.8125rem] ${l.returned_at ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                      <Link to={`/admin/stores/item/${l.tag_id}`} className="font-mono font-semibold hover:underline">{l.tag_id}</Link>{' '}
                      {tr(l.description || l.item_name)}{l.weight_g != null && <span className="text-gray-500"> · {qty(l.weight_g)} {gramUnit()}</span>}
                      {l.returned_at && l.condition === 'Damaged' && <span className="no-underline text-red-600"> ({tr('Damaged')})</span>}
                    </div>))}</div></td>
                  <td className="px-3 py-3 text-gray-800">{staffName(s.issued_to)}</td>
                  <td className="px-3 py-3 text-gray-700">{tr(s.purpose)}</td>
                  <td className="px-3 py-3 whitespace-nowrap text-[0.8125rem] text-gray-600">{fmtStamp(s.issued_at)}<div className="text-[0.6875rem] text-gray-400">{staffName(s.issued_by)}</div></td>
                  <td className={`px-3 py-3 whitespace-nowrap font-semibold ${s.overdue ? 'text-red-700' : 'text-gray-800'}`}>{fmtDate(s.return_by)}{s.overdue && ' ⚠'}</td>
                  <td className="px-3 py-3"><SlipStatus s={s} />{s.out > 0 && s.out < s.lines.length && <div className="text-[0.6875rem] text-gray-500 mt-0.5">{s.out} {tr('still out')}</div>}</td>
                  <td className="px-3 py-3"><div className="flex items-center gap-1.5">
                    <button onClick={() => setPrinting(s)} title={tr('Issue slip')} aria-label={tr('Issue slip')} className="w-8 h-8 grid place-items-center rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50"><ReceiptIcon size={15} /></button>
                    {canIssue && s.out > 0 && <button onClick={() => setReturning(s)} className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-[0.75rem] font-semibold whitespace-nowrap"><Undo2 size={14} />{tr('Return')}</button>}
                  </div></td>
                </tr>))}
              {rows.length === 0 && <TableStates colSpan={8} loading={loading} error={loadErr} onRetry={load}
                empty={tab === 'out' ? tr('Nothing is out on issue.') : tr('No issue slips yet.')} />}
            </tbody>
          </table>
        </div>
      </div>

      {issuing && <IssueDrawer onClose={() => { setIssuing(false); load() }} onDone={load} />}
      {returning && <ReturnDialog slip={returning} locations={activeLocations} onClose={() => setReturning(null)} onDone={() => { setReturning(null); load() }} />}
      {printing && <PieceIssueSlip slip={printing} onClose={() => setPrinting(null)} />}
    </div>
  )
}
