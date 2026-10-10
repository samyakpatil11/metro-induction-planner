import React, { useState, useMemo } from 'react'

const LINES = {
  line_1: 'Line 1 (Orange)',
  line_2: 'Line 2 (Aqua)',
  spare: 'Spare',
}

const STATUS_CONFIG = {
  service: { label: 'In service', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  maintenance: { label: 'Maintenance', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  standby: { label: 'Standby', cls: 'bg-slate-100 text-slate-700 border-slate-300' },
}

const RISK_CONFIG = {
  low: { label: 'Low risk', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', bar: 'bg-emerald-500' },
  medium: { label: 'Medium risk', cls: 'bg-amber-50 text-amber-700 border-amber-200', bar: 'bg-amber-500' },
  high: { label: 'High risk', cls: 'bg-rose-50 text-rose-700 border-rose-200', bar: 'bg-rose-500' },
}

export function KmBar({ km, limit = 25000 }) {
  const pct = Math.min(100, (km / limit) * 100)
  const barColor = km >= limit ? 'bg-rose-500' : km >= 22500 ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div className="w-36">
      <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-slate-500">
        <span className="font-mono tracking-tight tabular-nums">{km.toLocaleString()}</span> of <span className="font-mono tracking-tight tabular-nums">{limit.toLocaleString()}</span> km
      </p>
    </div>
  )
}

export default function DashboardTable({
  trains = [],
  data,
  openTrain,
  onRowClick,
  isOfficer = false,
  search: controlledSearch,
  onSearchChange,
  sort: controlledSort,
  onSortChange,
  filter: controlledFilter,
  onFilterChange,
  className = '',
}) {
  const rawList = data || trains

  const [internalSearch, setInternalSearch] = useState('')
  const [internalSort, setInternalSort] = useState('code')
  const [internalFilter, setInternalFilter] = useState('all')

  const search = controlledSearch !== undefined ? controlledSearch : internalSearch
  const sort = controlledSort !== undefined ? controlledSort : internalSort
  const filter = controlledFilter !== undefined ? controlledFilter : internalFilter

  const handleSearchChange = (val) => {
    if (onSearchChange) onSearchChange(val)
    else setInternalSearch(val)
  }

  const handleSortChange = (val) => {
    if (onSortChange) onSortChange(val)
    else setInternalSort(val)
  }

  const handleFilterChange = (val) => {
    if (onFilterChange) onFilterChange(val)
    else setInternalFilter(val)
  }

  const handleRowClick = (code) => {
    if (openTrain) openTrain(code)
    else if (onRowClick) onRowClick(code)
  }

  const filteredAndSortedTrains = useMemo(() => {
    return rawList
      .filter((t) => {
        const matchesFilter = filter === 'all' || t.line === filter
        const matchesSearch =
          !search.trim() ||
          t.code.toLowerCase().includes(search.toLowerCase()) ||
          (t.partner && t.partner.toLowerCase().includes(search.toLowerCase())) ||
          (t.depot && t.depot.toLowerCase().includes(search.toLowerCase()))
        return matchesFilter && matchesSearch
      })
      .sort((a, b) => {
        if (sort === 'risk') return b.risk - a.risk
        if (sort === 'cert') return a.cert_days_left - b.cert_days_left
        return a.code.localeCompare(b.code)
      })
  }, [rawList, filter, search, sort])

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Table Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          ['all', 'All fleet'],
          ['line_1', 'Line 1 (Orange)'],
          ['line_2', 'Line 2 (Aqua)'],
          ['spare', 'Spares'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => handleFilterChange(key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150 ${
              filter === key
                ? 'bg-slate-900 text-white shadow-sm'
                : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            {label}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search e.g. NMR-05"
            className="w-48 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
          />

          <select
            value={sort}
            onChange={(e) => handleSortChange(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
          >
            <option value="code">Sort: Train ID</option>
            <option value="risk">Sort: Highest risk</option>
            <option value="cert">Sort: Certificate ending</option>
          </select>
        </div>
      </div>

      {/* Surface Card with Table */}
      <section className="rounded-2xl border border-white/[0.08] border-t-white/15 bg-white shadow-sm overflow-hidden transition-[border-color,box-shadow] duration-200 hover:border-white/20 hover:shadow-md">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Train</th>
                <th className="px-4 py-3">Line</th>
                <th className="px-4 py-3">Tonight</th>
                <th className="px-4 py-3">Breakdown Risk</th>
                <th className="px-4 py-3">Fitness Certificate</th>
                <th className="px-4 py-3">Since Overhaul</th>
                <th className="px-4 py-3">Open Faults</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAndSortedTrains.map((t) => {
                const tonightStatus = t.tonight || t.status
                const statusInfo = tonightStatus ? STATUS_CONFIG[tonightStatus] : null
                const riskInfo = RISK_CONFIG[t.risk_level] || RISK_CONFIG.low

                return (
                  <tr
                    key={t.code}
                    onClick={() => handleRowClick(t.code)}
                    className="cursor-pointer transition-colors duration-150 hover:bg-orange-50/50"
                  >
                    {/* Train Code */}
                    <td className="px-4 py-3 font-bold font-mono tracking-tight text-orange-700">
                      {t.code}
                      {t.partner && (
                        <span className="ml-2 inline-block rounded border border-orange-200/80 bg-orange-50 px-1.5 py-0.5 text-[10px] font-medium text-orange-800">
                          {t.partner}
                        </span>
                      )}
                    </td>

                    {/* Line */}
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {LINES[t.line] || t.line}
                    </td>

                    {/* Assignment Status Chip */}
                    <td className="px-4 py-3">
                      {statusInfo ? (
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${statusInfo.cls}`}
                        >
                          {statusInfo.label}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-500 whitespace-nowrap">
                          No plan
                        </span>
                      )}
                    </td>

                    {/* Breakdown Risk Chip */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${riskInfo.cls}`}
                      >
                        <span className={`size-1.5 rounded-full ${riskInfo.bar}`} />
                        {riskInfo.label} · <span className="font-mono tracking-tight tabular-nums">{Math.round(t.risk * 100)}%</span>
                      </span>
                    </td>

                    {/* Fitness Certificate */}
                    <td className="px-4 py-3 text-sm">
                      {t.cert_days_left < 0 ? (
                        <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 whitespace-nowrap">
                          Expired <span className="font-mono tracking-tight tabular-nums">{-t.cert_days_left}</span>d ago
                        </span>
                      ) : (
                        <span
                          className={
                            t.cert_days_left <= 10
                              ? 'font-bold text-amber-800'
                              : 'text-slate-700'
                          }
                        >
                          <span className="font-mono tracking-tight tabular-nums">{t.cert_days_left}</span> days left
                        </span>
                      )}
                    </td>

                    {/* Mileage / Overhaul Progress */}
                    <td className="px-4 py-3">
                      <KmBar km={t.km_since_overhaul} />
                    </td>

                    {/* Open Faults */}
                    <td className="px-4 py-3 text-sm">
                      {t.serious_faults > 0 ? (
                        <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 whitespace-nowrap">
                          <span className="font-mono tracking-tight tabular-nums">{t.serious_faults}</span> serious
                        </span>
                      ) : t.open_faults > 0 ? (
                        <span className="text-slate-700 font-medium">
                          <span className="font-mono tracking-tight tabular-nums">{t.open_faults}</span> minor
                        </span>
                      ) : (
                        <span className="text-slate-400">None</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {filteredAndSortedTrains.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-500">
              No trains match the selected criteria.
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
