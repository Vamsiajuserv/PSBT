import React, { useCallback, useEffect, useState } from 'react'
import { Search, ChevronDown, ChevronRight } from 'lucide-react'
import { PageTitle, Pill, inr, fmtDate } from '../../../components/admin/ui.jsx'
import { StoresAPI, getErrorMessage } from '../../../api/client.js'
import { DateField } from '../../../components/common/Field.jsx'
import ExportButtons from '../../../components/common/ExportButtons.jsx'
import { T, tr, personName, useLang } from '../../../i18n/LanguageContext.jsx'

const ist = (d) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const monthStart = () => { const t = ist(new Date()); return `${t.slice(0, 8)}01` }
const q3 = (n) => (n == null ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 3 }))
const modeLabel = (m) => (m === 'UPI/QR Code' ? 'Online' : m || '')

export default function StockReport() {
  const { lang } = useLang()
  const [range, setRange] = useState({ start: monthStart(), end: ist(new Date()) })
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(null)          // category_id whose detail is shown
  const [detail, setDetail] = useState(null)

  const load = useCallback(() => {
    setLoading(true); setErr(''); setOpen(null); setDetail(null)
    StoresAPI.report(range).then(setData).catch((ex) => { setErr(tr(getErrorMessage(ex, 'Could not load the report.'))); setData(null) })
      .finally(() => setLoading(false))
  }, [range])
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (cid) => {
    if (open === cid) { setOpen(null); setDetail(null); return }
    setOpen(cid); setDetail(null)
    StoresAPI.reportDetail({ category_id: cid, start: data.start, end: data.end }).then(setDetail)
      .catch((ex) => setErr(tr(getErrorMessage(ex, 'Could not load the details.'))))
  }

  const period = `${fmtDate(data?.start)} – ${fmtDate(data?.end)}`
  const exportRows = data ? [
    ...data.tagged.map((r) => ({ ...r, name: `${tr(r.name)} (${tr('pieces')})` })),
    ...data.quantity.map((r) => ({ ...r, name: `${tr(r.name)} (${tr(r.unit || '')})`, sold: '', in_auction: '', in_open_sale: '', sold_open_sale: '', unsold_returned: '', value_in_store: null, realised: null })),
  ] : []
  const exportCols = [
    { key: 'name', label: tr('Item type') }, { key: 'opening', label: tr('Opening') }, { key: 'received', label: tr('Received') },
    { key: 'sold', label: tr('Sold') }, { key: 'sold_open_sale', label: tr('of which Open Sale') }, { key: 'out', label: tr('Used / Written Off') }, { key: 'closing', label: tr('Closing') },
    { key: 'in_auction', label: tr('In Auction') }, { key: 'in_open_sale', label: tr('In Open Sale') }, { key: 'unsold_returned', label: tr('Unsold (returned)') },
    { key: 'value_in_store', label: tr('Value in store (₹)'), type: 'money' }, { key: 'realised', label: tr('Realised (₹)'), type: 'money' },
  ]
  // One table for the details export: a Section column groups the rows
  const detailExport = detail ? [
    ...detail.remaining.map((x) => ({ section: tr('Remaining'), pieces: `${x.in_store} ${tr('in store')} · ${x.in_auction} ${tr('in auction')} · ${x.in_open_sale || 0} ${tr('in Open Sale')}`, ref: x.location, person: '', amount: null, status: x.unsold_before.length ? `${tr('Unsold before')}: ${x.unsold_before.join(', ')}` : '', date: '' })),
    ...detail.sold.map((x) => ({ section: tr('Sold'), pieces: x.tag_id, ref: x.auction, person: x.buyer || '', amount: x.amount, status: x.payment === 'Paid' ? `${tr('Paid')} · ${tr(modeLabel(x.payment_mode))} · ${x.receipt_no}` : tr(x.payment || '—'), date: fmtDate(x.date) })),
    ...detail.received.map((x) => ({ section: tr('Received'), pieces: x.pieces, ref: x.source_ref, person: x.donor || '', amount: null, status: '', date: fmtDate(x.date) })),
    ...detail.written_off.map((x) => ({ section: tr('Written Off'), pieces: x.tag_id, ref: '', person: x.by || '', amount: null, status: x.reason || '', date: fmtDate(x.date) })),
    ...detail.auctions.map((x) => ({ section: tr('Auction'), pieces: `${x.pieces} · ${tr('sold')} ${x.sold ?? '—'} · ${tr('unsold')} ${x.unsold ?? '—'}`, ref: x.code, person: '', amount: x.amount, status: `${tr(x.status)} · ${tr(x.verification)} · ${tr('paid')} ${x.paid}`, date: fmtDate(x.date) })),
  ] : []
  const detailCols = [
    { key: 'section', label: tr('Section') }, { key: 'pieces', label: tr('Pieces') }, { key: 'ref', label: tr('Auction / Receipt / Location') },
    { key: 'person', label: tr('Buyer / Donor / By') }, { key: 'amount', label: tr('Amount (₹)'), type: 'money' },
    { key: 'status', label: tr('Payment / Status / Reason') }, { key: 'date', label: tr('Date') },
  ]

  const th = 'px-3 py-2.5 font-semibold whitespace-nowrap'
  const Head = ({ cols }) => (
    <thead><tr className="bg-gray-50/70 text-left text-[0.6875rem] uppercase tracking-wide text-gray-700">{cols.map((c, i) => <th key={i} className={`${th} ${c[1] ? 'text-right' : ''}`}>{c[0]}</th>)}</tr></thead>
  )
  const Section = ({ title, count, children }) => (
    <div className="bg-white rounded-lg border border-gray-100">
      <div className="px-4 py-2.5 border-b border-gray-100 text-[0.8125rem] font-semibold text-maroon-800">{title}{count != null && <span className="text-gray-500 font-normal"> ({count})</span>}</div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  )
  const Empty = ({ cols, text }) => <tr><td colSpan={cols} className="px-3 py-4 text-center text-gray-400 text-[0.8125rem]">{text}</td></tr>

  return (
    <div>
      <PageTitle title={tr('Stock Report')} subtitle={tr('What came in, what went out and what is left, for any period. Closing = Opening + Received − Sold − Used / Written off.')}
        actions={data && <ExportButtons title={`${tr('Stock Report')} ${period}`} columns={exportCols} rows={exportRows} />} />
      <form onSubmit={(e) => { e.preventDefault(); load() }} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-wrap gap-3 items-end mb-5">
        <div className="w-[10rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>From</T></label>
          <DateField required value={range.start} max={range.end} onChange={(e) => setRange({ ...range, start: e.target.value })} className="input" /></div>
        <div className="w-[10rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>To</T></label>
          <DateField required value={range.end} min={range.start} onChange={(e) => setRange({ ...range, end: e.target.value })} className="input" /></div>
        <button className="btn-maroon !py-2.5"><Search size={14} />{' '}<T>Show report</T></button>
      </form>
      {err && <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-4 py-3">{err}</div>}
      {loading && !data && <div className="text-sm text-gray-500"><T>Loading...</T></div>}
      {data && (
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 flex flex-wrap justify-between gap-2 border-b border-gray-100">
              <div><h3 className="font-serif text-lg font-bold text-maroon-800"><T>Tagged pieces</T></h3>
                <div className="text-[0.75rem] text-gray-500"><T>Click an item type to see the pieces, auctions, buyers and donors behind its numbers.</T></div></div>
              <div className="text-[0.8125rem] text-gray-600">{tr('Value in store')}: <b>{inr(data.totals.value_in_store)}</b> · {tr('Realised')}: <b>{inr(data.totals.realised)}</b></div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <Head cols={[[tr('Item type')], [tr('Opening'), 1], [tr('Received'), 1], [tr('Sold'), 1], [tr('Written Off'), 1], [tr('Closing'), 1],
                  [tr('In Store'), 1], [tr('In Auction'), 1], [tr('In Open Sale'), 1], [tr('Unsold (returned)'), 1], [tr('Value in store (₹)'), 1], [tr('Realised (₹)'), 1]]} />
                <tbody className="divide-y divide-gray-100">
                  {data.tagged.map((r) => (
                    <React.Fragment key={r.category_id}>
                      <tr onClick={() => toggle(r.category_id)} className={`cursor-pointer hover:bg-gray-50/60 ${open === r.category_id ? 'bg-cream/60' : ''}`}>
                        <td className="px-3 py-3 font-semibold text-maroon-800 whitespace-nowrap">{open === r.category_id ? <ChevronDown size={14} className="inline mr-1" /> : <ChevronRight size={14} className="inline mr-1" />}{tr(r.name)}</td>
                        <td className="px-3 py-3 text-right">{r.opening}</td><td className="px-3 py-3 text-right">{r.received}</td>
                        <td className="px-3 py-3 text-right">{r.sold}{r.sold_open_sale > 0 && <div className="text-[0.6875rem] text-violet-700">{r.sold_open_sale} {tr('Open Sale')}</div>}</td><td className="px-3 py-3 text-right">{r.out}</td>
                        <td className="px-3 py-3 text-right font-bold">{r.closing}</td><td className="px-3 py-3 text-right">{r.in_store}</td>
                        <td className="px-3 py-3 text-right">{r.in_auction}</td><td className="px-3 py-3 text-right">{r.in_open_sale}</td><td className="px-3 py-3 text-right">{r.unsold_returned}</td>
                        <td className="px-3 py-3 text-right">{inr(r.value_in_store)}</td><td className="px-3 py-3 text-right">{inr(r.realised)}</td>
                      </tr>
                      {open === r.category_id && (
                        <tr><td colSpan={12} className="bg-cream/40 px-4 py-4">
                          {!detail ? <div className="text-sm text-gray-500"><T>Loading...</T></div> : (
                            <div className="space-y-4">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="text-[0.8125rem] text-gray-700"><b>{tr(detail.category)}</b> · {period} · {tr('Closing')} {r.closing} = {tr('In Store')} {r.in_store} + {tr('In Auction')} {r.in_auction} + {tr('In Open Sale')} {r.in_open_sale}</div>
                                <ExportButtons title={`${tr(detail.category)} — ${tr('Stock details')} ${period}`} columns={detailCols} rows={detailExport} />
                              </div>
                              <Section title={tr('Remaining — where the pieces are')}>
                                <table className="w-full text-[0.8125rem]"><Head cols={[[tr('Location')], [tr('In Store'), 1], [tr('In Auction'), 1], [tr('In Open Sale'), 1], [tr('Came back unsold before')]]} />
                                  <tbody className="divide-y divide-gray-100">{detail.remaining.map((x) => (
                                    <tr key={x.location}><td className="px-3 py-2">{tr(x.location)}</td><td className="px-3 py-2 text-right">{x.in_store}</td><td className="px-3 py-2 text-right">{x.in_auction}</td><td className="px-3 py-2 text-right">{x.in_open_sale || 0}</td>
                                      <td className="px-3 py-2 font-mono text-[0.72rem] text-orange-700">{x.unsold_before.join(', ') || '—'}</td></tr>))}
                                    {!detail.remaining.length && <Empty cols={5} text={tr('Nothing left in stock.')} />}</tbody></table>
                              </Section>
                              <Section title={tr('Sold')} count={detail.sold.length}>
                                <table className="w-full text-[0.8125rem]"><Head cols={[[tr('Piece')], [tr('Auction')], [tr('Buyer')], [tr('Amount'), 1], [tr('Payment')], [tr('Date')]]} />
                                  <tbody className="divide-y divide-gray-100">{detail.sold.map((x) => (
                                    <tr key={x.tag_id}><td className="px-3 py-2 font-mono">{x.tag_id}</td><td className="px-3 py-2 font-mono">{x.auction || '—'}</td>
                                      <td className="px-3 py-2">{x.buyer ? personName({ name: x.buyer }, lang) : '—'}</td><td className="px-3 py-2 text-right">{inr(x.amount)}</td>
                                      <td className="px-3 py-2">{x.payment === 'Paid' ? <><Pill tone="green">{tr('Paid')}</Pill> <span className="text-[0.72rem] text-gray-500">{tr(modeLabel(x.payment_mode))} · {x.receipt_no}</span></> : <Pill tone="amber">{tr(x.payment || 'Pending')}</Pill>}</td>
                                      <td className="px-3 py-2 whitespace-nowrap">{fmtDate(x.date)}</td></tr>))}
                                    {!detail.sold.length && <Empty cols={6} text={tr('Nothing sold in this period.')} />}</tbody></table>
                              </Section>
                              <Section title={tr('Received')} count={detail.received.reduce((s, x) => s + x.count, 0)}>
                                <table className="w-full text-[0.8125rem]"><Head cols={[[tr('Pieces')], [tr('Donor')], [tr('Receipt')], [tr('Tagged on')]]} />
                                  <tbody className="divide-y divide-gray-100">{detail.received.map((x) => (
                                    <tr key={`${x.source_ref}-${x.pieces}`}><td className="px-3 py-2 font-mono">{x.pieces}</td><td className="px-3 py-2">{personName({ name: x.donor }, lang)}</td>
                                      <td className="px-3 py-2 font-mono">{x.source_ref}</td><td className="px-3 py-2 whitespace-nowrap">{fmtDate(x.date)}</td></tr>))}
                                    {!detail.received.length && <Empty cols={4} text={tr('Nothing received in this period.')} />}</tbody></table>
                              </Section>
                              {detail.written_off.length > 0 && (
                                <Section title={tr('Written Off')} count={detail.written_off.length}>
                                  <table className="w-full text-[0.8125rem]"><Head cols={[[tr('Piece')], [tr('Reason')], [tr('By')], [tr('Date')]]} />
                                    <tbody className="divide-y divide-gray-100">{detail.written_off.map((x) => (
                                      <tr key={x.tag_id}><td className="px-3 py-2 font-mono">{x.tag_id}</td><td className="px-3 py-2">{x.reason}</td><td className="px-3 py-2">{x.by}</td><td className="px-3 py-2 whitespace-nowrap">{fmtDate(x.date)}</td></tr>))}</tbody></table>
                                </Section>
                              )}
                              <Section title={tr('Auctions in this period')} count={detail.auctions.length}>
                                <table className="w-full text-[0.8125rem]"><Head cols={[[tr('Auction')], [tr('Date')], [tr('Pieces'), 1], [tr('Sold'), 1], [tr('Unsold → back'), 1], [tr('Amount'), 1], [tr('Paid')], [tr('Status')]]} />
                                  <tbody className="divide-y divide-gray-100">{detail.auctions.map((x) => (
                                    <tr key={x.code}><td className="px-3 py-2 font-mono">{x.code}</td><td className="px-3 py-2 whitespace-nowrap">{fmtDate(x.date)}</td>
                                      <td className="px-3 py-2 text-right">{x.pieces}</td><td className="px-3 py-2 text-right">{x.sold ?? '—'}</td><td className="px-3 py-2 text-right">{x.unsold ?? '—'}</td>
                                      <td className="px-3 py-2 text-right">{inr(x.amount)}</td><td className="px-3 py-2">{x.paid}</td>
                                      <td className="px-3 py-2 text-[0.75rem]">{tr(x.status === 'Completed' ? 'Sold' : x.status)} · {tr(x.verification)}</td></tr>))}
                                    {!detail.auctions.length && <Empty cols={8} text={tr('No auctions of this item in this period.')} />}</tbody></table>
                              </Section>
                            </div>
                          )}
                        </td></tr>
                      )}
                    </React.Fragment>
                  ))}
                  {!data.tagged.length && <Empty cols={12} text={tr('No tagged pieces yet.')} />}
                </tbody>
              </table>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 flex flex-wrap justify-between gap-2 border-b border-gray-100">
              <h3 className="font-serif text-lg font-bold text-maroon-800"><T>Consumables</T></h3>
              <div className="text-[0.75rem] text-gray-500">{tr('Donations are counted from')} {fmtDate(data.consumables_from)}</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <Head cols={[[tr('Item')], [tr('Unit')], [tr('Opening'), 1], [tr('Received'), 1], [tr('Used'), 1], [tr('Closing'), 1]]} />
                <tbody className="divide-y divide-gray-100">
                  {data.quantity.map((r) => (
                    <tr key={r.category_id}><td className="px-3 py-3 font-semibold text-gray-800">{tr(r.name)}</td><td className="px-3 py-3">{tr(r.unit || '—')}</td>
                      <td className="px-3 py-3 text-right">{q3(r.opening)}</td><td className="px-3 py-3 text-right">{q3(r.received)}</td>
                      <td className="px-3 py-3 text-right">{q3(r.out)}</td><td className="px-3 py-3 text-right font-bold">{q3(r.closing)}</td></tr>
                  ))}
                  {!data.quantity.length && <Empty cols={6} text={tr('No consumables received or used yet.')} />}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
