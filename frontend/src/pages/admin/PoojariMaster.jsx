import React from 'react'
import { Users, UserCheck, UserX } from 'lucide-react'
import MasterScreen from '../../components/admin/MasterScreen.jsx'
import { PoojarisAPI } from '../../api/client.js'

const api = {
  list: (p) => PoojarisAPI.master(p), stats: () => PoojarisAPI.stats(),
  create: (b) => PoojarisAPI.create(b), update: (id, b) => PoojarisAPI.update(id, b), remove: (id) => PoojarisAPI.remove(id),
}

export default function PoojariMaster() {
  return <MasterScreen config={{
    title: 'Poojari Master', subtitle: 'Maintain the temple’s poojaris and their specializations.',
    api, entity: 'poojari', addLabel: 'Add New Poojari', searchPlaceholder: 'Search by name, code or phone…',
    statCards: [
      { key: 'total', icon: Users, color: '#8a1c1c', bg: 'bg-maroon-50', title: 'Total Poojaris', sub: 'All poojaris' },
      { key: 'active', icon: UserCheck, color: '#059669', bg: 'bg-emerald-50', title: 'Active', sub: 'Currently active' },
      { key: 'inactive', icon: UserX, color: '#dc2626', bg: 'bg-red-50', title: 'Inactive', sub: 'Not active' },
    ],
    columns: [
      { key: 'code', label: 'Poojari ID', mono: true },
      { key: 'name', label: 'Name', strong: true },
      { key: 'phone', label: 'Phone' },
      { key: 'email', label: 'Email' },
      { key: 'specialization', label: 'Specialization' },
    ],
    fields: [
      { k: 'name', label: 'Full Name', required: true },
      { k: 'phone', label: 'Phone' },
      { k: 'email', label: 'Email' },
      { k: 'specialization', label: 'Specialization', placeholder: 'e.g. Abhishekam, Homam' },
      { k: 'active', label: 'Status', type: 'active' },
    ],
  }} />
}
