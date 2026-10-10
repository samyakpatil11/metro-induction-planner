import React, { useState } from 'react'
import { api, token } from '../api'
import { Btn } from './ui'

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await api.login(username.trim(), password)
      token.set(res.token)
      onLogin(res.user)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const fill = (u, p) => { setUsername(u); setPassword(p); setError('') }
  const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-3 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-200'

  return (
    <main className="planner-canvas login-layout">
      <section className="control-panel login-hero relative overflow-hidden bg-slate-900 p-8 text-white xl:p-14">
        <div className="relative flex items-center gap-4">
          <div className="grid size-12 place-items-center rounded-xl bg-white p-1.5 shadow-lg shadow-black/15"><img src="/nagpur-metro-logo.png" alt="" className="max-h-full max-w-full object-contain" /></div>
          <div><p className="text-lg font-bold tracking-tight">Nagpur Metro</p><p className="text-sm text-white/60">Depot Operations</p></div>
        </div>
        <div className="hero-copy relative max-w-2xl py-12">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-orange-200"><span className="signal-live size-2 rounded-full bg-orange-400" /> Night shift control</p>
          <h1 className="text-4xl font-bold leading-[1.08] tracking-[-0.025em] lg:text-5xl xl:text-6xl">Every train.<br /><span className="text-orange-200">The right decision.</span><br />Before first service.</h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/70">Review fleet readiness, resolve safety alerts, and approve tonight&apos;s induction plan from one operational view.</p>
        </div>
        <div className="relative grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 shadow-xl shadow-black/10 backdrop-blur-sm">
          {[['23', 'Fleet size'], ['16', 'Required'], ['05:30', 'Plan lock']].map(([value, label]) => <div key={label} className="bg-white/[0.04] p-4"><p className="text-2xl font-bold tracking-tight font-mono tabular-nums">{value}</p><p className="mt-1 text-[11px] uppercase tracking-wider text-white/55">{label}</p></div>)}
        </div>
      </section>

      <section className="login-form-pane flex items-center justify-center px-5 py-10 sm:px-10 md:px-8 lg:px-12">
        <div className="login-card w-full max-w-md rounded-2xl border border-white/80 bg-white/75 p-6 shadow-xl backdrop-blur-xl sm:p-9">
          <img src="/nagpur-metro-logo.png" alt="Nagpur Metro Rail Project" className="mb-7 h-12 w-auto object-contain object-left md:hidden" />
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-orange-200/70 bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-800"><span className="size-1.5 rounded-full bg-orange-500" /> INDUCTION PLANNER</div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Welcome to night operations</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">Sign in to review tonight&apos;s fleet plan and keep every departure ready.</p>
          <form onSubmit={submit} className="mt-8 space-y-5">
            <label className="block"><span className="mb-2 block text-sm font-semibold">Username</span><input className={input} value={username} onChange={(e) => setUsername(e.target.value)} autoFocus /></label>
            <label className="block"><span className="mb-2 block text-sm font-semibold">Password</span><input className={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
            {error && <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
            <Btn className="w-full py-3" disabled={busy || !username || !password}>{busy ? 'Signing in…' : 'Sign in'} <span className="ml-2" aria-hidden="true">→</span></Btn>
          </form>
          <div className="mt-8 border-t border-slate-200/80 pt-6">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Quick demo access</p>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => fill('officer', 'officer123')} className="demo-access rounded-xl border border-slate-200/80 bg-white/80 p-3.5 text-left transition hover:border-orange-400 hover:shadow-md"><svg className="mb-2 size-4 text-orange-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 3 19 6v5c0 4.7-3 8-7 10-4-2-7-5.3-7-10V6l7-3Z"/><path d="m9 12 2 2 4-4"/></svg><span className="block text-sm font-bold">Depot Officer</span><span className="text-xs text-slate-500">Can approve plans</span></button>
              <button type="button" onClick={() => fill('viewer', 'viewer123')} className="demo-access rounded-xl border border-slate-200/80 bg-white/80 p-3.5 text-left transition hover:border-orange-400 hover:shadow-md"><svg className="mb-2 size-4 text-orange-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg><span className="block text-sm font-bold">Viewer</span><span className="text-xs text-slate-500">Read-only access</span></button>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Backend Server:</span>
              <button
                type="button"
                onClick={() => {
                  const current = (typeof localStorage !== 'undefined' && localStorage.getItem('metro_api_url')) || ''
                  const nextUrl = window.prompt(
                    'Enter your backend API URL (leave empty for same origin, or enter http://localhost:8000 for local backend):',
                    current
                  )
                  if (nextUrl !== null) {
                    if (nextUrl.trim()) {
                      localStorage.setItem('metro_api_url', nextUrl.trim())
                    } else {
                      localStorage.removeItem('metro_api_url')
                    }
                    window.location.reload()
                  }
                }}
                className="text-orange-600 hover:text-orange-700 font-medium underline"
              >
                {(typeof localStorage !== 'undefined' && localStorage.getItem('metro_api_url')) || 'Same Origin / Default'} ⚙️
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
