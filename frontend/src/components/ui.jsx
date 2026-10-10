// Small building blocks reused on every page, so the pages stay short and readable.
import React from 'react'

export const STATUS = {
  service: { label: 'In service', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  maintenance: { label: 'Maintenance', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  standby: { label: 'Standby', cls: 'bg-slate-100 text-slate-700 border-slate-300' },
}
export const RISK = {
  low: { label: 'Low risk', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200', bar: 'bg-emerald-500' },
  medium: { label: 'Medium risk', cls: 'bg-amber-50 text-amber-800 border-amber-200', bar: 'bg-amber-500' },
  high: { label: 'High risk', cls: 'bg-rose-50 text-rose-700 border-rose-200', bar: 'bg-rose-500' },
}
export const LINES = { line_1: 'Line 1', line_2: 'Line 2', spare: 'Spare' }

export function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso) // server stores local time
  return (
    <span className="font-mono tracking-tight tabular-nums">
      {d.toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
    </span>
  )
}

export function fmtDate(isoDate) {
  if (!isoDate) return ''
  return (
    <span className="font-mono tracking-tight tabular-nums">
      {new Date(isoDate + 'T00:00:00').toLocaleDateString([], { day: 'numeric', month: 'short' })}
    </span>
  )
}

export function Chip({ className = '', children }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${className}`}>
      {children}
    </span>
  )
}

export const StatusChip = ({ status }) =>
  status ? <Chip className={STATUS[status].cls}>{STATUS[status].label}</Chip> : <Chip className="bg-slate-50 text-slate-500 border-slate-200">No plan</Chip>

export const RiskChip = ({ level, value }) => (
  <Chip className={RISK[level].cls}>
    {RISK[level].label} · <span className="font-mono tracking-tight tabular-nums">{Math.round(value * 100)}%</span>
  </Chip>
)

export function Card({ title, subtitle, right, children, primary = false, interactive = false, className = '' }) {
  const isPrimary = primary || className.includes('card-primary') || className.includes('dashboard-panel')
  const isInteractive = interactive || className.includes('interactive-card')
  return (
    <section className={`relative rounded-2xl border border-white/[0.08] border-t-white/15 bg-white shadow-sm transition-[color,background-color,border-color,transform,box-shadow] duration-150 ease-out hover:border-white/20 hover:shadow-md ${isInteractive ? 'hover:scale-[1.01] active:scale-[0.99] cursor-pointer' : ''} ${isPrimary ? 'card-primary' : ''} ${className}`}>
      {(title || right) && (
        <header className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-bold tracking-tight text-slate-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  )
}

const BTN = {
  primary: 'bg-orange-500 text-slate-950 font-bold hover:bg-orange-600 hover:text-slate-950 shadow-sm',
  success: 'bg-emerald-600 text-white font-bold hover:bg-emerald-700 shadow-sm',
  danger: 'border border-rose-300 bg-white text-rose-700 font-semibold hover:bg-rose-50',
  ghost: 'border border-slate-300 bg-white text-slate-700 font-semibold hover:bg-slate-50',
}
export function Btn({ kind = 'primary', className = '', ...props }) {
  return <button {...props} className={`rounded-lg px-4 py-2 text-sm font-semibold transition-[color,background-color,border-color,transform,box-shadow,opacity] duration-150 ease-out hover:border-white/20 hover:scale-[1.01] active:scale-[0.99] disabled:hover:scale-100 disabled:active:scale-100 ${BTN[kind]} ${className}`} />
}

export function Spinner({ text = 'Loading…' }) {
  return (
    <div className="metro-loader page-enter flex min-h-64 flex-col items-center justify-center px-5 py-12 text-slate-600" role="status" aria-live="polite">
      <div className="metro-loader__scene" aria-hidden="true">
        <div className="metro-loader__track"><span /><span /><span /><span /><span /><span /></div>
        <svg className="metro-loader__train" viewBox="0 0 84 40" fill="none">
          <path d="M11 29V13.5C11 8.8 14.8 5 19.5 5h45C70.3 5 75 9.7 75 15.5V29H11Z" fill="#E66E39" />
          <path d="M19 10h12v10H17v-6a4 4 0 0 1 2-4Zm16 0h12v10H35V10Zm16 0h12c3.3 0 6 2.7 6 6v4H51V10Z" fill="#FFF8EF" />
          <path d="M8 29h70v4H8z" fill="#183A37" />
          <path d="M17 33a5 5 0 1 0 10 0m31 0a5 5 0 1 0 10 0" stroke="#183A37" strokeWidth="3" />
          <path d="M14 25h58" stroke="#F7B46C" strokeWidth="2" />
          <circle cx="69" cy="25" r="2" fill="#FFE0A6" />
        </svg>
        <div className="metro-loader__glow" />
      </div>
      <p className="mt-5 text-sm font-bold text-slate-800">{text}</p>
      <p className="mt-1 text-xs text-slate-500">Checking fleet readiness and operational data</p>
      <div className="metro-loader__progress mt-4" aria-hidden="true"><span /></div>
    </div>
  )
}

export function Confirm({ title, text, confirmText, kind = 'primary', onConfirm, onCancel, busy }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-2xl border border-white/[0.08] border-t-white/15 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-slate-900">{title}</h3>
        <p className="mt-2 text-slate-600">{text}</p>
        <div className="mt-6 flex justify-end gap-2">
          <Btn kind="ghost" onClick={onCancel}>Cancel</Btn>
          <Btn kind={kind} onClick={onConfirm} disabled={busy}>{busy ? 'Please wait…' : confirmText}</Btn>
        </div>
      </div>
    </div>
  )
}

export function Toast({ toast }) {
  if (!toast) return null
  const cls = toast.type === 'error' ? 'bg-rose-600' : 'bg-slate-900'
  return (
    <div className={`fixed bottom-6 left-1/2 z-[60] max-w-[90vw] -translate-x-1/2 rounded-xl px-5 py-3 text-sm font-medium text-white shadow-lg ${cls}`}>
      {toast.text}
    </div>
  )
}
