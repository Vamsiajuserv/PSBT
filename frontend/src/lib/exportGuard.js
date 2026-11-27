// Download / Print of a list (client, 2026-11-26):
//   1. a pop-up first says exactly what will be taken — period, filters, record count — with a clear
//      warning when no date range is chosen (ALL records from the beginning) or when the list is cut short;
//   2. the file / printout carries the same summary in its heading, plus who took it and when;
//   3. every Download / Print is recorded in the Audit Trail (POST /api/audit/export).
import { confirmDialog } from '../components/common/Dialog.jsx'
import { AuditAPI } from '../api/client.js'
import { tr, stamp } from '../i18n/LanguageContext.jsx'

const fmtDay = (iso) => (iso ? stamp(new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })) : '')
const nowStamp = () => stamp(new Date().toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }))
const filled = (v) => v !== '' && v != null && !(Array.isArray(v) && v.length === 0)

// ["Period: 01 Nov 2026 to 26 Nov 2026", "Pooja: Abhishekam", …] — `filters` is [[label, value], …];
// `noDates` true for a screen whose list has no date at all (e.g. a stock-check sheet).
export function exportParts({ start, end, filters = [], noDates = false }) {
  const parts = []
  if (!noDates) {
    parts.push(start || end
      ? `${tr('Period')}: ${start ? fmtDay(start) : tr('the beginning')} ${tr('to')} ${end ? fmtDay(end) : tr('today')}`
      : `${tr('Period')}: ${tr('All dates')}`)
  }
  for (const [label, value] of filters || []) {
    if (filled(value)) parts.push(`${tr(label)}: ${Array.isArray(value) ? value.map((v) => tr(String(v))).join(', ') : tr(String(value))}`)
  }
  return parts
}

// Shows the pop-up; resolves to the heading line for the file (null when cancelled) and records it.
// format: 'Excel' | 'PDF' | 'Print' | 'CSV'. count: records going into the file. available: how many
// match on the server (when more than count, the file is cut short). scope: e.g. 'this page'.
export async function guardExport({ screen, format, start, end, filters, count = 0, available, scope, noDates = false, user }) {
  const parts = exportParts({ start, end, filters, noDates })
  const allDates = !noDates && !start && !end
  const lines = []
  if (allDates) lines.push(`⚠ ${tr('No date range selected — this is ALL records from the beginning.')}`)
  lines.push(`${tr('You are taking')}:`)
  parts.forEach((p) => lines.push(`  • ${p}`))
  lines.push(`  • ${Number(count).toLocaleString('en-IN')} ${tr('records')}${scope ? ` (${tr(scope)})` : ''}`)
  if (available != null && available > count) {
    lines.push(`⚠ ${tr('Only the first {n} of {m} records are included — choose a date range.')
      .replace('{n}', Number(count).toLocaleString('en-IN')).replace('{m}', Number(available).toLocaleString('en-IN'))}`)
  }
  lines.push('', tr('Cancel to change the date range or filters.'))
  const isPrint = format === 'Print'
  const ok = await confirmDialog({
    title: `${tr(isPrint ? 'Print' : 'Download')} ${format === 'Print' ? '' : format} — ${tr(screen)}`.replace(/\s+/g, ' '),
    message: lines.join('\n'),
    confirmLabel: tr(allDates ? (isPrint ? 'Print anyway' : 'Download anyway') : (isPrint ? 'Print' : 'Download')),
    tone: allDates ? 'danger' : undefined,
  })
  if (!ok) return null
  const summary = parts.join(' · ')
  AuditAPI.recordExport({ screen, format, summary, records: count }).catch(() => {})
  const who = user ? `${user.name || user.username}${user.role ? ` (${tr(user.role)})` : ''}` : ''
  return `${summary}${summary ? ' · ' : ''}${Number(count).toLocaleString('en-IN')} ${tr('records')}${who ? ` · ${tr('Taken by')} ${who}` : ''} · ${nowStamp()}`
}

// The table's column filters as [label, values] pairs for the pop-up / file heading.
export function colFilters(filters, columns = []) {
  return Object.entries(filters || {})
    .filter(([, v]) => Array.isArray(v) && v.length)
    .map(([k, v]) => [columns.find((c) => c.key === k)?.label || k, v])
}
