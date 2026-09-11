// ── First-login password change modal ──────────────────────────────────────
// Shown when user.must_change_password is true. Cannot be dismissed until a
// valid new password is set.
import React, { useState } from 'react'
import { KeyRound, Eye, EyeOff, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { AuthAPI } from '../../api/client.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { useLang, T, tr } from '../../i18n/LanguageContext.jsx'
import { toast } from '../common/Dialog.jsx'
import { validatePassword, getPasswordStrength } from '../../lib/validation.js'

export default function ChangePasswordModal() {
  const { user, completeLogin } = useAuth()
  const { t } = useLang()
  const [form, setForm] = useState({ current: '', newPwd: '', confirm: '' })
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // If user doesn't need to change password, don't render
  if (!user?.must_change_password) return null

  // Password validation (DEF-011: must have letters AND numbers)
  const pwdValidation = validatePassword(form.newPwd, { required: false })
  const pwdStrength = getPasswordStrength(form.newPwd)
  const pwdMatch = form.newPwd && form.confirm && form.newPwd === form.confirm
  const pwdMismatch = form.newPwd && form.confirm && form.newPwd !== form.confirm
  const canSubmit = form.current && form.newPwd && pwdValidation.valid && form.confirm && pwdMatch && !saving

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return

    setError('')
    setSaving(true)
    try {
      // Response includes new token + updated user (old token is invalidated after password change)
      const res = await AuthAPI.changePassword(form.current, form.newPwd)
      completeLogin(res)  // Stores new token and updates user state
      toast(tr('Password changed successfully'), 'success')
    } catch (err) {
      setError(err.detail || err.message || tr('Failed to change password'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60" role="dialog" aria-modal="true">
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-2xl bg-white border border-gold-200 shadow-2xl overflow-hidden">
        {/* Header accent */}
        <div className="h-1.5 bg-gradient-to-r from-maroon-700 via-gold-500 to-maroon-700" />

        <div className="p-6">
          {/* Icon and title */}
          <div className="flex items-center gap-3 mb-5">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-maroon-700 to-maroon-800 text-gold-300 grid place-items-center shrink-0 shadow">
              <KeyRound size={20} />
            </div>
            <div>
              <h2 className="font-serif font-bold text-maroon-800 text-lg leading-tight"><T>Change Password</T></h2>
              <p className="text-[0.8125rem] text-gray-500 mt-0.5"><T>Please set a new password to continue</T></p>
            </div>
          </div>

          {/* Info banner */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mb-5 flex items-start gap-2">
            <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[0.75rem] text-amber-800 leading-snug">
              <T>For security, you must change your password on first login. Password must be at least 6 characters and contain both letters and numbers.</T>
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 mb-4 flex items-center gap-2 text-red-700 text-[0.8125rem]">
              <AlertCircle size={16} className="shrink-0" />
              {error}
            </div>
          )}

          {/* Form fields */}
          <div className="space-y-4">
            {/* Current password */}
            <div>
              <label className="label"><T>Current Password</T> *</label>
              <div className="relative">
                <input
                  type={showCurrent ? 'text' : 'password'}
                  className="input pr-10"
                  value={form.current}
                  onChange={(e) => setForm((f) => ({ ...f, current: e.target.value }))}
                  placeholder={tr('Enter current password')}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showCurrent ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* New password */}
            <div>
              <label className="label"><T>New Password</T> *</label>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  className={`input pr-10 ${form.newPwd && !pwdValidation.valid ? 'border-amber-400 focus:ring-amber-300' : form.newPwd && pwdValidation.valid ? 'border-emerald-400 focus:ring-emerald-300' : ''}`}
                  value={form.newPwd}
                  onChange={(e) => setForm((f) => ({ ...f, newPwd: e.target.value }))}
                  placeholder={tr('Enter new password')}
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {form.newPwd && !pwdValidation.valid && (
                <p className="text-[0.6875rem] text-amber-600 mt-1">{pwdValidation.error}</p>
              )}
              {form.newPwd && pwdValidation.valid && pwdStrength.label && (
                <p className={`text-[0.6875rem] mt-1 ${pwdStrength.color}`}>
                  <T>Password strength:</T> {pwdStrength.label}
                </p>
              )}
            </div>

            {/* Confirm password */}
            <div>
              <label className="label"><T>Confirm New Password</T> *</label>
              <input
                type={showNew ? 'text' : 'password'}
                className={`input ${pwdMismatch ? 'border-red-400 focus:ring-red-300' : pwdMatch ? 'border-emerald-400 focus:ring-emerald-300' : ''}`}
                value={form.confirm}
                onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
                placeholder={tr('Confirm new password')}
                autoComplete="new-password"
                required
              />
              {pwdMismatch && (
                <p className="text-[0.6875rem] text-red-600 mt-1 flex items-center gap-1">
                  <AlertCircle size={12} /> <T>Passwords do not match</T>
                </p>
              )}
              {pwdMatch && (
                <p className="text-[0.6875rem] text-emerald-600 mt-1 flex items-center gap-1">
                  <CheckCircle2 size={12} /> <T>Passwords match</T>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Footer with submit button */}
        <div className="px-6 py-4 bg-cream/60 border-t border-gold-100">
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full btn-primary py-2.5 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <T>Changing Password…</T>
              </>
            ) : (
              <>
                <KeyRound size={18} />
                <T>Change Password & Continue</T>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
