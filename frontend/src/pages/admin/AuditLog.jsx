import React, { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { PageHeader, Table, Badge } from '../../components/common/UI.jsx'
import { AuditAPI } from '../../api/client.js'
import { T, tr } from '../../i18n/LanguageContext.jsx'

const ACTION_TONE = { CREATE: 'green', UPDATE: 'amber', DELETE: 'red', LOGIN: 'blue', DENIED: 'red' }

export default function AuditLog() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  const load = () => { setLoading(true); AuditAPI.list(200).then(setRows).catch(() => setRows([])).finally(() => setLoading(false)) }
  useEffect(() => { load() }, [])

  return (
    <div>
      <PageHeader title={tr("Audit Log")} subtitle="Immutable trail of all staff actions — who, what, when"
        action={<button onClick={load} className="btn-outline"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />{' '}<T>Refresh</T></button>} />
      <Table columns={['Timestamp', 'User', 'Action', 'Entity', 'Detail', 'Status', 'IP']}>
        {rows.map((a) => (
          <tr key={a.id} className="hover:bg-gray-50">
            <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">{a.ts ? a.ts.replace('T', ' ').slice(0, 19) : '—'}</td>
            <td className="px-4 py-3 text-gray-700 text-xs">{a.username || '—'}</td>
            <td className="px-4 py-3"><Badge tone={ACTION_TONE[a.action] || 'gray'}>{a.action}</Badge></td>
            <td className="px-4 py-3 text-gray-600">{a.entity || '—'}</td>
            <td className="px-4 py-3 text-gray-600 text-xs">{a.detail || '—'}</td>
            <td className="px-4 py-3"><Badge tone={a.status === 'SUCCESS' ? 'green' : 'red'}>{a.status}</Badge></td>
            <td className="px-4 py-3 text-gray-400 text-xs font-mono">{a.ip || '—'}</td>
          </tr>
        ))}
        {!loading && rows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400 text-sm"><T>No audit entries yet.</T></td></tr>}
      </Table>
    </div>
  )
}
