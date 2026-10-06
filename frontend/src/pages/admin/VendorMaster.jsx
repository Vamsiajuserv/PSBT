import React, { useEffect, useMemo, useState } from 'react'
import { Truck, UserCheck, UserX } from 'lucide-react'
import MasterScreen from '../../components/admin/MasterScreen.jsx'
import { VendorsAPI, WasteMaterialsAPI } from '../../api/client.js'
import { tr, useLang } from '../../i18n/LanguageContext.jsx'
import { toast } from '../../components/common/Dialog.jsx'

// material_types is stored as a comma-separated string; the form edits it as an array.
const split = (s) => (s || '').split(',').map((x) => x.trim()).filter(Boolean)

export default function VendorMaster() {
  const { lang } = useLang()
  const [materials, setMaterials] = useState([])   // Waste Material Master
  const [legacy, setLegacy] = useState([])         // vendor values not in the master (old free text)

  useEffect(() => {
    WasteMaterialsAPI.list()
      .then((r) => setMaterials(Array.isArray(r) ? r : (r.items || [])))
      .catch(() => toast(tr('Failed to load waste materials'), 'error'))
  }, [])

  const byName = useMemo(() => new Map(materials.map((m) => [m.name.toLowerCase(), m])), [materials])
  const label = (name) => (lang === 'te' && byName.get(name.toLowerCase())?.name_te) || tr(name)

  // Present the string as an array for the multiselect, and note any legacy values
  // so they show up (ticked) as options and are not silently dropped on save.
  const api = useMemo(() => ({
    ...VendorsAPI,
    list: async (params) => {
      const r = await VendorsAPI.list(params)
      const items = (Array.isArray(r) ? r : (r.items || [])).map((v) => ({ ...v, material_list: split(v.material_types) }))
      const extra = new Set()
      items.forEach((v) => v.material_list.forEach((n) => { if (!byName.has(n.toLowerCase())) extra.add(n) }))
      setLegacy([...extra])
      return Array.isArray(r) ? items : { ...r, items }
    },
    create: ({ material_list, ...b }) => VendorsAPI.create({ ...b, material_types: material_list || [] }),
    update: (id, { material_list, ...b }) => VendorsAPI.update(id, { ...b, material_types: material_list || [] }),
  }), [byName])

  const options = useMemo(() => [
    ...materials.filter((m) => m.active).sort((a, b) => a.id - b.id).map((m) => ({ value: m.name, label: label(m.name) })),
    ...legacy.map((n) => ({ value: n, label: `${n} (${tr('not in master')})` })),
  ], [materials, legacy, lang]) // eslint-disable-line react-hooks/exhaustive-deps

  return <MasterScreen key={materials.length} config={{
    title: tr('Vendor Master'), subtitle: tr('Maintain waste-material buyers / vendors and the materials they handle.'),
    api, entity: 'vendor', addLabel: tr('Add New Vendor'), searchPlaceholder: tr('Search by name, code or phone…'),
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
        render: (r) => split(r.material_types).map(label).join(', ') || '—' },
    ],
    fields: [
      { k: 'name', label: tr('Vendor Name'), type: 'name', required: true },
      { k: 'phone', label: tr('Phone'), type: 'phone' },
      { k: 'material_list', label: tr('Material Types'), type: 'multiselect', options },
      { k: 'active', label: tr('Status'), type: 'active' },
    ],
  }} />
}
