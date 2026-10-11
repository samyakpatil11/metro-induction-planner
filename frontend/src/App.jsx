import React, { useCallback, useEffect, useState } from 'react'
import { api, token, scheduleTokenRefresh } from './api'
import Login from './components/Login'
import Overview from './components/Overview'
import PlanPage from './components/PlanPage'
import TrainsPage from './components/TrainsPage'
import TrainDrawer from './components/TrainDrawer'
import AdminDashboard from './components/AdminDashboard'
import ActiveTrainManagement from './components/ActiveTrainManagement'
import BentoGridSkeleton from './components/BentoGridSkeleton'
import { Btn, Chip, Spinner, Toast } from './components/ui'

const TABS = [
  ['overview', 'Overview'],
  ['active_trains', 'Active Train Management'],
  ['plan', 'Tonight’s Plan'],
  ['trains', 'Trains'],
  ['admin', 'Admin / Data Manager'],
]

export default function App() {
  const [user, setUser] = useState(null)
  const [booting, setBooting] = useState(true)
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('overview')
  const [openCode, setOpenCode] = useState(null)
  const [requestedAssignment, setRequestedAssignment] = useState(null)
  const [fleetSearch, setFleetSearch] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [toastState, setToast] = useState(null)
  const [error, setError] = useState('')
  const [audit, setAudit] = useState([])
  const [auditLoading, setAuditLoading] = useState(false)

  const toast = useCallback((text, type = 'ok') => {
    setToast({ text, type })
    setTimeout(() => setToast(null), 3500)
  }, [])

  // Load everything the pages need, in one go.
  const refresh = useCallback(async () => {
    try {
      const [overview, plan, trains, strategies] = await Promise.all([api.overview(), api.plan(), api.trains(), api.strategies()])
      setData({ overview, plan, trains, strategies })
      setError('')
    } catch (e) { setError(e.message) }
  }, [])

  const loadAudit = useCallback(async () => {
    setAuditLoading(true)
    try { setAudit(await api.audit()) } catch (e) { toast(e.message, 'error') }
    finally { setAuditLoading(false) }
  }, [toast])  // audit response is now {total, events:[...]}; ActivityPage handles both shapes

  // Validate a token only if this app instance already has one in memory.
  useEffect(() => {
    if (!token.get()) { setBooting(false); return }
    api.me()
      .then((u) => { setUser(u); scheduleTokenRefresh() })
      .catch(() => token.clear())
      .finally(() => setBooting(false))
  }, [])
  useEffect(() => { if (user) refresh() }, [user, refresh])
  useEffect(() => { if (user && tab === 'activity') loadAudit() }, [user, tab, loadAudit])
  useEffect(() => {
    if (!user || !autoRefresh) return undefined
    const timer = window.setInterval(refresh, 60_000)
    return () => window.clearInterval(timer)
  }, [user, autoRefresh, refresh])
  useEffect(() => {
    const out = () => { setUser(null); setData(null) }
    window.addEventListener('metro-logout', out)
    return () => window.removeEventListener('metro-logout', out)
  }, [])

  if (booting) return <Spinner />
  if (!user) return <Login onLogin={(u) => { setUser(u); scheduleTokenRefresh() }} />

  const isOfficer = user.role === 'officer'
  const logout = () => { token.clear(); setUser(null); setData(null); setTab('overview') }
  const downloadFleet = async () => {
    try {
      const blob = await api.exportTrains()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url; anchor.download = 'metro-fleet.csv'; anchor.click()
      URL.revokeObjectURL(url)
      toast('Fleet CSV downloaded.')
    } catch (e) { toast(e.message, 'error') }
  }
  const showTrain = (code, assignment = null) => { setRequestedAssignment(assignment); setOpenCode(code) }
  const closeTrain = () => { setOpenCode(null); setRequestedAssignment(null) }
  const urgent = data?.overview.alert_counts.critical || 0
  const searchResults = fleetSearch.trim()
    ? (data?.trains || []).filter((train) => `${train.code} ${train.line_name} ${train.depot}`.toLowerCase().includes(fleetSearch.trim().toLowerCase())).slice(0, 6)
    : []

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 shadow-sm backdrop-blur-md">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <img src="/nagpur-metro-logo.png" alt="" className="h-9" />
            <div>
              <h1 className="text-sm font-bold leading-tight text-slate-900">Nagpur Metro</h1>
              <p className="text-xs text-slate-500">Induction Planner</p>
            </div>
          </div>
          <div className="relative order-3 w-full sm:order-none sm:w-56 lg:w-72">
            <label className="sr-only" htmlFor="fleet-quick-search">Find a train</label>
            <div className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 transition focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-100">
              <svg className="size-4 shrink-0 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg>
              <input id="fleet-quick-search" value={fleetSearch} onChange={(event) => setFleetSearch(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Escape') setFleetSearch(''); if (event.key === 'Enter' && searchResults[0]) { showTrain(searchResults[0].code); setFleetSearch('') } }}
                placeholder="Find a train…" autoComplete="off" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" />
              {fleetSearch && <button type="button" onClick={() => setFleetSearch('')} aria-label="Clear train search" className="text-lg leading-none text-slate-400 hover:text-slate-800">×</button>}
            </div>
            {fleetSearch.trim() && <div className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-xl" role="listbox" aria-label="Matching trains">
              {searchResults.length ? searchResults.map((train) => <button key={train.code} type="button" role="option" aria-selected="false"
                onClick={() => { showTrain(train.code); setFleetSearch('') }} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition hover:bg-orange-50">
                <span className="font-bold text-slate-900">{train.code}</span><span className="text-xs text-slate-500">{train.line_name} · {train.depot}</span>
              </button>) : <p className="px-3 py-3 text-sm text-slate-500">No trains match that search.</p>}
            </div>}
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-medium lg:inline">Depot Operations · {data?.overview.fleet_size ?? 23} trains</span>
            <Chip className={isOfficer ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-slate-100 text-slate-600'}>
              {isOfficer ? 'Officer' : 'Read-only'}
            </Chip>
            <span className="hidden text-sm font-semibold md:inline">{user.name}</span>
            <button type="button" onClick={() => setAutoRefresh((enabled) => !enabled)} aria-pressed={autoRefresh}
              title="Refresh overview, plan, and fleet automatically every minute"
              className="hidden items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-orange-300 hover:bg-orange-50 sm:flex">
              <span className={`size-2 rounded-full ${autoRefresh ? 'animate-pulse bg-emerald-500' : 'bg-slate-300'}`} />{autoRefresh ? 'Live on' : 'Live off'}
            </button>
            <Btn kind="ghost" className="!px-3 !py-1.5" onClick={refresh} title="Load the latest data">↻ Refresh</Btn>
            <Btn kind="ghost" className="!px-3 !py-1.5" onClick={logout}>Log out</Btn>
          </div>
        </div>
        <nav className="mx-auto flex max-w-[1360px] gap-1 overflow-x-auto px-4 sm:px-6">
          {[...TABS, ['activity', 'Activity log']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`relative whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${tab === id ? 'border-orange-600 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
              {label}
              {id === 'overview' && urgent > 0 && <span className="ml-2 rounded-full bg-rose-600 px-2 py-0.5 text-xs text-white">{urgent}</span>}
              {id === 'active_trains' && (data?.trains?.filter(t => t.cert_days_left <= 10 || t.serious_faults > 0 || t.km_since_overhaul >= 22500 || t.risk_level === 'high').length > 0) && (
                <span className="ml-2 rounded-full bg-amber-500 px-2 py-0.5 text-xs text-white">
                  {data.trains.filter(t => t.cert_days_left <= 10 || t.serious_faults > 0 || t.km_since_overhaul >= 22500 || t.risk_level === 'high').length}
                </span>
              )}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-[1360px] p-4 sm:p-6 lg:p-8">
        {data?.overview?.risk_model_mode === 'heuristic' && (
          <div role="status" className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
            <strong>Indicative risk estimate.</strong> There is not enough labeled fault history to train the risk model, so these scores use transparent operating rules and are not calibrated predictions.
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800">
            <b>{error}</b> <button onClick={refresh} className="ml-2 underline">Try again</button>
          </div>
        )}
        {!data ? (
          tab === 'overview' ? <BentoGridSkeleton /> : <Spinner />
        ) : (
          <>
            {tab === 'overview' && <Overview overview={data.overview} trains={data.trains} isOfficer={isOfficer} goTo={setTab} openTrain={showTrain} strategy={data.plan?.strategy || data.strategies?.[0]?.id || 'safest'} refresh={refresh} toast={toast} />}
            {tab === 'active_trains' && <ActiveTrainManagement trains={data.trains} openTrain={showTrain} isOfficer={isOfficer} strategy={data.plan?.strategy || data.strategies?.[0]?.id || 'safest'} refresh={refresh} toast={toast} />}
            {tab === 'plan' && <PlanPage plan={data.plan} strategies={data.strategies} trains={data.trains} isOfficer={isOfficer} refresh={refresh} openTrain={showTrain} toast={toast} />}
            {tab === 'trains' && <TrainsPage trains={data.trains} openTrain={showTrain} onExport={downloadFleet} />}
            {tab === 'admin' && <AdminDashboard trains={data.trains} onRefresh={refresh} toast={toast} isOfficer={isOfficer} onPlanCreated={() => { refresh(); setTab('plan'); }} />}
            {tab === 'activity' && <ActivityPage entries={audit?.events ?? audit ?? []} loading={auditLoading} onRefresh={loadAudit} total={audit?.total} />}
          </>
        )}

      </main>

      {openCode && <TrainDrawer code={openCode} initialAssignment={requestedAssignment} isOfficer={isOfficer} strategy={data?.plan?.strategy || data?.strategies?.[0]?.id || 'safest'} hasPlan={Boolean(data?.plan)} onClose={closeTrain} onChanged={refresh} toast={toast} />}
      <Toast toast={toastState} />
    </div>
  )
}

function ActivityPage({ entries, loading, onRefresh, total }) {
  const humanize = (action) => action.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
  return <section className="page-enter space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-xl font-bold text-slate-900">Operations activity</h2>
        <p className="text-sm text-slate-500">Recent plan decisions and fault updates, with who made each change.</p></div>
      <Btn kind="ghost" onClick={onRefresh} disabled={loading}>{loading ? 'Loading…' : '↻ Refresh log'}</Btn>
    </div>
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {loading && !entries.length ? <Spinner text="Loading activity…" /> : entries.length ? <ul className="divide-y divide-slate-100">
        {entries.map((event) => <li key={event.id} className="flex flex-wrap items-start gap-3 px-5 py-4">
          <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-orange-500" />
          <div className="min-w-0 flex-1"><p className="font-semibold text-slate-900">{humanize(event.action)} <span className="font-normal text-slate-500">· {event.entity_id || event.entity}</span></p>
            <p className="mt-1 text-sm text-slate-600">{event.details?.description || event.details?.notes || event.details?.strategy || ''}</p>
            <p className="mt-1 text-xs text-slate-500">{event.actor} · {new Date(event.occurred_at).toLocaleString()}</p></div>
        </li>)}
      </ul> : <p className="p-8 text-center text-sm text-slate-500">No recorded activity yet. New plan and fault actions will appear here.</p>}
    </div>
    <p className="text-xs text-slate-500">Showing latest 100 of {total ?? '…'} total events.</p>
  </section>
}
