import React, { useEffect, useState } from 'react'
import {
  Database, HardDriveDownload, RotateCcw, Table2, Download, Upload, ShieldCheck,
  CheckCircle2, AlertTriangle, X, Loader2,
} from 'lucide-react'
import { PageTitle, StatTile, Pill, num, fmtStamp } from '../../components/admin/ui.jsx'
import { BackupAPI, getToken } from '../../api/client.js'
import { useAuth } from '../../auth/AuthContext.jsx'

export default function BackupRestore() {
  const { user } = useAuth()
  const isAdmin = ['Admin', 'Administrator'].includes(user?.role)
  const [items, setItems] = useState([])
  const [stats, setStats] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [restore, setRestore] = useState(null)  // { snapshot, validation } or { result }

  const load = () => Promise.all([BackupAPI.list(), BackupAPI.stats().catch(() => null)])
    .then(([d, s]) => { setItems(d.items); if (s) setStats(s) })
  useEffect(() => { if (isAdmin) load() }, [isAdmin])

  async function createBackup() {
    setBusy(true); setMsg('')
    try { const r = await BackupAPI.create(); setMsg(`Backup created — ${r.total_records} records.`); load() }
    catch (ex) { setMsg(ex.detail || 'Backup failed.') } finally { setBusy(false) }
  }

  async function download(b) {
    try {
      const res = await fetch(BackupAPI.download(b.id), { headers: { Authorization: `Bearer ${getToken()}` } })
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = b.filename; a.click(); URL.revokeObjectURL(url)
    } catch { setMsg('Download failed.') }
  }

  async function onFile(e) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setMsg('')
    try {
      const snapshot = JSON.parse(await file.text())
      const validation = await BackupAPI.validate(snapshot)
      setRestore({ snapshot, validation, filename: file.name })
    } catch (ex) { setMsg(ex.detail || 'Invalid backup file — could not read or validate.') }
  }

  async function confirmRestore() {
    setBusy(true)
    try {
      const r = await BackupAPI.restore(restore.snapshot)
      setRestore({ result: r }); load()
    } catch (ex) { setMsg(ex.detail || 'Restore failed.'); setRestore(null) } finally { setBusy(false) }
  }

  if (!isAdmin) return (
    <div>
      <PageTitle title="Backup & Restore" subtitle="Configuration backup and controlled restore." />
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center text-gray-400">
        <ShieldCheck size={36} className="mx-auto mb-3 opacity-40" /> Backup &amp; Restore is restricted to the Administrator role.
      </div>
    </div>
  )

  return (
    <div>
      <PageTitle title="Backup & Restore" subtitle="Back up temple configuration and restore it through a validated, controlled workflow."
        actions={<button onClick={createBackup} disabled={busy} className="btn-maroon !py-2.5 disabled:opacity-50">{busy ? <Loader2 size={16} className="animate-spin" /> : <HardDriveDownload size={16} />} Create Backup</button>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile icon={Database} color="#8a1c1c" bg="bg-maroon-50" title="Total Backups" value={stats ? num(stats.total_backups) : '—'} sub="Snapshots taken" />
        <StatTile icon={RotateCcw} color="#2563eb" bg="bg-blue-50" title="Restores" value={stats ? num(stats.restores) : '—'} sub="Restore operations" />
        <StatTile icon={Table2} color="#7c3aed" bg="bg-violet-50" title="Tables" value={stats ? num(stats.tables) : '—'} sub="Full backup (config + records)" />
        <StatTile icon={ShieldCheck} color="#059669" bg="bg-emerald-50" title="Last Backup" value={stats?.last_backup ? fmtStamp(stats.last_backup).split(', ')[0] : '—'} sub="Most recent" />
      </div>

      {msg && <div className="mb-4 text-[0.8125rem] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-2.5">{msg}</div>}

      {/* Restore panel */}
      <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-5 mb-5">
        <div className="flex items-center gap-2 text-maroon-700 mb-2"><Upload size={18} /><h3 className="font-serif text-lg font-bold">Restore from File</h3></div>
        <p className="text-[0.8125rem] text-gray-500 mb-3">Upload a backup file. It will be validated and summarised before any changes are applied. Restore performs a controlled insert/update — it never deletes existing data.</p>
        <label className="btn-outline cursor-pointer inline-flex"><Upload size={15} /> Upload Backup File<input type="file" accept="application/json,.json" className="hidden" onChange={onFile} /></label>
      </div>

      {/* Backup history */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100"><h3 className="font-serif text-lg font-bold text-maroon-800">Backup History</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-500">
              {['File Name', 'Type', 'Records', 'Size', 'Created By', 'Date', 'Actions'].map((c) => <th key={c} className="px-4 py-3 font-semibold whitespace-nowrap">{c}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3 font-mono text-[0.75rem] text-gray-600">{b.filename}</td>
                  <td className="px-4 py-3"><Pill tone={b.kind === 'Backup' ? 'blue' : 'violet'}>{b.kind}</Pill></td>
                  <td className="px-4 py-3 text-gray-700">{num(b.total_records)}</td>
                  <td className="px-4 py-3 text-gray-600">{b.size_kb ? `${b.size_kb} KB` : '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{b.created_by}</td>
                  <td className="px-4 py-3 text-gray-500 text-[0.8125rem] whitespace-nowrap">{fmtStamp(b.created_at)}</td>
                  <td className="px-4 py-3">
                    {b.kind === 'Backup' ? <button onClick={() => download(b)} title="Download" className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-maroon-600 hover:bg-maroon-50"><Download size={15} /></button> : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">No backups yet. Click “Create Backup” to take a snapshot.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Restore confirmation modal */}
      {restore && (
        <div className="fixed inset-0 bg-black/40 z-50 grid place-items-center p-4" onClick={() => !busy && setRestore(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
            {restore.result ? (
              <div className="p-6 text-center">
                <div className="w-14 h-14 mx-auto rounded-full bg-emerald-50 text-emerald-600 grid place-items-center"><CheckCircle2 size={30} /></div>
                <h3 className="font-serif text-xl font-bold text-maroon-800 mt-3">Restore Complete</h3>
                <p className="text-[0.8125rem] text-gray-500 mt-1">{restore.result.written} rows restored across {restore.result.tables} tables.</p>
                <button onClick={() => setRestore(null)} className="btn-maroon mt-5 mx-auto">Done</button>
              </div>
            ) : (
              <>
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="font-serif text-lg font-bold text-maroon-800">Confirm Restore</h3>
                  <button onClick={() => setRestore(null)} className="text-gray-400 hover:text-maroon-700"><X size={18} /></button>
                </div>
                <div className="px-6 py-5">
                  <div className="text-[0.8125rem] text-gray-600 mb-3">File: <span className="font-mono">{restore.filename}</span> · schema {restore.validation.schema_version || '—'} · <span className="font-semibold">{num(restore.validation.total_records)}</span> records</div>
                  <div className="border border-gray-100 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto">
                    {Object.entries(restore.validation.table_counts).map(([t, c]) => (
                      <div key={t} className="flex items-center justify-between px-3 py-2 text-[0.8125rem]"><span className="text-gray-700">{t}</span><span className="font-semibold text-gray-800">{num(c)}</span></div>
                    ))}
                  </div>
                  {restore.validation.warnings?.length > 0 && (
                    <div className="mt-3 bg-amber-50/70 border border-amber-100 rounded-lg px-3 py-2.5 text-[0.78125rem] text-amber-700 flex items-start gap-2"><AlertTriangle size={15} className="shrink-0 mt-0.5" /><div>{restore.validation.warnings.join(' ')}</div></div>
                  )}
                  {restore.validation.unknown_tables?.length > 0 && <div className="mt-2 text-[0.75rem] text-gray-400">Ignored unknown tables: {restore.validation.unknown_tables.join(', ')}</div>}
                  <div className="bg-blue-50/60 border border-blue-100 rounded-lg px-3 py-2.5 text-[0.78125rem] text-gray-600 mt-3">Restore inserts new records and updates existing ones by their code/key. It will not delete any data.</div>
                </div>
                <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
                  <button onClick={() => setRestore(null)} className="btn-outline">Cancel</button>
                  <button onClick={confirmRestore} disabled={busy} className="btn-maroon disabled:opacity-50">{busy ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />} Confirm Restore</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
