// ── Themed in-app dialogs + toasts ──────────────────────────────────────────
// Replaces the native browser alert()/confirm()/prompt() popups (OS-styled,
// "localhost says…", outside the app theme) with modals rendered inside the
// page, plus a toast stack for transient feedback.
//
// Imperative API (usable from any handler, no hooks needed):
//   await confirmDialog({ title, message, confirmLabel, tone })      → boolean
//   await promptDialog({ title, message, fields: [...] })            → {k: v} | null
//   await alertDialog({ title, message, mono })                      → void
//   toast('Saved', 'success' | 'error' | 'info')
//
// promptDialog fields: { k, label, type?: 'text'|'number'|'date'|'checkbox',
//   placeholder?, defaultValue?, required?, note? } — 'date' renders the themed
//   DateField, so even dialog dates never fall back to the native picker.
//
// <DialogHost /> must be mounted once (done in App.jsx).
import React, { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { Checkbox, DateField, NumberField } from './Field.jsx'

let host = null // set by DialogHost on mount

// ── public API ──────────────────────────────────────────────────────────────
export const confirmDialog = (opts) => (host ? host.open({ kind: 'confirm', ...norm(opts) }) : Promise.resolve(window.confirm(norm(opts).message || norm(opts).title)))
export const promptDialog = (opts) => (host ? host.open({ kind: 'prompt', ...norm(opts) }) : Promise.resolve(null))
export const alertDialog = (opts) => (host ? host.open({ kind: 'alert', ...norm(opts) }) : Promise.resolve(window.alert(norm(opts).message || norm(opts).title)))
export const toast = (message, tone = 'success') => host?.toast({ message, tone })

const norm = (o) => (typeof o === 'string' ? { message: o } : o || {})

// ── host component ──────────────────────────────────────────────────────────
let seq = 0
export function DialogHost() {
  const [dlg, setDlg] = useState(null)       // active dialog (one at a time)
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    host = {
      // A new dialog gets a fresh id (keys a fresh <Modal>, so field state never
      // leaks between back-to-back dialogs); an overwritten dialog resolves as
      // cancelled so its caller never hangs.
      open: (d) => new Promise((resolve) => setDlg((prev) => {
        if (prev) prev.resolve(prev.kind === 'confirm' ? false : prev.kind === 'prompt' ? null : undefined)
        return { ...d, resolve, id: ++seq }
      })),
      toast: (t) => {
        const id = ++seq
        setToasts((ts) => [...ts, { ...t, id }])
        setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 4000)
      },
    }
    return () => { host = null }
  }, [])

  const finish = (result) => { dlg?.resolve(result) ; setDlg(null) }

  return (
    <>
      {dlg && <Modal key={dlg.id} dlg={dlg} finish={finish} />}
      {toasts.length > 0 && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[130] flex flex-col items-center gap-2 pointer-events-none px-4">
          {toasts.map((t) => <Toast key={t.id} {...t} onClose={() => setToasts((ts) => ts.filter((x) => x.id !== t.id))} />)}
        </div>
      )}
    </>
  )
}

function Toast({ message, tone, onClose }) {
  const style = {
    success: { icon: CheckCircle2, cls: 'bg-emerald-700 text-white' },
    error: { icon: AlertTriangle, cls: 'bg-red-700 text-white' },
    info: { icon: Info, cls: 'bg-maroon-800 text-cream' },
  }[tone] || { icon: Info, cls: 'bg-maroon-800 text-cream' }
  const Icon = style.icon
  return (
    <div className={`pointer-events-auto flex items-center gap-2.5 rounded-xl px-4 py-2.5 shadow-lg text-[0.8125rem] font-medium max-w-md ${style.cls}`}>
      <Icon size={16} className="shrink-0" />
      <span className="min-w-0">{message}</span>
      <button type="button" onClick={onClose} className="shrink-0 opacity-60 hover:opacity-100 ml-1"><X size={14} /></button>
    </div>
  )
}

function Modal({ dlg, finish }) {
  const { kind, title, message, mono, note, fields = [], confirmLabel, cancelLabel, tone } = dlg
  const danger = tone === 'danger'
  const [vals, setVals] = useState(() => Object.fromEntries(fields.map((f) => [f.k, f.defaultValue ?? (f.type === 'checkbox' ? false : '')])))
  const firstRef = useRef(null)
  const submitRef = useRef(null)
  // Focus the first text input; with none (confirm/alert), focus the primary
  // button so Enter confirms and Escape cancels straight away.
  useEffect(() => { setTimeout(() => (firstRef.current || submitRef.current)?.focus(), 0) }, [])

  // Escape cancels; backdrop click cancels (never accidental-confirms).
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') finish(kind === 'confirm' ? false : kind === 'prompt' ? null : undefined) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const missing = fields.some((f) => f.required && f.type !== 'checkbox' && String(vals[f.k] ?? '').trim() === '')
  const submit = (e) => {
    e?.preventDefault()
    if (kind === 'confirm') return finish(true)
    if (kind === 'alert') return finish(undefined)
    if (missing) return
    finish(vals)
  }
  const cancel = () => finish(kind === 'confirm' ? false : kind === 'prompt' ? null : undefined)

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/45" onClick={cancel} />
      <form onSubmit={submit} className="relative w-full max-w-md rounded-2xl bg-white border border-gold-200 shadow-2xl overflow-hidden">
        <div className={`h-1 ${danger ? 'bg-red-600' : 'bg-gradient-to-r from-gold-400 to-gold-500'}`} />
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div className={`w-9 h-9 rounded-full grid place-items-center shrink-0 ${danger ? 'bg-red-50 text-red-600' : 'bg-gold-100 text-maroon-800'}`}>
              {danger ? <AlertTriangle size={18} /> : kind === 'alert' ? <Info size={18} /> : <CheckCircle2 size={18} />}
            </div>
            <div className="min-w-0 flex-1">
              {title && <div className="font-serif font-bold text-maroon-800 text-[0.9375rem] leading-snug">{title}</div>}
              {message && <div className="text-[0.8125rem] text-gray-600 mt-1 whitespace-pre-line">{message}</div>}
            </div>
          </div>

          {mono && (
            <div className="mt-3 rounded-lg bg-cream border border-gold-200 px-3 py-2.5 font-mono text-[0.75rem] text-maroon-900 break-all select-all whitespace-pre-wrap">{mono}</div>
          )}

          {fields.length > 0 && (
            <div className="mt-4 space-y-3">
              {fields.map((f, i) => (
                <div key={f.k}>
                  {f.type === 'checkbox' ? (
                    <label className="flex items-center gap-2.5 text-[0.8125rem] text-gray-700 cursor-pointer">
                      <Checkbox
                        checked={!!vals[f.k]}
                        onChange={(e) => setVals((v) => ({ ...v, [f.k]: e.target.checked }))}
                      />
                      {f.label}
                    </label>
                  ) : (
                    <>
                      <label className="label">{f.label}{f.required && ' *'}</label>
                      {f.type === 'date' ? (
                        <DateField value={vals[f.k]} min={f.min} max={f.max} required={f.required}
                          onChange={(e) => setVals((v) => ({ ...v, [f.k]: e.target.value }))} />
                      ) : f.type === 'number' ? (
                        <NumberField
                          innerRef={i === 0 ? firstRef : undefined}
                          prefix={f.prefix ?? '₹'}
                          step="0.01"
                          min="0"
                          placeholder={f.placeholder}
                          value={vals[f.k]}
                          onChange={(e) => setVals((v) => ({ ...v, [f.k]: e.target.value }))}
                        />
                      ) : (
                        <input
                          ref={i === 0 ? firstRef : undefined}
                          type="text"
                          placeholder={f.placeholder}
                          value={vals[f.k]}
                          onChange={(e) => setVals((v) => ({ ...v, [f.k]: e.target.value }))}
                          className="input"
                        />
                      )}
                    </>
                  )}
                  {f.note && <div className="text-[0.6875rem] text-gray-400 mt-1">{f.note}</div>}
                </div>
              ))}
            </div>
          )}
          {note && <div className="mt-3 text-[0.71875rem] text-gray-400">{note}</div>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3.5 bg-cream/60 border-t border-gold-100">
          {kind !== 'alert' && (
            <button type="button" onClick={cancel} className="px-4 py-2 rounded-lg text-[0.8125rem] font-semibold text-gray-600 hover:bg-gray-100 transition-colors">
              {cancelLabel || 'Cancel'}
            </button>
          )}
          <button
            type="submit"
            ref={submitRef}
            disabled={kind === 'prompt' && missing}
            className={`px-4 py-2 rounded-lg text-[0.8125rem] font-bold text-white transition-colors disabled:opacity-40 ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-maroon-800 hover:bg-maroon-900'}`}
          >
            {confirmLabel || (kind === 'alert' ? 'OK' : kind === 'prompt' ? 'Save' : 'Confirm')}
          </button>
        </div>
      </form>
    </div>
  )
}
