// The registers open on this month (client, 2026-11-26): a direct Download then takes this month, not
// everything since the beginning. Staff can still clear the dates for all records — on purpose.
const iso = (d) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
export const todayISO = () => iso(new Date())
export const monthStartISO = () => `${todayISO().slice(0, 8)}01`
