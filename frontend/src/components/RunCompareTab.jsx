import React, { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid
} from 'recharts'
import { api } from '../api'
import { Card, Btn, Chip, StatusChip, Spinner } from './ui'

export default function RunCompareTab({ toast, isOfficer, onPlanCreated }) {
  const [strategy, setStrategy] = useState('safest')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)
  const [conflictError, setConflictError] = useState(null)

  const handleRun = async () => {
    setRunning(true)
    setConflictError(null)
    try {
      const res = await api.scheduleRun(strategy, {}, true)
      setResult(res)
      toast('CP-SAT Optimization complete! Plan generated.')
      if (onPlanCreated) onPlanCreated()
    } catch (err) {
      setConflictError(err.message)
      toast('Scheduler run infeasible or failed.', 'error')
    } finally {
      setRunning(false)
    }
  }

  const currentSummary = result?.current_plan?.summary
  const previousSummary = result?.previous_plan?.summary
  const currentKpis = currentSummary?.kpis || {}
  const prevKpis = previousSummary?.kpis || {}

  // Compare chart data
  const compareData = [
    {
      metric: 'Service Trains',
      Current: currentKpis.trains_in_service ?? (currentSummary?.counts?.service || 0),
      Previous: prevKpis.trains_in_service ?? (previousSummary?.counts?.service || 0),
    },
    {
      metric: 'Standby Buffer',
      Current: currentKpis.trains_standby ?? (currentSummary?.counts?.standby || 0),
      Previous: prevKpis.trains_standby ?? (previousSummary?.counts?.standby || 0),
    },
    {
      metric: 'Maintenance Bays',
      Current: currentKpis.trains_maintenance ?? (currentSummary?.counts?.maintenance || 0),
      Previous: prevKpis.trains_maintenance ?? (previousSummary?.counts?.maintenance || 0),
    },
    {
      metric: 'Mileage StdDev (km)',
      Current: currentKpis.mileage_std_km ?? 0,
      Previous: prevKpis.mileage_std_km ?? 0,
    },
  ]

  return (
    <div className="space-y-6">
      {/* Run Scheduler Card */}
      <Card title="Run Metro Induction Optimizer">
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="space-y-1">
            <p className="text-sm text-slate-700">
              Trigger Google OR-Tools CP-SAT solver against all updated fleet parameters, timetable requirements, and active constraints.
            </p>
            <div className="flex items-center gap-3 pt-2">
              <span className="text-xs font-semibold text-slate-500">Optimization Goal:</span>
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800"
              >
                <option value="safest">Safest (Prioritize Low Risk)</option>
                <option value="even_wear">Even Wear (Equalize Mileage & Wear)</option>
                <option value="least_change">Least Change (Minimize Swaps)</option>
              </select>
            </div>
          </div>

          <div>
            <Btn
              kind="primary"
              onClick={handleRun}
              disabled={running || !isOfficer}
              className="!px-6 !py-3 text-base shadow-md"
            >
              {running ? 'Solving CP-SAT Model…' : '⚡ Re-run Scheduler'}
            </Btn>
          </div>
        </div>
      </Card>

      {/* Loading state indicator */}
      {running && (
        <div className="rounded-2xl border border-white/[0.08] border-t-white/15 bg-white p-8">
          <Spinner text="Solving CP-SAT combinatorial constraints with OR-Tools…" />
        </div>
      )}

      {/* Infeasibility Diagnostics */}
      {conflictError && (
        <div className="rounded-2xl border border-rose-300 bg-rose-50 p-6 text-rose-950 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-xl">🚫</span>
            <h4 className="text-base font-bold">CP-SAT Scheduling Infeasible</h4>
          </div>
          <p className="mt-2 text-sm text-rose-800">
            The solver proved mathematically that no schedule can satisfy all current hard constraints simultaneously.
          </p>
          <div className="mt-4 rounded-xl border border-rose-200 bg-white/80 p-4">
            <h5 className="text-xs font-bold uppercase tracking-wider text-rose-900">Conflicting Constraints Diagnostic</h5>
            <p className="mt-1 font-mono text-xs text-rose-950 whitespace-pre-wrap">{conflictError}</p>
          </div>
          <div className="mt-4 text-xs text-rose-700">
            💡 <b>Suggested remedy:</b> Go to the <b>Constraints</b> tab and check if service demands exceed safe fleet availability, or if depot maintenance bay limits are overly restrictive.
          </div>
        </div>
      )}

      {/* Results View */}
      {result && !running && (
        <div className="space-y-6">
          {/* KPI Dashboard Cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <span className="text-xs font-bold text-emerald-800">Revenue Service</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-extrabold text-emerald-950">
                  {currentSummary?.counts?.service || 0}
                </span>
                <span className="text-xs text-emerald-700">
                  Line 1: {currentSummary?.coverage?.line_1?.have || 0} · Line 2: {currentSummary?.coverage?.line_2?.have || 0}
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-white/[0.08] border-t-white/15 bg-slate-50 p-4">
              <span className="text-xs font-bold text-slate-600">Standby Spares</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-extrabold text-slate-800">
                  {currentSummary?.counts?.standby || 0}
                </span>
                <span className="text-xs text-slate-500">Fleet buffer</span>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <span className="text-xs font-bold text-amber-800">Depot Maintenance</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-extrabold text-amber-950">
                  {currentSummary?.counts?.maintenance || 0}
                </span>
                <span className="text-xs text-amber-700">Bay occupancy</span>
              </div>
            </div>

            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <span className="text-xs font-bold text-blue-800">Mileage StdDev</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-extrabold text-blue-950">
                  {currentKpis.mileage_std_km || 0} km
                </span>
                <span className="text-xs text-blue-700">Wear variance: {currentKpis.mileage_variance || 0}</span>
              </div>
            </div>
          </div>

          {/* Constraint Violations & Soft Warnings */}
          {((currentKpis.constraint_violations && currentKpis.constraint_violations.length > 0) || (currentSummary?.warnings && currentSummary?.warnings.length > 0)) && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
              <h4 className="font-bold">⚠️ Scheduler Observations & Soft Violations</h4>
              <ul className="mt-2 ml-5 list-disc text-xs space-y-1">
                {(currentKpis.constraint_violations || []).map((v, i) => (
                  <li key={`cv-${i}`} className="font-semibold">{v}</li>
                ))}
                {(currentSummary?.warnings || []).map((w, i) => (
                  <li key={`w-${i}`}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Side by side Plan Comparison Chart */}
          {result.previous_plan && (
            <Card title="Plan Comparison (Current vs Previous Schedule)" subtitle="Key performance metrics compared side-by-side">
              <div className="p-5">
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={compareData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="metric" stroke="#64748b" fontSize={12} />
                      <YAxis stroke="#64748b" fontSize={12} />
                      <Tooltip contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
                      <Legend />
                      <Bar dataKey="Previous" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Current" fill="#ea580c" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </Card>
          )}

          {/* New Induction Plan Table */}
          <Card title="Generated Induction Plan Table" subtitle={`${result.current_plan.entries?.length || 0} trains scheduled`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-700">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Train</th>
                    <th className="px-4 py-3">Line</th>
                    <th className="px-4 py-3">Assignment</th>
                    <th className="px-4 py-3">Revenue Corridor</th>
                    <th className="px-4 py-3">Breakdown Risk</th>
                    <th className="px-4 py-3">Scheduler Rationale</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.current_plan.entries.map((entry) => (
                    <tr key={entry.code} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-bold text-slate-900">{entry.code}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{entry.line}</td>
                      <td className="px-4 py-3">
                        <StatusChip status={entry.assignment} />
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-700">
                        {entry.serves ? (entry.serves === 'line_1' ? 'Line 1 (Orange)' : 'Line 2 (Aqua)') : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-mono font-bold text-slate-700">
                          {Math.round(entry.risk * 100)}% ({entry.risk_level})
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">{entry.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
