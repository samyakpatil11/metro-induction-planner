import React, { useMemo } from 'react'
import { Btn, Card, Chip, fmtTime } from './ui'

const LEVEL = {
  critical: { label: 'Urgent', cls: 'border-rose-200 bg-rose-50', chip: 'bg-rose-100 text-rose-800 border-rose-200' },
  warning: { label: 'Watch', cls: 'border-amber-200 bg-amber-50', chip: 'bg-amber-100 text-amber-800 border-amber-200' },
  info: { label: 'Info', cls: 'border-sky-200 bg-sky-50', chip: 'bg-sky-100 text-sky-800 border-sky-200' },
}

export default function Overview({ overview, trains = [], goTo, openTrain }) {
  const { plan, alerts, alert_counts: counts } = overview
  const planCounts = plan?.summary?.counts || { service: 0, standby: 0, maintenance: 0 }
  const coverage = plan?.summary?.coverage || {}
  const attentionCount = trains.filter((train) => train.cert_days_left <= 10 || train.serious_faults > 0 || train.km_since_overhaul >= 22500 || train.risk_level === 'high').length

  const service1 = trains.filter((t) => t.tonight === 'service' && (t.serves === 'line_1' || t.line === 'line_1'))
  const service2 = trains.filter((t) => t.tonight === 'service' && (t.serves === 'line_2' || t.line === 'line_2'))
  const standby = trains.filter((t) => t.tonight === 'standby')
  const maintenance = trains.filter((t) => t.tonight === 'maintenance')

  const fleetTotal = trains.length || 23
  const servicePercent = Math.round((planCounts.service / Math.max(1, fleetTotal)) * 100)
  const riskCounts = {
    low: trains.filter((t) => t.risk_level === 'low').length,
    medium: trains.filter((t) => t.risk_level === 'medium').length,
    high: trains.filter((t) => t.risk_level === 'high').length,
  }

  const modelMetrics = overview?.risk_model_metrics

  const headline = useMemo(() => {
    if (!plan) return ['No induction plan yet', 'Create a proposed plan for tonight’s shift.', 'border-slate-200 bg-white']
    if (plan.status === 'approved') return ['Tonight’s plan is approved', `Confirmed by ${plan.decided_by} on ${fmtTime(plan.decided_at)}.`, 'border-emerald-200 bg-emerald-50/70']
    if (plan.status === 'rejected') return ['Tonight’s plan was rejected', `Rejected by ${plan.decided_by}. Reason: "${plan.notes || 'No note'}"`, 'border-rose-200 bg-rose-50/70']
    return ['Plan proposed · awaiting approval', 'A proposed allocation is staged. An officer must review and approve it.', 'border-orange-200 bg-orange-50/80']
  }, [plan])

  return (
    <div className="page-enter space-y-6">
      {/* Hero Command Banner */}
      <section className="command-hero relative isolate overflow-hidden rounded-3xl p-5 text-white shadow-xl sm:p-7 lg:p-8">
        <div className="command-hero__glow" aria-hidden="true" />
        <div className="relative z-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(290px,.82fr)] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-orange-200 backdrop-blur-md">
                <span className="signal-live size-2 rounded-full bg-orange-400" /> Night induction window
              </span>
              <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-white/70">
                Shift ends 05:30 IST
              </span>
            </div>
            <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl lg:text-4xl">
              Night Operations Command
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/75 sm:text-base">
              Nagpur Metro Rail fleet allocations for passenger service, reserve standby, and depot maintenance bays.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Btn onClick={() => goTo('plan')}>
                {plan?.status === 'proposed' ? 'Review & approve plan' : 'View tonight’s plan'} →
              </Btn>
              <button
                type="button"
                onClick={() => goTo('active_trains')}
                className="rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs font-bold text-white backdrop-blur-md transition hover:bg-white/20"
              >
                Active Train Management →
              </button>
            </div>
          </div>

          <div className="command-routes rounded-2xl border border-white/10 bg-black/20 p-4 sm:p-5 backdrop-blur-sm">
            <div className="mb-4 flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[.18em] text-white/55">Tonight’s corridors</p>
              <span className="text-[10px] text-white/45">{fleetTotal} fleet units</span>
            </div>
            <RouteStatus color="orange" name="LINE 1" text="Orange corridor" have={coverage.line_1?.have || 0} need={coverage.line_1?.need || 8} />
            <RouteStatus color="aqua" name="LINE 2" text="Aqua corridor" have={coverage.line_2?.have || 0} need={coverage.line_2?.need || 8} />
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/10 pt-4">
              <HeroMetric label="Running" value={planCounts.service} color="text-orange-200" />
              <HeroMetric label="Standby" value={planCounts.standby} color="text-slate-100" />
              <HeroMetric label="In repair" value={planCounts.maintenance} color="text-amber-200" />
            </div>
          </div>
        </div>
      </section>

      {/* Plan Staging Alert Banner */}
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${headline[2]}`}>
        <div className="flex items-start gap-3">
          <span className="mt-1 size-2.5 shrink-0 rounded-full bg-orange-500" />
          <div>
            <p className="font-bold text-slate-900">{headline[0]}</p>
            <p className="mt-0.5 text-sm text-slate-600">{headline[1]}</p>
          </div>
        </div>
        <Btn className="shrink-0" onClick={() => goTo('plan')}>
          {plan?.status === 'proposed' ? 'Review plan' : 'Open plan'} <span className="ml-1" aria-hidden="true">→</span>
        </Btn>
      </div>

      {/* Grid Row 1: Line Readiness & Notifications */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="LINE READINESS" subtitle="Service coverage against tonight’s requirement" className="dashboard-panel">
          <div className="space-y-4 p-4 pt-2">
            <CoverageRow title="Line 1 · Orange" have={coverage.line_1?.have || 0} need={coverage.line_1?.need || 8} trains={service1} onTrain={openTrain} tone="bg-orange-500" />
            <CoverageRow title="Line 2 · Aqua" have={coverage.line_2?.have || 0} need={coverage.line_2?.need || 8} trains={service2} onTrain={openTrain} tone="bg-teal-700" />
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
              <Legend color="bg-orange-500" label="Passenger service" />
              <Legend color="bg-slate-400" label="Standby" />
              <Legend color="bg-amber-500" label="Maintenance" />
            </div>
          </div>
        </Card>

        <Card title="OPERATIONAL NOTIFICATIONS" subtitle={`${alerts.length} items · critical issues first`} className="dashboard-panel">
          <div className="flex gap-2 px-4 pb-3 pt-1">
            <AlertCount label="Urgent" value={counts.critical} tone="text-rose-700" />
            <AlertCount label="Watch" value={counts.warning} tone="text-amber-700" />
            <AlertCount label="Info" value={counts.info} tone="text-slate-600" />
          </div>
          <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto border-t border-slate-100 px-4">
            {alerts.length === 0 ? (
              <li className="py-4 text-sm text-emerald-700">All clear. No open alerts.</li>
            ) : (
              alerts.slice(0, 5).map((alert, index) => (
                <li key={`${alert.train || 'plan'}-${alert.title}-${index}`} className="flex items-start gap-2 py-2.5">
                  <span className={`mt-0.5 size-2 shrink-0 rounded-full ${alert.level === 'critical' ? 'bg-rose-500' : alert.level === 'warning' ? 'bg-amber-500' : 'bg-sky-500'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {alert.train && (
                        <button onClick={() => openTrain(alert.train)} className="text-xs font-bold text-orange-800 hover:underline">
                          {alert.train}
                        </button>
                      )}
                      <span className="text-xs font-semibold text-slate-800">{alert.title}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-500">{alert.detail}</p>
                  </div>
                </li>
              ))
            )}
          </ul>
          {alerts.length > 5 && (
            <button type="button" onClick={() => goTo('trains')} className="w-full border-t border-slate-100 px-4 py-2 text-left text-xs font-semibold text-orange-800 hover:bg-orange-50">
              View {alerts.length - 5} more alerts →
            </button>
          )}
        </Card>
      </div>

      {/* Grid Row 2: Live Fleet Deployment (Full Width) */}
      <Card title="LIVE FLEET DEPLOYMENT" subtitle="Assignment schematic · not to scale" right={<span className="text-xs text-slate-500">Click a train for details</span>} className="dashboard-panel">
        <div className="space-y-4 p-4 pt-2">
          <DeploymentLane title="LINE 1" subtitle="Orange corridor" trains={service1} coverage={coverage.line_1} onTrain={openTrain} tone="border-orange-500 bg-orange-500" />
          <DeploymentLane title="LINE 2" subtitle="Aqua corridor" trains={service2} coverage={coverage.line_2} onTrain={openTrain} tone="border-teal-700 bg-teal-700" />
          <div className="grid gap-4 border-t border-slate-100 pt-3 sm:grid-cols-2">
            <TrainGroup title="STANDBY / RESERVE" trains={standby} onTrain={openTrain} dot="bg-slate-400" />
            <TrainGroup title="MAINTENANCE BAY" trains={maintenance} onTrain={openTrain} dot="bg-amber-500" />
          </div>
        </div>
      </Card>

      {/* Grid Row 3: Fleet Summary & Active Management Quick Portal */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <Card title="FLEET RISK & HEALTH PROFILE" subtitle="Current plan distribution and breakdown risk" className="dashboard-panel">
          <div className="grid gap-5 p-4 sm:grid-cols-[minmax(170px,0.75fr)_minmax(0,1fr)]">
            <div className="flex items-center gap-4 border-b border-slate-100 pb-4 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-5">
              <div className="fleet-donut grid size-24 shrink-0 place-items-center rounded-full" style={{ '--service-angle': `${servicePercent * 3.6}deg` }} aria-label={`${servicePercent}% of fleet in service`}>
                <div className="grid size-[4.25rem] place-items-center rounded-full bg-white text-center">
                  <span className="text-xl font-bold leading-none text-slate-900 font-mono tracking-tight tabular-nums">{servicePercent}%</span>
                  <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">in service</span>
                </div>
              </div>
              <div className="space-y-1.5 text-xs">
                <MiniCount label="In service" value={planCounts.service} tone="bg-orange-500" />
                <MiniCount label="Standby" value={planCounts.standby} tone="bg-slate-400" />
                <MiniCount label="Maintenance" value={planCounts.maintenance} tone="bg-amber-500" />
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Breakdown risk · next 7 days</p>
                {modelMetrics?.accuracy && (
                  <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold font-mono text-emerald-800 border border-emerald-200">
                    Accuracy: {Math.round(modelMetrics.accuracy * 100)}%
                  </span>
                )}
              </div>
              <div className="space-y-2.5">
                <RiskBar label="Low" value={riskCounts.low} total={fleetTotal} tone="bg-emerald-600" />
                <RiskBar label="Medium" value={riskCounts.medium} total={fleetTotal} tone="bg-amber-500" />
                <RiskBar label="High" value={riskCounts.high} total={fleetTotal} tone="bg-rose-500" />
              </div>
            </div>
          </div>
        </Card>

        {/* Portal card to Active Train Management in Upper Bar */}
        <Card title="ACTIVE TRAIN MANAGEMENT" subtitle="Quick access to fleet workspace" className="dashboard-panel flex flex-col justify-between">
          <div className="p-4 space-y-3">
            <p className="text-xs leading-relaxed text-slate-600">
              Active train staging, quick single-unit status adjustments, and multi-train bulk assignments are accessible directly from the upper content bar.
            </p>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Units needing attention:</span>
                <span className="font-bold text-amber-800 font-mono">{attentionCount} units</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Service ready:</span>
                <span className="font-bold text-emerald-800 font-mono">{planCounts.service} / 16 target</span>
              </div>
            </div>
          </div>
          <div className="p-4 pt-0">
            <button
              type="button"
              onClick={() => goTo('active_trains')}
              className="w-full rounded-xl bg-slate-900 py-3 text-center text-xs font-bold text-white transition hover:bg-slate-800 shadow-sm"
            >
              Open Active Train Management Workspace →
            </button>
          </div>
        </Card>
      </div>
    </div>
  )
}

function CoverageRow({ title, have, need, trains, onTrain, tone }) {
  const percent = Math.min(100, Math.round((have / Math.max(1, need)) * 100))
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
        <span className="font-bold text-slate-800">{title}</span>
        <span className={`font-bold font-mono ${have < need ? 'text-rose-700' : 'text-emerald-700'}`}>
          {have} / {need} units
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full transition-[width] duration-500 ${tone}`} style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {trains.length ? (
          trains.map((train) => (
            <button key={train.code} onClick={() => onTrain(train.code)} className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-bold font-mono text-slate-700 hover:border-orange-300 hover:text-orange-800">
              {train.code}
            </button>
          ))
        ) : (
          <span className="text-[10px] text-slate-400">No units assigned</span>
        )}
      </div>
    </div>
  )
}

function RouteStatus({ color, name, text, have, need }) {
  const healthy = have >= need
  return (
    <div className="route-status grid grid-cols-[82px_minmax(0,1fr)_48px] items-center gap-3 py-2.5">
      <div>
        <p className="text-[11px] font-bold tracking-wide text-white">{name}</p>
        <p className="text-[9px] text-white/45">{text}</p>
      </div>
      <div className={`route-rail route-rail--${color}`} aria-hidden="true">
        <span className="route-rail__ties" />
        <svg className="route-train" viewBox="0 0 44 24" fill="none">
          <path d="M5 18V9a5 5 0 0 1 5-5h24a6 6 0 0 1 6 6v8H5Z" fill="currentColor"/>
          <path d="M11 7h7v6H9V9a2 2 0 0 1 2-2Zm9 0h7v6h-7V7Zm9 0h5a3 3 0 0 1 3 3v3h-8V7Z" fill="#fff8ef"/>
          <path d="M3 18h39v2H3z" fill="#173b38"/>
          <circle cx="13" cy="20" r="2" fill="#173b38"/>
          <circle cx="33" cy="20" r="2" fill="#173b38"/>
        </svg>
      </div>
      <p className={`text-right text-xs font-bold font-mono tracking-tight tabular-nums ${healthy ? 'text-emerald-200' : 'text-amber-200'}`}>
        {have}<span className="font-normal text-white/45">/{need}</span>
      </p>
    </div>
  )
}

function HeroMetric({ label, value, color }) {
  return (
    <div>
      <p className={`font-mono text-xl font-bold tracking-tight tabular-nums ${color}`}>{value}</p>
      <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/45">{label}</p>
    </div>
  )
}

function DeploymentLane({ title, subtitle, trains, coverage, onTrain, tone }) {
  return (
    <div className="grid gap-3 sm:grid-cols-[100px_minmax(0,1fr)] sm:items-center">
      <div>
        <p className="text-xs font-bold text-slate-900">{title}</p>
        <p className="text-[10px] text-slate-500">{subtitle}</p>
        <p className="mt-1 text-[10px] font-semibold text-slate-600">
          <span className="font-mono tracking-tight tabular-nums">{coverage?.have || 0}</span> / <span className="font-mono tracking-tight tabular-nums">{coverage?.need || 8}</span> in service
        </p>
      </div>
      <div className="relative flex min-h-14 flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
        <div className={`absolute left-3 right-3 top-1/2 h-1 -translate-y-1/2 rounded-full opacity-30 ${tone.split(' ')[1]}`} />
        {trains.map((train) => (
          <button key={train.code} onClick={() => onTrain(train.code)} className={`relative z-10 rounded-md border bg-white px-2 py-1.5 text-[11px] font-bold font-mono tracking-tight shadow-sm transition hover:-translate-y-0.5 hover:shadow ${tone.split(' ')[0]} text-slate-800`} title={`${train.code} · ${Math.round(train.risk * 100)}% risk`}>
            {train.code}
          </button>
        ))}
        {!trains.length && <span className="relative z-10 text-xs text-slate-500">No service trains assigned</span>}
      </div>
    </div>
  )
}

function TrainGroup({ title, trains, onTrain, dot }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className={`size-2 rounded-full ${dot}`} />
        <p className="text-[10px] font-bold tracking-wide text-slate-600">
          {title} · <span className="font-mono tracking-tight tabular-nums">{trains.length}</span>
        </p>
      </div>
      <div className="flex flex-wrap gap-1">
        {trains.length ? (
          trains.map((train) => (
            <button key={train.code} onClick={() => onTrain(train.code)} className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold font-mono tracking-tight text-slate-600 hover:border-orange-300 hover:text-orange-800">
              {train.code}
            </button>
          ))
        ) : (
          <span className="text-[10px] text-slate-400">None</span>
        )}
      </div>
    </div>
  )
}

function Legend({ color, label }) {
  return <span className="inline-flex items-center gap-1"><span className={`size-2 rounded-full ${color}`} />{label}</span>
}
function AlertCount({ label, value = 0, tone }) {
  return <div className="min-w-0 flex-1 rounded-md bg-slate-50 px-2.5 py-1.5"><p className={`text-base font-bold font-mono tracking-tight tabular-nums ${tone}`}>{value}</p><p className="text-[10px] text-slate-500">{label}</p></div>
}
function MiniCount({ label, value, tone }) {
  return <p className="flex items-center gap-2"><span className={`size-2 rounded-full ${tone}`} /><span className="text-slate-600">{label}</span><b className="ml-auto text-slate-900 font-mono tracking-tight tabular-nums">{value}</b></p>
}
function RiskBar({ label, value, total, tone }) {
  return <div className="grid grid-cols-[50px_minmax(0,1fr)_24px] items-center gap-2 text-[11px]"><span className="text-slate-600">{label}</span><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${tone}`} style={{ width: `${total ? (value / total) * 100 : 0}%` }} /></div><b className="text-right text-slate-700 font-mono tracking-tight tabular-nums">{value}</b></div>
}
