import React from 'react'
import { Truck, UserCheck, UserX } from 'lucide-react'
import MasterScreen from '../../components/admin/MasterScreen.jsx'
import { VendorsAPI } from '../../api/client.js'

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
      { key: 'code', label: 'Vendor ID', mono: true },
      { key: 'name', label: 'Name', strong: true },
      { key: 'phone', label: 'Phone' },
      { key: 'material_types', label: 'Material Types' },
    ],
    fields: [
      { k: 'name', label: 'Vendor Name', required: true },
      { k: 'phone', label: 'Phone' },
      { k: 'material_types', label: 'Material Types', placeholder: 'e.g. Flowers, Paper, Plastic' },
      { k: 'active', label: 'Status', type: 'active' },
    ],
  }} />
}
