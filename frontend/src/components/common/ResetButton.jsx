import React from 'react'
import { RotateCcw } from 'lucide-react'
import { tr } from '../../i18n/LanguageContext.jsx'
import { confirmDialog } from './Dialog.jsx'

// "Reset" for entry forms (client, 2026-11-20): clears everything typed so far and puts the form
// back to its starting values (today's date, fixed rates, the chosen tab stay). Asks first, so one
// click never wipes a filled form by accident. It only clears the screen — nothing saved is changed
// (a saved entry is corrected by the Administrator's Void, as before).
//
//   <ResetButton onReset={() => setForm(emptyForm())} disabled={busy} />
//   dirty={false} → clears without asking (nothing typed yet).
export default function ResetButton({ onReset, disabled = false, dirty = true, className = '', label }) {
  const click = async () => {
    if (dirty && !(await confirmDialog({
      title: tr('Clear all entered details?'),
      message: tr('Everything typed in this form will be cleared. Nothing that is already saved is changed.'),
      confirmLabel: tr('Reset'),
    }))) return
    onReset?.()
  }
  return (
    <button type="button" onClick={click} disabled={disabled} title={tr('Clear all entered details?')}
      className={`btn-outline disabled:opacity-40 ${className}`}>
      <RotateCcw size={14} />{' '}{label || tr('Reset')}
    </button>
  )
}
