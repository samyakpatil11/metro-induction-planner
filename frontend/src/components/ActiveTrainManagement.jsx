import React, { useMemo, useState } from 'react'
import { api } from '../api'
import { Btn, Card, Chip, StatusChip, RiskChip } from './ui'

const ASSIGNMENTS = [
  { key: 'service', label: 'In service', short: 'Run', active: 'border-orange-300 bg-orange-100 text-orange-900', tone: 'bg-orange-500' },
  { key: 'standby', label: 'Standby', short: 'Rest', active: 'border-slate-300 bg-slate-100 text-slate-800', tone: 'bg-slate-400' },
  { key: 'maintenance', label: 'Maintenance', short: 'Repair', active: 'border-amber-300 bg-amber-100 text-amber-900', tone: 'bg-amber-500' },
]

export default function ActiveTrainManagement({
  trains = [],
  openTrain,
  isOfficer,
  strategy = 'safest',
  refresh,
  toast,
}) {
  const [search, setSearch] = useState('')
  const [lineFilter, setLineFilter] = useState('all')
  const [assignmentFilter, setAssignmentFilter] = useState('all')
  const [attentionOnly, setAttentionOnly] = useState(false)
  const [selectedCodes, setSelectedCodes] = useState([])
  const [bulkStatus, setBulkStatus] = useState('standby')
  const [bulkPreview, setBulkPreview] = useState(null)
  const [bulkBusy, setBulkBusy] = useState(false)

  const isAttention = (t) =>
    t.cert_days_left <= 10 || t.serious_faults > 0 || t.km_since_overhaul >= 22500 || t.risk_level === 'high'

  const attentionTotal = useMemo(() => trains.filter(isAttention).length, [trains])

  const counts = useMemo(() => {
    return {
      total: trains.length,
      service: trains.filter((t) => t.tonight === 'service').length,
      standby: trains.filter((t) => t.tonight === 'standby').length,
      maintenance: trains.filter((t) => t.tonight === 'maintenance').length,
    }
  }, [trains])

  const visibleTrains = useMemo(() => {
    return trains
      .filter((t) => {
        const matchSearch =
          !search.trim() ||
          t.code.toLowerCase().includes(search.toLowerCase()) ||
          (t.depot && t.depot.toLowerCase().includes(search.toLowerCase())) ||
          (t.line_name && t.line_name.toLowerCase().includes(search.toLowerCase()))
        const matchLine = lineFilter === 'all' || t.line === lineFilter
        const matchAssignment = assignmentFilter === 'all' || t.tonight === assignmentFilter
        const matchAttention = !attentionOnly || isAttention(t)
        return matchSearch && matchLine && matchAssignment && matchAttention
      })
      .sort((a, b) => a.code.localeCompare(b.code))
  }, [trains, search, lineFilter, assignmentFilter, attentionOnly])

  const toggleSelect = (code, checked) => {
    setSelectedCodes((curr) =>
      checked ? [...new Set([...curr, code])] : curr.filter((c) => c !== code)
    )
    setBulkPreview(null)
  }

  const selectAllVisible = () => {
    setSelectedCodes(visibleTrains.map((t) => t.code))
    setBulkPreview(null)
  }

  const clearSelection = () => {
    setSelectedCodes([])
    setBulkPreview(null)
  }

  const previewBulk = async () => {
    if (!selectedCodes.length) return
    setBulkBusy(true)
    try {
      const changes = Object.fromEntries(selectedCodes.map((c) => [c, bulkStatus]))
      const preview = await api.previewPlan({ strategy, changes })
      setBulkPreview(preview)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBulkBusy(false)
    }
  }

  const createBulkPlan = async () => {
    if (!bulkPreview) return
    setBulkBusy(true)
    try {
      const changes = Object.fromEntries(selectedCodes.map((c) => [c, bulkStatus]))
      await api.createPlan({ strategy, changes })
      toast(`Proposed plan created with ${selectedCodes.length} bulk assignments!`)
      setBulkPreview(null)
      setSelectedCodes([])
      refresh()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBulkBusy(false)
    }
  }

  return (
    <div className="page-enter space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-900">
            Active Train Management
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Monitor, stage, and assign individual or bulk status allocations for tonight&apos;s shift with real-time safety constraint verification.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">
            <span className="size-2 rounded-full bg-orange-500" />
            <span>Service: <b>{counts.service}</b></span>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">
            <span className="size-2 rounded-full bg-slate-400" />
            <span>Standby: <b>{counts.standby}</b></span>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">
            <span className="size-2 rounded-full bg-amber-500" />
            <span>Maintenance: <b>{counts.maintenance}</b></span>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">
            <span className="size-2 rounded-full bg-rose-500" />
            <span>Alerts: <b>{attentionTotal}</b></span>
          </div>
        </div>
      </div>

      {/* Controls & Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2.5">
          <input
            type="text"
            placeholder="Search train, depot, or line…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium outline-none transition focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-100 sm:w-64"
          />
          <select
            value={lineFilter}
            onChange={(e) => setLineFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-orange-400"
          >
            <option value="all">All Lines</option>
            <option value="line_1">Line 1 (Orange)</option>
            <option value="line_2">Line 2 (Aqua)</option>
            <option value="spare">Spare Fleet</option>
          </select>
          <select
            value={assignmentFilter}
            onChange={(e) => setAssignmentFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-orange-400"
          >
            <option value="all">All Statuses</option>
            <option value="service">In Service</option>
            <option value="standby">Standby</option>
            <option value="maintenance">Maintenance</option>
          </select>
          <button
            type="button"
            onClick={() => setAttentionOnly((v) => !v)}
            className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
              attentionOnly
                ? 'border-amber-400 bg-amber-50 text-amber-900 shadow-sm'
                : 'border-slate-200 bg-white text-slate-600 hover:border-amber-300 hover:bg-amber-50/50'
            }`}
          >
            ⚠️ {attentionOnly ? 'Showing Attention Needed' : `Needs Attention (${attentionTotal})`}
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>Showing <b>{visibleTrains.length}</b> of <b>{trains.length}</b> trains</span>
          {isOfficer && (
            <>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={selectAllVisible}
                className="font-bold text-orange-700 hover:underline"
              >
                Select all ({visibleTrains.length})
              </button>
              {selectedCodes.length > 0 && (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="font-semibold text-slate-500 hover:underline"
                >
                  Clear ({selectedCodes.length})
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Bulk Assignment Panel (Officer Only) */}
      {isOfficer && selectedCodes.length > 0 && (
        <Card className="border-orange-200 bg-orange-50/40 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wider text-orange-950">
                Bulk Status Assignment
              </p>
              <p className="text-xs text-slate-600">
                <b>{selectedCodes.length} trains selected:</b> {selectedCodes.join(', ')}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={bulkStatus}
                onChange={(e) => {
                  setBulkStatus(e.target.value)
                  setBulkPreview(null)
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800"
              >
                <option value="service">Set to: In service</option>
                <option value="standby">Set to: Standby</option>
                <option value="maintenance">Set to: Maintenance</option>
              </select>
              <Btn
                onClick={previewBulk}
                disabled={bulkBusy}
                className="text-xs !py-2"
              >
                {bulkBusy ? 'Evaluating…' : 'Preview Safety & Rules'}
              </Btn>
              <button
                type="button"
                onClick={clearSelection}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>

          {/* Bulk Preview Output */}
          {bulkPreview && (
            <div className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900">
                  Simulation Outcome: {bulkPreview.changes.length} assignment shifts
                </span>
                <span className="text-[11px] text-slate-500">
                  Optimizer Strategy: {strategy}
                </span>
              </div>
              <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
                {selectedCodes.map((code) => {
                  const entry = bulkPreview.entries.find((e) => e.code === code)
                  const matches = entry?.assignment === bulkStatus
                  return (
                    <div key={code} className="flex items-center justify-between py-1.5">
                      <span className="font-mono font-bold text-slate-800">{code}</span>
                      <span className={matches ? 'font-semibold text-emerald-700' : 'font-semibold text-rose-700'}>
                        {matches
                          ? `Assigned to ${bulkStatus} ✓`
                          : `Refused: assigned to ${entry?.assignment || 'none'} (violates safety or depot capacity)`}
                      </span>
                    </div>
                  )
                })}
              </div>

              {bulkPreview.summary.warnings.length > 0 && (
                <div className="rounded-lg bg-amber-50 p-2 text-amber-800">
                  {bulkPreview.summary.warnings.map((w, i) => (
                    <p key={i}>⚠️ {w}</p>
                  ))}
                </div>
              )}

              <div className="pt-2">
                <Btn
                  onClick={createBulkPlan}
                  disabled={bulkBusy}
                  className="w-full text-xs !py-2.5"
                >
                  {bulkBusy ? 'Saving Plan…' : 'Apply Assignments to Proposed Plan'}
                </Btn>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Train Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visibleTrains.map((train) => {
          const currentAssignment = ASSIGNMENTS.find((a) => a.key === train.tonight)
          const certExpiring = train.cert_days_left <= 10
          const certExpired = train.cert_days_left <= 0
          const hasSerious = train.serious_faults > 0
          const isSelected = selectedCodes.includes(train.code)

          return (
            <Card
              key={train.code}
              className={`relative overflow-hidden transition-all duration-200 hover:shadow-md ${
                isSelected ? 'ring-2 ring-orange-500' : ''
              }`}
            >
              <div className="p-4 space-y-3">
                {/* Header Row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {isOfficer && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => toggleSelect(train.code, e.target.checked)}
                        className="size-4 rounded accent-orange-600"
                        aria-label={`Select ${train.code}`}
                      />
                    )}
                    <div>
                      <button
                        type="button"
                        onClick={() => openTrain(train.code)}
                        className="font-mono text-base font-black text-slate-900 hover:text-orange-700 text-left"
                      >
                        {train.code}
                      </button>
                      <p className="text-[11px] text-slate-500">
                        {train.line_name}
                      </p>
                    </div>
                  </div>
                  <Chip className={currentAssignment?.active || 'border-slate-200 bg-slate-50 text-slate-600'}>
                    {currentAssignment?.label || 'No plan'}
                  </Chip>
                </div>

                {/* Depot & Stabling */}
                <div className="rounded-lg bg-slate-50 p-2 text-xs space-y-1">
                  <div className="flex justify-between text-slate-600">
                    <span>Depot</span>
                    <span className="font-semibold text-slate-800">{train.depot.split(' ')[0]}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Track / Pos</span>
                    <span className="font-mono font-semibold text-slate-800">{train.track} (Pos {train.track_position})</span>
                  </div>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg border border-slate-100 p-2">
                    <p className="text-[10px] uppercase font-bold text-slate-400">Cert Expiry</p>
                    <p className={`font-semibold font-mono ${certExpired ? 'text-rose-700' : certExpiring ? 'text-amber-700' : 'text-slate-800'}`}>
                      {certExpired ? 'EXPIRED' : `${train.cert_days_left}d left`}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-100 p-2">
                    <p className="text-[10px] uppercase font-bold text-slate-400">Risk</p>
                    <p className="font-semibold font-mono text-slate-800">
                      {Math.round(train.risk * 100)}%
                    </p>
                  </div>
                </div>

                {/* Faults Badge if any */}
                {(train.open_faults > 0 || hasSerious) && (
                  <div className={`rounded-md p-1.5 text-[11px] font-semibold flex items-center justify-between ${
                    hasSerious ? 'bg-rose-50 text-rose-800 border border-rose-200' : 'bg-amber-50 text-amber-800 border border-amber-200'
                  }`}>
                    <span>{hasSerious ? '⚠️ Critical Fault Open' : 'Minor Fault Report'}</span>
                    <span className="font-mono">{train.open_faults} open</span>
                  </div>
                )}

                {/* Quick Action Assignment Buttons */}
                <div className="pt-2 border-t border-slate-100 space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Quick Re-assign
                  </p>
                  <div className="grid grid-cols-3 gap-1">
                    {ASSIGNMENTS.map((a) => (
                      <button
                        key={a.key}
                        type="button"
                        disabled={!isOfficer}
                        onClick={() => openTrain(train.code, a.key)}
                        className={`rounded-md border py-1 text-center text-xs font-bold transition ${
                          train.tonight === a.key
                            ? a.active
                            : 'border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-800'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                        title={isOfficer ? `Assign ${train.code} to ${a.label}` : 'Read-only access'}
                      >
                        {a.short}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Inspect Details Button */}
                <button
                  type="button"
                  onClick={() => openTrain(train.code)}
                  className="w-full text-center text-[11px] font-semibold text-slate-500 hover:text-orange-700 pt-1"
                >
                  View full logs & history →
                </button>
              </div>
            </Card>
          )
        })}
      </div>

      {visibleTrains.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
          <p className="text-base font-semibold">No trains matched your filter criteria.</p>
          <p className="mt-1 text-xs text-slate-400">Try adjusting your line or status filters.</p>
        </div>
      )}
    </div>
  )
}
