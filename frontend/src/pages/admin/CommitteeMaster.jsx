import React from 'react'
import { Users, UserCog, ShieldCheck } from 'lucide-react'
import MasterScreen from '../../components/admin/MasterScreen.jsx'
import { Pill } from '../../components/admin/ui.jsx'
import { CommitteeAPI } from '../../api/client.js'

const DESIG_TONE = { Chairman: 'maroon', Secretary: 'blue', Treasurer: 'violet', Member: 'gray' }

export default function CommitteeMaster() {
  return <MasterScreen config={{
    title: 'Committee Member Master', subtitle: 'Maintain temple committee members who oversee hundi counting and auctions.',
    api: CommitteeAPI, entity: 'member', addLabel: 'Add New Member', searchPlaceholder: 'Search by name, code or phone…',
    statCards: [
      { key: 'total', icon: Users, color: '#8a1c1c', bg: 'bg-maroon-50', title: 'Total Members', sub: 'All committee members' },
      { key: 'active', icon: ShieldCheck, color: '#059669', bg: 'bg-emerald-50', title: 'Active', sub: 'Currently serving' },
      { key: 'inactive', icon: UserCog, color: '#dc2626', bg: 'bg-red-50', title: 'Inactive', sub: 'Not serving' },
    ],
    columns: [
      { key: 'code', label: 'Member ID', mono: true },
      { key: 'name', label: 'Name', strong: true },
      { key: 'designation', label: 'Designation', render: (r) => (r.designation ? <Pill tone={DESIG_TONE[r.designation] || 'gray'}>{r.designation}</Pill> : '—') },
      { key: 'phone', label: 'Phone' },
      { key: 'email', label: 'Email' },
    ],
    fields: [
      { k: 'name', label: 'Full Name', required: true },
      { k: 'designation', label: 'Designation', type: 'select', options: ['Chairman', 'Secretary', 'Treasurer', 'Member'] },
      { k: 'phone', label: 'Phone' },
      { k: 'email', label: 'Email' },
      { k: 'active', label: 'Status', type: 'active' },
    ],
  }} />
}
