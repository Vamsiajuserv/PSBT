import React, { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { DevoteesAPI } from '../../api/client.js'
import { tr } from '../../i18n/LanguageContext.jsx'

// Participant chips; a linked devotee's family members can be added with one click.
export default function ParticipantsInput({ participants, setParticipants, devotee }) {
  const [newName, setNewName] = useState('')
  const [familyMembers, setFamilyMembers] = useState([])

  useEffect(() => {
    if (devotee?.id) {
      DevoteesAPI.get(devotee.id).then((d) => setFamilyMembers(d.family || [])).catch(() => setFamilyMembers([]))
    } else {
      setFamilyMembers([])
    }
  }, [devotee?.id])

  const addParticipant = (name, relation = '') => {
    if (!name.trim()) return
    if (participants.some(p => p.name.toLowerCase() === name.trim().toLowerCase())) return
    setParticipants([...participants, { name: name.trim(), relation }])
  }

  return (
    <div className="space-y-2">
      {participants.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {participants.map((p, i) => (
            <span key={i} className="inline-flex items-center gap-1 bg-maroon-50 text-maroon-700 px-2 py-0.5 rounded-full text-[10px]">
              {p.name}
              <button onClick={() => setParticipants(participants.filter((_, j) => j !== i))} className="text-maroon-400 hover:text-red-600"><X size={10} /></button>
            </span>
          ))}
        </div>
      )}
      {familyMembers.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {familyMembers.map((m, i) => {
            const added = participants.some(p => p.name.toLowerCase() === m.name.toLowerCase())
            return (
              <button key={i} onClick={() => !added && addParticipant(m.name, m.relation)} disabled={added} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border transition-colors ${added ? 'bg-gray-100 text-gray-400 border-gray-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'}`}>
                <Plus size={10} /> {m.name}
              </button>
            )
          })}
        </div>
      )}
      <div className="flex gap-1.5">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addParticipant(newName), setNewName(''))} placeholder={tr("Add participant")} className="input flex-1 !text-xs !py-1" />
        <button onClick={() => { addParticipant(newName); setNewName('') }} disabled={!newName.trim()} className="btn-outline !py-1 !px-2 text-xs disabled:opacity-50"><Plus size={12} /></button>
      </div>
    </div>
  )
}
