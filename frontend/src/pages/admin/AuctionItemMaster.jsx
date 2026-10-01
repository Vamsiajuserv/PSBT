import React from 'react'
import { Gavel, CheckCircle2, XCircle } from 'lucide-react'
import MasterScreen from '../../components/admin/MasterScreen.jsx'
import { Pill, inr } from '../../components/admin/ui.jsx'
import { AuctionItemsAPI } from '../../api/client.js'
import { tr } from '../../i18n/LanguageContext.jsx'

const CAT_TONE = { Jewellery: 'amber', Vessels: 'blue', Idols: 'violet', Cloth: 'green', Other: 'gray' }

export default function AuctionItemMaster() {
  return <MasterScreen config={{
    title: tr('Auction Item Master'), subtitle: tr('Configure items available for temple auctions.'),
    api: AuctionItemsAPI, entity: 'item', addLabel: tr('Add New Item'), searchPlaceholder: tr('Search by name or code…'),
    statCards: [
      { key: 'total', icon: Gavel, color: '#8a1c1c', bg: 'bg-maroon-50', title: tr('Total Items'), sub: tr('All auction items') },
      { key: 'active', icon: CheckCircle2, color: '#059669', bg: 'bg-emerald-50', title: tr('Active'), sub: tr('Available for auction') },
      { key: 'inactive', icon: XCircle, color: '#dc2626', bg: 'bg-red-50', title: tr('Inactive'), sub: tr('Not available') },
    ],
    sortColumns: [
      { key: 'name', label: tr('Item Name'), type: 'text' },
      { key: 'category', label: tr('Category'), type: 'text' },
      { key: 'base_price', label: tr('Base Price'), type: 'number' },
      { key: 'active', label: tr('Status'), type: 'text' },
    ],
    columns: [
      { key: 'code', label: tr('Item ID'), mono: true },
      { key: 'name', label: tr('Item Name'), strong: true },
      { key: 'category', label: tr('Category'), render: (r) => (r.category ? <Pill tone={CAT_TONE[r.category] || 'gray'}>{tr(r.category)}</Pill> : '—') },
      { key: 'base_price', label: tr('Base Price (₹)'), render: (r) => inr(r.base_price) },
      { key: 'unit', label: tr('Unit') },
    ],
    fields: [
      { k: 'name', label: tr('Item Name'), type: 'name', required: true },
      { k: 'category', label: tr('Category'), type: 'select', options: ['Jewellery', 'Vessels', 'Idols', 'Cloth', 'Other'] },
      { k: 'base_price', label: tr('Base Price (₹)'), type: 'number', prefix: '₹' },
      { k: 'unit', label: tr('Unit'), type: 'select', options: ['Piece', 'Set', 'Kg', 'Gram'] },
      { k: 'description', label: tr('Description'), type: 'textarea' },
      { k: 'active', label: tr('Status'), type: 'active' },
    ],
  }} />
}
