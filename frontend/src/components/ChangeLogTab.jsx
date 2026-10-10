import React, { useState, useEffect } from 'react'
import { api } from '../api'
import { Card, Btn, Chip, Confirm } from './ui'

export default function ChangeLogTab({ toast, isOfficer, onResetComplete }) {
  const [logs, setLogs] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState('all')
  const [page, setPage] = useState(1)
  const pageSize = 15

  // Reset synthetic data modal
  const [resetModal, setResetModal] = useState(false)
  const [busy, setBusy] = useState(false)

  const loadLogs = async () => {
    setLoading(true)
    try {
      const typeParam = filterType === 'all' ? null : filterType
      const res = await api.changeLog(pageSize, (page - 1) * pageSize, typeParam)
      setLogs(res.logs)
      setTotal(res.total)
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLogs()
  }, [page, filterType])

  const handleResetSynthetic = async () => {
    setBusy(true)
    try {
      await api.resetSyntheticData()
      toast('Original synthetic fleet and constraints data successfully restored!')
      setResetModal(false)
      loadLogs()
      if (onResetComplete) onResetComplete()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="space-y-4">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-500">Filter Entity:</label>
          <select
            value={filterType}
            onChange={(e) => { setFilterType(e.target.value); setPage(1) }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold"
          >
            <option value="all">All Entities</option>
            <option value="train">Trains</option>
            <option value="constraint">Constraints</option>
            <option value="timetable">Timetable</option>
            <option value="station">Stations</option>
            <option value="depot_bay">Depot Bays</option>
          </select>
          <Btn kind="ghost" className="!py-1 !text-xs" onClick={loadLogs}>
            ↻ Refresh
          </Btn>
        </div>

        {isOfficer && (
          <Btn
            kind="danger"
            className="!py-1.5 !text-xs"
            onClick={() => setResetModal(true)}
          >
            🔄 Reset to Original Synthetic Data
          </Btn>
        )}
      </div>

      {/* Change Log Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm text-slate-700">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Timestamp</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Entity</th>
              <th className="px-4 py-3">ID / Code</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Old Value</th>
              <th className="px-4 py-3">New Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-400">
                  {loading ? 'Loading change log records…' : 'No modification logs found.'}
                </td>
              </tr>
            ) : (
              logs.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap font-mono tracking-tight tabular-nums">
                    {new Date(l.timestamp).toLocaleString([], {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
                    })}
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{l.user}</td>
                  <td className="px-4 py-3">
                    <Chip className="border-slate-200 bg-slate-100 text-slate-700 uppercase !text-[10px]">
                      {l.entity_type}
                    </Chip>
                  </td>
                  <td className="px-4 py-3 font-mono font-bold text-slate-900">{l.entity_id}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold ${l.action === 'create' ? 'text-emerald-700' : l.action === 'delete' ? 'text-rose-700' : 'text-orange-700'}`}>
                      {l.action}
                    </span>
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 font-mono text-xs text-slate-500" title={l.old_value}>
                    {l.old_value || '—'}
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 font-mono text-xs text-slate-900 font-semibold" title={l.new_value}>
                    {l.new_value || '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-slate-500 px-1">
        <span>Total changes logged: {total}</span>
        <div className="flex items-center gap-1">
          <Btn
            kind="ghost"
            className="!px-2.5 !py-1"
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
          >
            Previous
          </Btn>
          <span className="px-2 font-semibold text-slate-700">
            Page {page} of {totalPages}
          </span>
          <Btn
            kind="ghost"
            className="!px-2.5 !py-1"
            disabled={page >= totalPages}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          >
            Next
          </Btn>
        </div>
      </div>

      {/* Reset Confirmation */}
      {resetModal && (
        <Confirm
          title="Reset to Original Synthetic Data?"
          text="This will reset all fleet trains, constraints, presets, stations, and depot bays to the clean factory synthetic demonstration data. All manual edits and plans will be overwritten."
          confirmText="Yes, Reset Everything"
          kind="danger"
          busy={busy}
          onConfirm={handleResetSynthetic}
          onCancel={() => setResetModal(false)}
        />
      )}
    </div>
  )
}
