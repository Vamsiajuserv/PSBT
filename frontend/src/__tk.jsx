import React from 'react'
import ReactDOM from 'react-dom/client'
import { TicketShell, TF } from './components/admin/BookingTicket.jsx'
const errs = []; const oe = console.error; console.error = (...a) => { errs.push(String(a[0]).slice(0, 200)); oe(...a) }
const line = { vehicle_no: '', pooja_name: 'Sai Vratam (Pournami)' }
const bill = { _beneficiary: '', _specialNotes: '', _gothram: '' }
function T() {
  return (
    <TicketShell code="BK2610070001">
      <TF label="Receipt No" value="RCPT2610070001" mono />
      {bill._gothram && <TF label="Sankalpam" value="x" />}
      {bill._beneficiary && <TF label="In the name of" value="x" />}
      {bill._specialNotes && <TF label="Special Notes" value="x" wide />}
      <>
        <TF label="Pooja" value={line.pooja_name} />
        <TF label="Plan" value="Life Long" />
        {line.vehicle_no && <TF label="Vehicle No" value={line.vehicle_no} />}
      </>
    </TicketShell>
  )
}
ReactDOM.createRoot(document.getElementById('root')).render(<T />)
setTimeout(() => { const p = document.createElement('pre'); p.id = 'report'; p.textContent = (document.body.innerText.includes('Life Long') ? 'RENDERED' : 'NOT RENDERED') + ' | errors: ' + (errs.join(' || ') || 'none'); document.body.appendChild(p) }, 2000)
