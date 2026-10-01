import React from 'react'
import { Truck, UserCheck, UserX } from 'lucide-react'
import MasterScreen from '../../components/admin/MasterScreen.jsx'
import { VendorsAPI } from '../../api/client.js'
import { tr } from '../../i18n/LanguageContext.jsx'

export default function VendorMaster() {
  return <MasterScreen config={{
    title: tr('Vendor Master'), subtitle: tr('Maintain waste-material buyers / vendors and the materials they handle.'),
    api: VendorsAPI, entity: 'vendor', addLabel: tr('Add New Vendor'), searchPlaceholder: tr('Search by name, code or phone…'),
    statCards: [
      { key: 'total', icon: Truck, color: '#8a1c1c', bg: 'bg-maroon-50', title: tr('Total Vendors'), sub: tr('All vendors') },
      { key: 'active', icon: UserCheck, color: '#059669', bg: 'bg-emerald-50', title: tr('Active'), sub: tr('Currently active') },
      { key: 'inactive', icon: UserX, color: '#dc2626', bg: 'bg-red-50', title: tr('Inactive'), sub: tr('Not active') },
    ],
    sortColumns: [
      { key: 'name', label: tr('Name'), type: 'text' },
      { key: 'material_types', label: tr('Material Types'), type: 'text' },
      { key: 'active', label: tr('Status'), type: 'text' },
    ],
    columns: [
      { key: 'code', label: tr('Vendor ID'), mono: true },
      { key: 'name', label: tr('Name'), strong: true },
      { key: 'phone', label: tr('Phone') },
      // A comma-separated list — translate each material, not the whole string.
      { key: 'material_types', label: tr('Material Types'),
        render: (r) => (r.material_types || '').split(',').map((x) => tr(x.trim())).filter(Boolean).join(', ') || '—' },
    ],
    fields: [
      { k: 'name', label: tr('Vendor Name'), type: 'name', required: true },
      { k: 'phone', label: tr('Phone'), type: 'phone' },
      { k: 'material_types', label: tr('Material Types'), type: 'name', placeholder: tr('e.g. Flowers, Paper, Plastic') },
      { k: 'active', label: tr('Status'), type: 'active' },
    ],
  }} />
}
