import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Search, ArrowLeft } from 'lucide-react'
import { PageTitle, Pill, inr, num, fmtDate, fmtStamp } from '../../../components/admin/ui.jsx'
import { StoresAPI, getErrorMessage } from '../../../api/client.js'
import { T, tr, personName, useLang } from '../../../i18n/LanguageContext.jsx'
import { STATUS_TONE } from './shared.jsx'

export default function ItemHistory() {
  const { tag } = useParams()
  const navigate = useNavigate()
  const { lang } = useLang()
  const [q, setQ] = useState(tag || '')
  const [item, setItem] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setQ(tag || ''); setItem(null); setErr('')
    if (!tag) return
    setLoading(true)
    StoresAPI.item(tag).then(setItem).catch((ex) => setErr(tr(getErrorMessage(ex, 'Not found.')))).finally(() => setLoading(false))
  }, [tag])

  const go = (e) => { e.preventDefault(); const v = q.trim().toUpperCase(); if (v) navigate(`/admin/stores/item/${v}`) }
  const Row = ({ label, value }) => <div><div className="text-[0.6875rem] text-gray-400">{label}</div><div className="text-[0.8125rem] font-medium text-gray-800 break-words">{value ?? '—'}</div></div>

  return (
    <div>
      <PageTitle title={tr('Item History')} subtitle={tr('Type or scan the ID on a sticker to see the full life of that piece.')}
        actions={<button type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/admin/stores/register'))} className="btn-outline !py-2.5"><ArrowLeft size={16} />{' '}<T>Back</T></button>} />
      <form onSubmit={go} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-wrap gap-3 items-end mb-5">
        <div className="flex-1 min-w-[14rem]"><label className="block text-[0.75rem] text-gray-500 mb-1.5"><T>Item ID</T></label>
          <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input autoFocus className="input !pl-9 font-mono uppercase" value={q} onChange={(e) => setQ(e.target.value)} placeholder="PAN-00003" /></div></div>
        <button className="btn-maroon !py-2.5"><Search size={14} />{' '}<T>Show history</T></button>
      </form>
      {loading && <div className="text-sm text-gray-500"><T>Loading...</T></div>}
      {err && <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-4 py-3">{err}</div>}
      {item && (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-5">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div><div className="font-mono text-xl font-bold text-maroon-800">{item.tag_id}</div>
                <div className="font-semibold text-gray-800">{tr(item.description || item.item_name)}</div></div>
              <Pill tone={STATUS_TONE[item.status] || 'gray'}>{tr(item.status)}</Pill>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Row label={tr('Item type')} value={tr(item.item_name)} />
              <Row label={tr('Size / colour')} value={item.details} />
              {item.weight_g != null && <Row label={tr('Weight')} value={`${num(item.weight_g)} g`} />}
              {item.purity && <Row label={tr('Purity')} value={item.purity} />}
              <Row label={tr('Donor')} value={personName({ name: item.donor_name }, lang)} />
              <Row label={tr('Donor mobile')} value={item.donor_mobile} />
              <Row label={tr('Source')} value={`${tr(item.source_type)} · ${item.source_ref}`} />
              <Row label={tr('Received')} value={fmtDate(item.received_on)} />
              <Row label={tr('Location')} value={['In Store', 'In Open Sale'].includes(item.status) ? tr(item.location || '—') : '—'} />
              <Row label={tr('Estimated value')} value={item.est_value != null ? inr(item.est_value) : '—'} />
              {item.sold_amount != null && <Row label={tr('Sold for')} value={inr(item.sold_amount)} />}
              {item.last_auction_code && <Row label={tr('Last auction')} value={item.last_auction_code} />}
              {item.unsold_count > 0 && <Row label={tr('Times unsold')} value={item.unsold_count} />}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-serif text-lg font-bold text-maroon-800 mb-3"><T>History</T></h3>
            <ol className="space-y-3">
              {item.history.map((h, i) => (
                <li key={i} className="border-l-2 border-gold-400 pl-3">
                  <div className="text-[0.8125rem]"><b className="text-gray-800">{tr(h.action)}</b>{h.detail && <span className="text-gray-700"> — {h.detail}</span>}</div>
                  <div className="text-[0.6875rem] text-gray-500">{fmtStamp(h.at)} · {h.by}</div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  )
}
