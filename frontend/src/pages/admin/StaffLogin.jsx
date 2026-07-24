import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { UserRound, Lock, LogIn, Eye, EyeOff, ShieldCheck, ScrollText, KeyRound } from 'lucide-react'
import { Flourish } from '../../components/common/UI.jsx'
import { useTemple, useSite } from '../../lib/SiteContext.jsx'
import { useAuth } from '../../auth/AuthContext.jsx'
import { AuthAPI, ApiError } from '../../api/client.js'
import { T, tr } from '../../i18n/LanguageContext.jsx'

const TRUST = [
  { icon: ShieldCheck, title: 'Data Encryption', desc: '256-bit SSL encryption for secure data' },
  { icon: KeyRound, title: 'Two-Factor Authentication', desc: 'Extra layer of security for authorized access' },
  { icon: ScrollText, title: 'Audit Logs', desc: 'All activities are recorded and monitored' },
]

// Demo staff accounts — click a card to auto-fill and sign in.
const DEMO_ACCOUNTS = [
  { username: 'admin', password: 'Admin@123', role: 'Administrator', desc: 'Full access · all modules', tone: 'bg-maroon-50 text-maroon-700 border-maroon-200' },
  { username: 'counter1', password: 'Counter@123', role: 'Counter Staff', desc: 'Billing only · no cancel/delete', tone: 'bg-blue-50 text-blue-700 border-blue-200' },
  { username: 'accounts', password: 'Accounts@123', role: 'Accountant', desc: 'Read-only · reports & bills', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { username: 'poojari1', password: 'Poojari@123', role: 'Poojari', desc: 'Pooja queue · verify tickets', tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  { username: 'committee1', password: 'Committee@123', role: 'Committee', desc: 'Hundi verify · auction · reports', tone: 'bg-violet-50 text-violet-700 border-violet-200' },
]

export default function StaffLogin() {
  const nav = useNavigate()
  const { completeLogin } = useAuth()
  const temple = useTemple()
  const images = useSite()?.images
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // 2FA step
  const [challenge, setChallenge] = useState(null)
  const [otp, setOtp] = useState('')
  const [forgot, setForgot] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError(''); setBusy(true)
    try {
      const res = await AuthAPI.login(username.trim(), password)
      if (res.twofa_required) {
        setChallenge(res.access_token)
      } else {
        completeLogin(res)
        nav('/admin')
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Login failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  // Click a demo account → fill the fields and sign in directly.
  async function quickLogin(acct) {
    setUsername(acct.username); setPassword(acct.password)
    setError(''); setBusy(true)
    try {
      const res = await AuthAPI.login(acct.username, acct.password)
      if (res.twofa_required) setChallenge(res.access_token)
      else { completeLogin(res); nav('/admin') }
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Login failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function verify(e) {
    e.preventDefault()
    setError(''); setBusy(true)
    try {
      const res = await AuthAPI.verify2fa(challenge, otp.trim())
      completeLogin(res)
      nav('/admin')
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Verification failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-cream">
      <div className="flex-1 grid lg:grid-cols-2">
        {/* Visual / brand panel */}
        <div className="relative hidden lg:flex flex-col justify-center items-center text-center px-12 bg-maroon-900 overflow-hidden">
          {images?.about && <img src={images.about} alt="Temple" className="absolute inset-0 w-full h-full object-cover opacity-30" />}
          <div className="absolute inset-0 bg-gradient-to-t from-maroon-900 via-maroon-900/70 to-maroon-900/40" />
          <div className="relative text-cream">
            <div className="w-20 h-20 mx-auto rounded-full border-2 border-gold-400 bg-maroon-800 grid place-items-center text-4xl">🛕</div>
            <h1 className="font-serif text-3xl font-bold text-gold-200 mt-5 tracking-wide">{temple?.name || 'Sri Shirdi Sai Baba Temple'}</h1>
            <p className="text-cream/70 text-sm mt-2">{temple?.place || temple?.address || 'Dwarakapuri Colony, Punjagutta, Hyderabad'}</p>
            <Flourish className="mt-4" width="w-14" />
            <h2 className="font-serif text-xl font-bold text-gold-300 mt-4"><T>Temple Staff Portal</T></h2>
            <p className="text-cream/70 text-sm mt-2 max-w-xs mx-auto"><T>Secure access for authorized temple staff to manage temple operations</T></p>
          </div>
        </div>

        {/* Form panel */}
        <div className="grid place-items-center px-4 py-12">
          <div className="w-full max-w-md">
            <div className="card p-8">
              <div className="w-16 h-16 mx-auto rounded-full bg-gold-100 border border-gold-300 grid place-items-center text-maroon-700"><Lock size={26} /></div>
              <h1 className="font-serif text-2xl font-bold text-maroon-700 text-center mt-4"><T>Welcome Back!</T></h1>
              <p className="text-sm text-gray-500 text-center mt-1"><T>Please login to continue</T></p>

              {error && <div className="mt-5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">{error}</div>}

              {!challenge ? (
                <form onSubmit={submit} className="mt-6 space-y-4">
                  <div>
                    <label className="label"><T>Username / Employee ID</T></label>
                    <div className="relative">
                      <UserRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input required autoFocus className="input !pl-9" placeholder={tr("Enter your username or employee ID")}
                        value={username} onChange={(e) => setUsername(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="label"><T>Password</T></label>
                    <div className="relative">
                      <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input required type={showPw ? 'text' : 'password'} className="input !pl-9 !pr-9" placeholder={tr("Enter your password")}
                        value={password} onChange={(e) => setPassword(e.target.value)} />
                      <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                        {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-end text-xs">
                    <button type="button" onClick={() => setForgot((v) => !v)} className="font-semibold text-maroon-600 hover:underline"><T>Forgot Password?</T></button>
                  </div>
                  {forgot && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-[0.71875rem] text-gray-600"><T>Password resets are handled by an Administrator. Please contact your temple administrator to reset your staff account password.</T>{' '}</div>
                  )}
                  <button disabled={busy} className="btn-maroon w-full !py-3 disabled:opacity-60"><LogIn size={16} /> {busy ? 'Signing in…' : 'Login'}</button>
                  <div className="bg-gold-50 border border-gold-200 rounded-lg px-3 py-2.5 flex items-start gap-2 text-[0.6875rem] text-gray-500">
                    <ShieldCheck size={16} className="text-gold-500 shrink-0 mt-0.5" />
                    Two-Factor Authentication will be requested after successful login (if enabled for your account).
                  </div>

                  {/* Demo accounts — click to auto-fill & sign in */}
                  <div className="pt-1">
                    <div className="flex items-center gap-2 text-[0.625rem] uppercase tracking-widest text-gray-400 mb-2">
                      <span className="h-px flex-1 bg-gold-200" />{' '}<T>Demo Logins — click to enter</T>{' '}<span className="h-px flex-1 bg-gold-200" />
                    </div>
                    <div className="space-y-2">
                      {DEMO_ACCOUNTS.map((a) => (
                        <button type="button" key={a.username} disabled={busy} onClick={() => quickLogin(a)}
                          className={`w-full flex items-center justify-between border rounded-lg px-3 py-2 text-left transition hover:brightness-95 disabled:opacity-60 ${a.tone}`}>
                          <span>
                            <span className="block text-sm font-bold leading-tight">{a.role}</span>
                            <span className="block text-[0.6875rem] opacity-80">{a.desc}</span>
                          </span>
                          <span className="text-right shrink-0 pl-2">
                            <span className="block text-[0.6875rem] font-mono font-semibold">{a.username}</span>
                            <span className="block text-[0.625rem] font-mono opacity-70">{a.password}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </form>
              ) : (
                <form onSubmit={verify} className="mt-6 space-y-4">
                  <p className="text-sm text-gray-600 text-center"><T>Enter the 6-digit code from your authenticator app.</T></p>
                  <input required autoFocus inputMode="numeric" maxLength={6} className="input text-center tracking-[0.5em] text-lg"
                    placeholder="••••••" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} />
                  <button disabled={busy} className="btn-maroon w-full !py-3 disabled:opacity-60"><KeyRound size={16} /> {busy ? 'Verifying…' : 'Verify & Continue'}</button>
                  <button type="button" onClick={() => { setChallenge(null); setOtp('') }} className="btn-ghost w-full text-xs"><T>← Back to login</T></button>
                </form>
              )}
            </div>

            <p className="text-center text-[0.6875rem] text-gray-400 mt-4"><Link to="/" className="hover:text-maroon-600"><T>← Back to public site</T></Link></p>
          </div>
        </div>
      </div>

      {/* Trust strip */}
      <div className="bg-maroon-900 text-cream">
        <div className="max-w-5xl mx-auto px-4 py-6 grid sm:grid-cols-3 gap-6">
          {TRUST.map((t) => {
            const Icon = t.icon
            return (
              <div key={t.title} className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full border border-gold-400/50 text-gold-300 grid place-items-center shrink-0"><Icon size={18} /></div>
                <div><div className="text-sm font-bold text-gold-200">{t.title}</div><div className="text-[0.6875rem] text-cream/60 leading-snug">{t.desc}</div></div>
              </div>
            )
          })}
        </div>
        <div className="border-t border-white/10 text-center text-[0.6875rem] text-cream/50 py-3">
          This is a secure login for authorized temple staff only. All login attempts are logged and monitored.
          {temple?.phone ? ` · ${temple.phone}` : ''}{temple?.email ? ` · ${temple.email}` : ''}
        </div>
      </div>
    </div>
  )
}
