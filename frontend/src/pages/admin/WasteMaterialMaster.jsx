import React from 'react'
import { Recycle, CheckCircle2, XCircle } from 'lucide-react'
import MasterScreen from '../../components/admin/MasterScreen.jsx'
import { WasteMaterialsAPI } from '../../api/client.js'
import { tr } from '../../i18n/LanguageContext.jsx'

// Same unit list the Waste Sales form offers — the material's unit pre-fills it.
const UNITS = ['Kilogram (kg)', 'Tonne', 'Piece', 'Bundle']
const money2 = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function WasteMaterialMaster() {
  return <MasterScreen config={{
    title: tr('Waste Material Master'), subtitle: tr('Configure the waste material types sold to vendors, with default unit and rate.'),
    api: WasteMaterialsAPI, entity: 'material', addLabel: tr('Add New Material'), searchPlaceholder: tr('Search by name or code…'),
    statCards: [
      { key: 'total', icon: Recycle, color: '#8a1c1c', bg: 'bg-maroon-50', title: tr('Total Materials'), sub: tr('All waste materials') },
      { key: 'active', icon: CheckCircle2, color: '#059669', bg: 'bg-emerald-50', title: tr('Active'), sub: tr('In use') },
      { key: 'inactive', icon: XCircle, color: '#dc2626', bg: 'bg-red-50', title: tr('Inactive'), sub: tr('Not in use') },
    ],
    sortColumns: [
      { key: 'name', label: tr('Material Name'), type: 'text' },
      { key: 'unit', label: tr('Unit'), type: 'text' },
      { key: 'default_rate', label: tr('Default Rate (₹)'), type: 'number' },
      { key: 'active', label: tr('Status'), type: 'text' },
    ],
    columns: [
      { key: 'code', label: tr('Material ID'), mono: true },
      { key: 'name', label: tr('Material Name'), strong: true, person: true },
      { key: 'unit', label: tr('Unit'), render: (r) => tr(r.unit || '—') },
      { key: 'default_rate', label: tr('Default Rate (₹)'), render: (r) => (r.default_rate ? `₹ ${money2(r.default_rate)}` : '—') },
    ],
    fields: [
      { k: 'name', label: tr('Material Name (English)'), type: 'text', required: true, placeholder: tr('e.g. Coconut Shells') },
      { k: 'name_te', label: tr('Material Name (Telugu)'), type: 'text', placeholder: 'పదార్థం పేరు' },
      { k: 'unit', label: tr('Unit'), type: 'select', options: UNITS, default: 'Kilogram (kg)' },
      { k: 'default_rate', label: tr('Default Rate per Unit (₹)'), type: 'number', prefix: '₹' },
      { k: 'description', label: tr('Description'), type: 'textarea' },
      { k: 'active', label: tr('Status'), type: 'active' },
    ],
  }} />
}
