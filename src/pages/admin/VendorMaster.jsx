import React from 'react'
import { Truck, UserCheck, UserX } from 'lucide-react'
import MasterScreen from '../../components/admin/MasterScreen.jsx'
import { VendorsAPI } from '../../api/client.js'
import { tr } from '../../i18n/LanguageContext.jsx'

export default function VendorMaster() {
  return <MasterScreen config={{
    title: 'Vendor Master', subtitle: 'Maintain waste-material buyers / vendors and the materials they handle.',
    api: VendorsAPI, entity: 'vendor', addLabel: 'Add New Vendor', searchPlaceholder: 'Search by name, code or phone…',
    statCards: [
      { key: 'total', icon: Truck, color: '#8a1c1c', bg: 'bg-maroon-50', title: 'Total Vendors', sub: 'All vendors' },
      { key: 'active', icon: UserCheck, color: '#059669', bg: 'bg-emerald-50', title: 'Active', sub: 'Currently active' },
      { key: 'inactive', icon: UserX, color: '#dc2626', bg: 'bg-red-50', title: 'Inactive', sub: 'Not active' },
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
      { k: 'material_types', label: tr('Material Types'), placeholder: 'e.g. Flowers, Paper, Plastic' },
      { k: 'active', label: tr('Status'), type: 'active' },
    ],
  }} />
}
