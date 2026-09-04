import React from 'react'
import { Users, UserCheck, UserX } from 'lucide-react'
import MasterScreen from '../../components/admin/MasterScreen.jsx'
import { PoojarisAPI } from '../../api/client.js'
import { tr } from '../../i18n/LanguageContext.jsx'

const api = {
  list: (p) => PoojarisAPI.master(p), stats: () => PoojarisAPI.stats(),
  create: (b) => PoojarisAPI.create(b), update: (id, b) => PoojarisAPI.update(id, b), remove: (id) => PoojarisAPI.remove(id),
}

export default function PoojariMaster() {
  return <MasterScreen config={{
    title: 'Poojari Master', subtitle: "Maintain the temple's poojaris and their specializations.",
    api, entity: 'poojari', addLabel: 'Add New Poojari', searchPlaceholder: 'Search by name, code or phone…',
    statCards: [
      { key: 'total', icon: Users, color: '#8a1c1c', bg: 'bg-maroon-50', title: 'Total Poojaris', sub: 'All poojaris' },
      { key: 'active', icon: UserCheck, color: '#059669', bg: 'bg-emerald-50', title: 'Active', sub: 'Currently active' },
      { key: 'inactive', icon: UserX, color: '#dc2626', bg: 'bg-red-50', title: 'Inactive', sub: 'Not active' },
    ],
    sortColumns: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'specialization', label: 'Specialization', type: 'text' },
      { key: 'active', label: 'Status', type: 'text' },
    ],
    columns: [
      { key: 'code', label: tr('Poojari ID'), mono: true },
      { key: 'name', label: tr('Name'), strong: true, person: true },
      { key: 'phone', label: tr('Phone') },
      { key: 'email', label: tr('Email') },
      { key: 'specialization', label: tr('Specialization'),
        // Comma-separated list — translate each entry, not the joined string.
        render: (r) => (r.specialization || '').split(',').map((x) => tr(x.trim())).filter(Boolean).join(', ') || '—' },
    ],
    fields: [
      { k: 'name', label: tr('Full Name'), type: 'name', required: true },
      { k: 'phone', label: tr('Phone'), type: 'phone' },
      { k: 'email', label: tr('Email'), type: 'email' },
      { k: 'specialization', label: tr('Specialization'), type: 'name', placeholder: 'Abhishekam, Homam, Archana, Satyanarayana' },
      { k: 'active', label: tr('Status'), type: 'active' },
    ],
  }} />
}
