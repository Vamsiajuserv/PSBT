import React, { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  MessageSquare, Mail, Send, CheckCircle2, XCircle, MinusCircle, Ban, Info,
  BellRing, Smartphone,
} from 'lucide-react'
import { PageTitle, StatTile, Pill, Pager, num, fmtStamp } from '../../components/admin/ui.jsx'
import { NotificationsAPI } from '../../api/client.js'
import { Select } from '../../components/common/Field.jsx'
import { promptDialog } from '../../components/common/Dialog.jsx'
import { T, tr } from '../../i18n/LanguageContext.jsx'

const CH_ICON = { SMS: Smartphone, Email: Mail, WhatsApp: MessageSquare }
const STATUS_TONE = { SENT: 'green', FAILED: 'red', SKIPPED: 'amber', DISABLED: 'gray', QUEUED: 'blue' }
const STATUS_ICON = { SENT: CheckCircle2, FAILED: XCircle, SKIPPED: MinusCircle, DISABLED: Ban }

export default function Notifications() {
  const SIZE = 15
  const [channels, setChannels] = useState([])
  const [stats, setStats] = useState(null)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [channel, setChannel] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState(null)

  const loadConfig = useCallback(() => {
    NotificationsAPI.config().then((c) => setChannels(c.channels)).catch(() => {})
    NotificationsAPI.stats().then(setStats).catch(() => {})
  }, [])
  const loadLogs = useCallback(() => {
    NotificationsAPI.logs({ channel, status, page, size: SIZE })
      .then((d) => { setRows(d.items); setTotal(d.total) }).catch(() => {})
  }, [channel, status, page])

  useEffect(() => { loadConfig() }, [loadConfig])
  useEffect(() => { loadLogs() }, [loadLogs])
  useEffect(() => { setPage(1) }, [channel, status])

  async function toggle(ch, enabled) {
    setBusy(ch)
    try { const r = await NotificationsAPI.updateConfig({ [ch]: enabled }); setChannels(r.channels) }
    finally { setBusy('') }
  }
  async function sendTest(ch) {
    const res = await promptDialog({
      title: `Send a test ${ch}`,
      confirmLabel: 'Send Test',
      fields: [{ k: 'to', label: ch === 'Email' ? 'Email address' : 'Mobile number', required: true }],
    })
    if (!res) return
    const to = res.to.trim()
    setBusy(ch); setMsg(null)
    try {
      const r = await NotificationsAPI.test({ channel: ch, to })
      setMsg({ ch, ...r })
      loadConfig(); loadLogs()
    } catch (ex) { setMsg({ ch, status: 'ERROR', error: ex.detail || 'Failed' }) }
    finally { setBusy('') }
  }

  const anyConfigured = channels.some((c) => c.configured)

  return (
    <div>
      <div className="mb-1 text-[0.75rem] text-gray-400"><Link to="/admin/settings" className="hover:text-maroon-600"><T>Settings</T></Link> › <span className="text-gray-500"><T>Notifications</T></span></div>
      <PageTitle title={tr("Notifications")} subtitle="Configure SMS, Email and WhatsApp channels and review delivery history." />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile icon={CheckCircle2} color="#059669" bg="bg-emerald-50" title={tr("Delivered")} value={stats ? num(stats.SENT) : '—'} sub="Sent successfully" />
        <StatTile icon={XCircle} color="#dc2626" bg="bg-red-50" title={tr("Failed")} value={stats ? num(stats.FAILED) : '—'} sub="Provider errors" />
        <StatTile icon={MinusCircle} color="#d97706" bg="bg-amber-50" title={tr("Skipped")} value={stats ? num(stats.SKIPPED) : '—'} sub="No provider / recipient" />
        <StatTile icon={Ban} color="#6b7280" bg="bg-gray-100" title={tr("Disabled")} value={stats ? num(stats.DISABLED) : '—'} sub="Channel switched off" />
      </div>

      {!anyConfigured && (
        <div className="mb-5 flex items-start gap-2.5 bg-amber-50/70 border border-amber-100 rounded-xl px-5 py-3.5 text-[0.8125rem] text-gray-600">
          <Info size={17} className="text-amber-500 shrink-0 mt-0.5" />
          <span><T>No delivery provider is configured yet, so notifications are</T>{' '}<b><T>recorded but not sent</T></b> (status “Skipped”). Set the provider credentials
            (<code className="text-[0.75rem]"><T>SMTP_*</T></code>, <code className="text-[0.75rem]"><T>SMS_API_*</T></code>, <code className="text-[0.75rem]"><T>WHATSAPP_API_*</T></code>) in the backend environment to enable real delivery — no message is ever marked delivered until a provider accepts it.</span>
        </div>
      )}

      {/* Channels */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {channels.map((c) => {
          const Icon = CH_ICON[c.channel] || BellRing
          return (
            <div key={c.channel} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-maroon-50 grid place-items-center text-maroon-700"><Icon size={20} /></div>
                  <div>
                    <div className="font-serif text-[1rem] font-bold text-maroon-800">{c.channel}</div>
                    <div className="text-[0.71875rem] text-gray-400">Provider: {c.provider === 'none' ? '—' : c.provider}</div>
                  </div>
                </div>
                {/* enable toggle */}
                <button onClick={() => toggle(c.channel, !c.enabled)} disabled={busy === c.channel}
                  className={`relative w-11 h-6 rounded-full transition-colors ${c.enabled ? 'bg-emerald-500' : 'bg-gray-300'} disabled:opacity-50`}>
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${c.enabled ? 'left-[1.375rem]' : 'left-0.5'}`} />
                </button>
              </div>
              <div className="mt-4 flex items-center justify-between">
                {c.configured
                  ? <Pill tone="green"><T>Provider configured</T></Pill>
                  : <Pill tone="amber"><T>Not configured</T></Pill>}
                <button onClick={() => sendTest(c.channel)} disabled={busy === c.channel}
                  className="inline-flex items-center gap-1.5 text-[0.78125rem] font-semibold text-maroon-700 border border-maroon-200 rounded-lg px-3 py-1.5 hover:bg-maroon-50 disabled:opacity-50">
                  <Send size={13} />{' '}<T>Send Test</T>{' '}</button>
              </div>
              {c.enabled ? null : <div className="mt-3 text-[0.71875rem] text-gray-400"><T>Channel disabled — events will be logged as “Disabled”.</T></div>}
            </div>
          )
        })}
      </div>

      {msg && (
        <div className={`mb-5 rounded-lg px-4 py-3 text-[0.8125rem] border ${msg.status === 'SENT' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : msg.status === 'FAILED' || msg.status === 'ERROR' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
          Test {msg.ch}: <b>{msg.status}</b>{msg.error ? ` — ${msg.error}` : ''}
        </div>
      )}

      {/* Delivery log */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100">
          <h3 className="font-serif text-lg font-bold text-maroon-800"><T>Delivery Log</T></h3>
          <div className="flex gap-2">
            <Select value={channel} onChange={(e) => setChannel(e.target.value)} className="input !w-auto !py-2 text-[0.8125rem]">
              <option value="">All Channels</option>{['SMS', 'Email', 'WhatsApp'].map((c) => <option key={c}>{c}</option>)}
            </Select>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="input !w-auto !py-2 text-[0.8125rem]">
              <option value="">All Status</option>{['SENT', 'FAILED', 'SKIPPED', 'DISABLED'].map((c) => <option key={c}>{c}</option>)}
            </Select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[0.84375rem]">
            <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-500">
              {['Time', 'Event', 'Channel', 'Recipient', 'Provider', 'Status', 'Detail'].map((c) => <th key={c} className="px-5 py-3 font-semibold whitespace-nowrap">{c}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => {
                const SI = STATUS_ICON[r.status] || MinusCircle
                return (
                  <tr key={r.id} className="hover:bg-gray-50/60 align-top">
                    <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{fmtStamp(r.ts)}</td>
                    <td className="px-5 py-3 text-gray-700">{r.event_label}</td>
                    <td className="px-5 py-3 text-gray-700">{r.channel}</td>
                    <td className="px-5 py-3 text-gray-600 font-mono text-[0.75rem]">{r.recipient || '—'}</td>
                    <td className="px-5 py-3 text-gray-500">{r.provider === 'none' ? '—' : r.provider}</td>
                    <td className="px-5 py-3"><Pill tone={STATUS_TONE[r.status] || 'gray'}><SI size={12} className="inline -mt-0.5 mr-1" />{r.status}</Pill></td>
                    <td className="px-5 py-3 text-gray-400 text-[0.75rem] max-w-[17.5rem] truncate" title={r.error || r.subject || ''}>{r.error || r.subject || '—'}</td>
                  </tr>
                )
              })}
              {rows.length === 0 && <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-400"><T>No notifications yet.</T></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between">
          <Pager page={page} size={SIZE} total={total} onPage={setPage} unit="notifications" />
        </div>
      </div>
    </div>
  )
}
