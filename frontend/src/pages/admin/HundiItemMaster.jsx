import React from 'react'
import { Landmark, CheckCircle2, XCircle } from 'lucide-react'
import MasterScreen from '../../components/admin/MasterScreen.jsx'
import { Pill } from '../../components/admin/ui.jsx'
import { HundiItemsAPI } from '../../api/client.js'

const TYPE_TONE = { Cash: 'green', Coins: 'amber', 'Foreign Currency': 'blue', Gold: 'amber', Silver: 'gray', Jewellery: 'violet', Valuables: 'orange' }

export default function HundiItemMaster() {
  return <MasterScreen config={{
    title: 'Hundi Item Master', subtitle: 'Configure item categories counted during hundi collection.',
    api: HundiItemsAPI, entity: 'item', addLabel: 'Add New Item', searchPlaceholder: 'Search by name or code…',
    statCards: [
      { key: 'total', icon: Landmark, color: '#8a1c1c', bg: 'bg-maroon-50', title: 'Total Items', sub: 'All hundi items' },
      { key: 'active', icon: CheckCircle2, color: '#059669', bg: 'bg-emerald-50', title: 'Active', sub: 'In use' },
      { key: 'inactive', icon: XCircle, color: '#dc2626', bg: 'bg-red-50', title: 'Inactive', sub: 'Not in use' },
    ],
    columns: [
      { key: 'code', label: 'Item ID', mono: true },
      { key: 'name', label: 'Item Name', strong: true },
      { key: 'item_type', label: 'Type', render: (r) => (r.item_type ? <Pill tone={TYPE_TONE[r.item_type] || 'gray'}>{r.item_type}</Pill> : '—') },
      { key: 'unit', label: 'Unit / Measurement' },
    ],
    fields: [
      { k: 'name', label: 'Item Name', required: true },
      { k: 'item_type', label: 'Item Type', type: 'select', options: ['Cash', 'Coins', 'Foreign Currency', 'Gold', 'Silver', 'Jewellery', 'Valuables'] },
      { k: 'unit', label: 'Unit / Measurement', type: 'select', options: ['Amount', 'Count', 'Grams'] },
      { k: 'description', label: 'Description', type: 'textarea' },
      { k: 'active', label: 'Status', type: 'active' },
    ],
  }} />
}
