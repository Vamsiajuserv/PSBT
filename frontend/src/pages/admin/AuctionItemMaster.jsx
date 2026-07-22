import React from 'react'
import { Gavel, CheckCircle2, XCircle } from 'lucide-react'
import MasterScreen from '../../components/admin/MasterScreen.jsx'
import { Pill, inr } from '../../components/admin/ui.jsx'
import { AuctionItemsAPI } from '../../api/client.js'

const CAT_TONE = { Jewellery: 'amber', Vessels: 'blue', Idols: 'violet', Cloth: 'green', Other: 'gray' }

export default function AuctionItemMaster() {
  return <MasterScreen config={{
    title: 'Auction Item Master', subtitle: 'Configure items available for temple auctions.',
    api: AuctionItemsAPI, entity: 'item', addLabel: 'Add New Item', searchPlaceholder: 'Search by name or code…',
    statCards: [
      { key: 'total', icon: Gavel, color: '#8a1c1c', bg: 'bg-maroon-50', title: 'Total Items', sub: 'All auction items' },
      { key: 'active', icon: CheckCircle2, color: '#059669', bg: 'bg-emerald-50', title: 'Active', sub: 'Available for auction' },
      { key: 'inactive', icon: XCircle, color: '#dc2626', bg: 'bg-red-50', title: 'Inactive', sub: 'Not available' },
    ],
    columns: [
      { key: 'code', label: 'Item ID', mono: true },
      { key: 'name', label: 'Item Name', strong: true },
      { key: 'category', label: 'Category', render: (r) => (r.category ? <Pill tone={CAT_TONE[r.category] || 'gray'}>{r.category}</Pill> : '—') },
      { key: 'base_price', label: 'Base Price (₹)', render: (r) => inr(r.base_price) },
      { key: 'unit', label: 'Unit' },
    ],
    fields: [
      { k: 'name', label: 'Item Name', required: true },
      { k: 'category', label: 'Category', type: 'select', options: ['Jewellery', 'Vessels', 'Idols', 'Cloth', 'Other'] },
      { k: 'base_price', label: 'Base Price (₹)', type: 'number', prefix: '₹' },
      { k: 'unit', label: 'Unit', type: 'select', options: ['Piece', 'Set', 'Kg', 'Gram'] },
      { k: 'description', label: 'Description', type: 'textarea' },
      { k: 'active', label: 'Status', type: 'active' },
    ],
  }} />
}
