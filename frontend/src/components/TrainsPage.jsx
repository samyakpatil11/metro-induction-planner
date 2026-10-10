import React, { useMemo, useState } from 'react'
import { Card, Chip, StatusChip, RiskChip, LINES, Btn } from './ui'

const FILTERS = [
  ['all', 'All trains'],
  ['service', 'In service'],
  ['maintenance', 'Maintenance'],
  ['standby', 'Standby'],
  ['attention', 'Needs attention'],
]
const needsAttention = (t) => t.cert_days_left <= 10 || t.serious_faults > 0 || t.km_since_overhaul >= 22500 || t.risk_level === 'high'

export default function TrainsPage({ trains, openTrain, onExport }) {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('code')

  const shown = useMemo(() => {
    let list = trains.filter((t) => {
      if (search && !t.code.toLowerCase().includes(search.toLowerCase())) return false
      if (filter === 'attention') return needsAttention(t)
      return filter === 'all' || t.tonight === filter
    })
    const by = { code: (a, b) => a.code.localeCompare(b.code), risk: (a, b) => b.risk - a.risk, cert: (a, b) => a.cert_days_left - b.cert_days_left }
    return [...list].sort(by[sort])
  }, [trains, filter, search, sort])

  return (
    <div className="page-enter space-y-4">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold tracking-tight text-slate-900">All trains</h2>
          <Btn kind="ghost" onClick={onExport}>↓ Export fleet CSV</Btn></div>
        <p className="text-sm text-slate-500">Click any train to see its faults and why its risk is high or low. Export a current fleet snapshot for reporting.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-150 ${filter === k ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50'}`}>
            {label}
          </button>
        ))}
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search e.g. NMR-05"
          className="ml-auto w-48 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-200" />
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-200">
          <option value="code">Sort: Train number</option>
          <option value="risk">Sort: Highest risk</option>
          <option value="cert">Sort: Certificate ending soonest</option>
        </select>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">
              <tr>
                {['Train', 'Line', 'Tonight', 'Breakdown risk', 'Fitness certificate', 'Since overhaul', 'Open faults'].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((t) => (
                <tr key={t.code} onClick={() => openTrain(t.code)} className="cursor-pointer transition-colors duration-150 hover:bg-orange-50/50">
                  <td className="px-4 py-3 font-bold font-mono tracking-tight text-orange-700">{t.code}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{LINES[t.line]}</td>
                  <td className="px-4 py-3"><StatusChip status={t.tonight} /></td>
                  <td className="px-4 py-3"><RiskChip level={t.risk_level} value={t.risk} /></td>
                  <td className="px-4 py-3 text-sm">
                    {t.cert_days_left < 0
                      ? <Chip className="border-rose-200 bg-rose-50 text-rose-700">Expired <span className="font-mono tracking-tight tabular-nums">{-t.cert_days_left}</span> days ago</Chip>
                      : <span className={t.cert_days_left <= 10 ? 'font-bold text-amber-800' : 'text-slate-700'}><span className="font-mono tracking-tight tabular-nums">{t.cert_days_left}</span> days left</span>}
                  </td>
                  <td className="px-4 py-3"><KmBar km={t.km_since_overhaul} /></td>
                  <td className="px-4 py-3 text-sm">
                    {t.serious_faults > 0 ? <Chip className="border-rose-200 bg-rose-50 text-rose-700"><span className="font-mono tracking-tight tabular-nums">{t.serious_faults}</span> serious</Chip>
                      : t.open_faults > 0 ? <span className="font-medium text-slate-700"><span className="font-mono tracking-tight tabular-nums">{t.open_faults}</span> minor</span> : <span className="text-slate-400">None</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && <p className="p-8 text-center text-slate-500">No trains match.</p>}
        </div>
      </Card>
    </div>
  )
}

export function KmBar({ km, limit = 25000 }) {
  const pct = Math.min(100, (km / limit) * 100)
  const color = km >= limit ? 'bg-rose-500' : km >= 22500 ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div className="w-36">
      <div className="h-2 rounded-full bg-slate-200 overflow-hidden"><div className={`h-full rounded-full transition-all duration-300 ${color}`} style={{ width: `${pct}%` }} /></div>
      <p className="mt-1 text-xs text-slate-500"><span className="font-mono tracking-tight tabular-nums">{km.toLocaleString()}</span> of <span className="font-mono tracking-tight tabular-nums">{limit.toLocaleString()}</span> km</p>
    </div>
  )
}
