import React, { useState, useMemo, useRef } from 'react'
import { api } from '../api'
import { Card, Btn, Chip, StatusChip, Confirm } from './ui'

const STATUSES = ['service', 'standby', 'maintenance']
const LINES = [
  { id: 'line_1', label: 'Line 1 (Orange)' },
  { id: 'line_2', label: 'Line 2 (Aqua)' },
  { id: 'spare', label: 'Spare' },
]

export default function FleetAdminTab({ trains, onRefresh, toast, isOfficer }) {
  const [search, setSearch] = useState('')
  const [filterLine, setFilterLine] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterDepot, setFilterDepot] = useState('all')
  const [sortField, setSortField] = useState('code')
  const [sortAsc, setSortAsc] = useState(true)
  const [page, setPage] = useState(1)
  const pageSize = 10

  // Modals & Forms
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTrain, setEditingTrain] = useState(null)
  const [deletingTrain, setDeletingTrain] = useState(null)
  const [inlineEditing, setInlineEditing] = useState(null) // code -> field
  const [inlineValue, setInlineValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [csvBusy, setCsvBusy] = useState(false)
  const fileInputRef = useRef(null)

  // Filtering
  const filtered = useMemo(() => {
    return (trains || []).filter((t) => {
      const matchSearch =
        !search.trim() ||
        t.code.toLowerCase().includes(search.toLowerCase()) ||
        (t.depot && t.depot.toLowerCase().includes(search.toLowerCase())) ||
        (t.branding_partner && t.branding_partner.toLowerCase().includes(search.toLowerCase()))
      const matchLine = filterLine === 'all' || t.line === filterLine
      const matchStatus = filterStatus === 'all' || t.status === filterStatus
      const matchDepot = filterDepot === 'all' || t.depot === filterDepot
      return matchSearch && matchLine && matchStatus && matchDepot
    })
  }, [trains, search, filterLine, filterStatus, filterDepot])

  // Sorting
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let va = a[sortField]
      let vb = b[sortField]
      if (typeof va === 'string') va = va.toLowerCase()
      if (typeof vb === 'string') vb = vb.toLowerCase()
      if (va < vb) return sortAsc ? -1 : 1
      if (va > vb) return sortAsc ? 1 : -1
      return 0
    })
  }, [filtered, sortField, sortAsc])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize
    return sorted.slice(start, start + pageSize)
  }, [sorted, page, pageSize])

  const handleSort = (field) => {
    if (sortField === field) setSortAsc(!sortAsc)
    else {
      setSortField(field)
      setSortAsc(true)
    }
  }

  // Quick Inline Save
  const saveInline = async (train, field, value) => {
    setInlineEditing(null)
    if (train[field] === value) return
    try {
      await api.updateTrain(train.code, { [field]: value })
      toast(`Updated ${train.code} ${field} to ${value}`)
      onRefresh()
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  // Export CSV
  const exportCsv = async () => {
    try {
      const blob = await api.exportTrains()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `nagpur-metro-fleet-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast('Fleet CSV exported.')
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  // Import CSV
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvBusy(true)
    try {
      const res = await api.importTrainsCsv(file)
      toast(`Imported successfully: ${res.created} created, ${res.updated} updated.`)
      onRefresh()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setCsvBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Delete
  const confirmDelete = async () => {
    if (!deletingTrain) return
    setBusy(true)
    try {
      await api.deleteTrain(deletingTrain.code)
      toast(`Train ${deletingTrain.code} deleted.`)
      setDeletingTrain(null)
      onRefresh()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Top action toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Search train code, depot, partner…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="w-64 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-200"
          />
          <select
            value={filterLine}
            onChange={(e) => { setFilterLine(e.target.value); setPage(1) }}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
          >
            <option value="all">All Lines</option>
            <option value="line_1">Line 1 (Orange)</option>
            <option value="line_2">Line 2 (Aqua)</option>
            <option value="spare">Spare</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setPage(1) }}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
          >
            <option value="all">All Statuses</option>
            <option value="service">Service</option>
            <option value="standby">Standby</option>
            <option value="maintenance">Maintenance</option>
          </select>
          <select
            value={filterDepot}
            onChange={(e) => { setFilterDepot(e.target.value); setPage(1) }}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
          >
            <option value="all">All Depots</option>
            <option value="Milan Depot (Khapri)">Milan Depot (Khapri)</option>
            <option value="LON Depot (Lokmanya Nagar)">LON Depot (Lokmanya Nagar)</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="file"
            accept=".csv"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
          />
          <Btn
            kind="ghost"
            onClick={() => fileInputRef.current?.click()}
            disabled={csvBusy || !isOfficer}
            title="Bulk CSV upload"
          >
            {csvBusy ? 'Importing…' : '📥 Import CSV'}
          </Btn>
          <Btn kind="ghost" onClick={exportCsv} title="Download CSV">
            📤 Export CSV
          </Btn>
          {isOfficer && (
            <Btn
              kind="primary"
              onClick={() => { setEditingTrain(null); setModalOpen(true) }}
            >
              + Add Train
            </Btn>
          )}
        </div>
      </div>

      {/* Main Table */}
      <div className="overflow-x-auto rounded-2xl border border-white/[0.08] border-t-white/15 bg-white shadow-sm">
        <table className="w-full text-left text-sm text-slate-700">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="cursor-pointer px-4 py-3 hover:text-slate-900" onClick={() => handleSort('code')}>
                Train ID {sortField === 'code' && (sortAsc ? '▲' : '▼')}
              </th>
              <th className="cursor-pointer px-4 py-3 hover:text-slate-900" onClick={() => handleSort('line')}>
                Line {sortField === 'line' && (sortAsc ? '▲' : '▼')}
              </th>
              <th className="cursor-pointer px-4 py-3 hover:text-slate-900" onClick={() => handleSort('status')}>
                Status {sortField === 'status' && (sortAsc ? '▲' : '▼')}
              </th>
              <th className="cursor-pointer px-4 py-3 hover:text-slate-900" onClick={() => handleSort('km_since_overhaul')}>
                Mileage (km) {sortField === 'km_since_overhaul' && (sortAsc ? '▲' : '▼')}
              </th>
              <th className="cursor-pointer px-4 py-3 hover:text-slate-900" onClick={() => handleSort('cert_days_left')}>
                Fitness Cert {sortField === 'cert_days_left' && (sortAsc ? '▲' : '▼')}
              </th>
              <th className="px-4 py-3">Job Cards</th>
              <th className="px-4 py-3">Cleaning</th>
              <th className="cursor-pointer px-4 py-3 hover:text-slate-900" onClick={() => handleSort('depot')}>
                Depot & Bay {sortField === 'depot' && (sortAsc ? '▲' : '▼')}
              </th>
              <th className="px-4 py-3">Branding</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-8 text-center text-slate-400">
                  No trains found matching criteria.
                </td>
              </tr>
            ) : (
              paginated.map((t) => (
                <tr key={t.code} className="transition-colors hover:bg-slate-50/70">
                  <td className="px-4 py-3 font-bold text-slate-900">
                    {t.code}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-semibold text-slate-600">
                      {t.line === 'line_1' ? 'Line 1 (Orange)' : t.line === 'line_2' ? 'Line 2 (Aqua)' : 'Spare'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {isOfficer ? (
                      <select
                        value={t.status || 'standby'}
                        onChange={(e) => saveInline(t, 'status', e.target.value)}
                        className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-800 shadow-sm focus:border-orange-500"
                      >
                        <option value="service">In Service</option>
                        <option value="standby">Standby</option>
                        <option value="maintenance">Maintenance</option>
                      </select>
                    ) : (
                      <StatusChip status={t.status} />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {inlineEditing?.code === t.code && inlineEditing?.field === 'km_since_overhaul' ? (
                      <input
                        type="number"
                        autoFocus
                        defaultValue={t.km_since_overhaul}
                        onBlur={(e) => saveInline(t, 'km_since_overhaul', parseFloat(e.target.value) || 0)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveInline(t, 'km_since_overhaul', parseFloat(e.target.value) || 0)
                          if (e.key === 'Escape') setInlineEditing(null)
                        }}
                        className="w-24 rounded border border-orange-400 px-1.5 py-0.5 text-xs font-mono"
                      />
                    ) : (
                      <span
                        onClick={() => isOfficer && setInlineEditing({ code: t.code, field: 'km_since_overhaul' })}
                        className={`cursor-pointer font-mono text-xs ${t.km_since_overhaul >= 25000 ? 'font-bold text-rose-600' : 'text-slate-700'} hover:underline`}
                        title="Click to inline edit"
                      >
                        {t.km_since_overhaul.toLocaleString()} km
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {t.cert_days_left < 0 ? (
                      <Chip className="border-rose-200 bg-rose-50 text-rose-700">
                        Expired ({-t.cert_days_left}d ago)
                      </Chip>
                    ) : (
                      <span className="text-xs text-slate-600">
                        {t.cert_days_left} days left
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {t.serious_faults > 0 ? (
                      <Chip className="border-rose-300 bg-rose-100 text-rose-800">
                        {t.serious_faults} Serious
                      </Chip>
                    ) : t.open_faults > 0 ? (
                      <Chip className="border-amber-200 bg-amber-50 text-amber-700">
                        {t.open_faults} Minor
                      </Chip>
                    ) : (
                      <span className="text-xs text-emerald-600">Clean</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {t.cleaning_due ? (
                      <Chip className="border-amber-200 bg-amber-50 text-amber-700">Due</Chip>
                    ) : (
                      <span className="text-xs text-slate-500">OK</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs">
                      <div className="font-medium text-slate-800">{t.depot?.split(' ')[0]}</div>
                      <div className="text-slate-400">{t.track || 'Track'} #{t.track_position}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {t.branding_partner ? (
                      <span className="text-xs font-medium text-purple-700">
                        {t.branding_partner} ({t.branding_priority})
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">None</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => { setEditingTrain(t); setModalOpen(true) }}
                        className="rounded px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      >
                        Edit
                      </button>
                      {isOfficer && (
                        <button
                          onClick={() => setDeletingTrain(t)}
                          className="rounded px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-800"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-500">
        <div>
          Showing {paginated.length ? (page - 1) * pageSize + 1 : 0} to{' '}
          {Math.min(page * pageSize, sorted.length)} of {sorted.length} trains
        </div>
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

      {/* Modal Add/Edit */}
      {modalOpen && (
        <TrainFormModal
          train={editingTrain}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); onRefresh() }}
          toast={toast}
        />
      )}

      {/* Delete confirmation */}
      {deletingTrain && (
        <Confirm
          title={`Delete train ${deletingTrain.code}?`}
          text={`Are you sure you want to remove train ${deletingTrain.code} from the active fleet? This action is tracked in the Change Log.`}
          confirmText="Yes, delete train"
          kind="danger"
          busy={busy}
          onConfirm={confirmDelete}
          onCancel={() => setDeletingTrain(null)}
        />
      )}
    </div>
  )
}

function TrainFormModal({ train, onClose, onSaved, toast }) {
  const isEdit = Boolean(train)
  const [code, setCode] = useState(train?.code || '')
  const [line, setLine] = useState(train?.line || 'line_1')
  const [depot, setDepot] = useState(train?.depot || 'Milan Depot (Khapri)')
  const [track, setTrack] = useState(train?.track || 'S-01')
  const [trackPosition, setTrackPosition] = useState(train?.track_position || 1)
  const [status, setStatus] = useState(train?.status || 'standby')
  const [certExpiry, setCertExpiry] = useState(train?.cert_expiry || new Date().toISOString().slice(0, 10))
  const [km, setKm] = useState(train?.km_since_overhaul || 0)
  const [totalKm, setTotalKm] = useState(train?.total_km || 0)
  const [lastCleaned, setLastCleaned] = useState(train?.last_cleaned || '')
  const [brandingPartner, setBrandingPartner] = useState(train?.branding_partner || '')
  const [brandingPriority, setBrandingPriority] = useState(train?.branding_priority || 'none')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError('')
    setSubmitting(true)

    const payload = {
      code: code.trim().toUpperCase(),
      line,
      depot,
      track,
      track_position: parseInt(trackPosition, 10),
      status,
      cert_expiry: certExpiry,
      km_since_overhaul: parseFloat(km) || 0,
      total_km: parseFloat(totalKm) || 0,
      last_cleaned: lastCleaned ? lastCleaned : null,
      branding_partner: brandingPartner.trim() || null,
      branding_priority: brandingPriority,
    }

    try {
      if (isEdit) {
        await api.updateTrain(train.code, payload)
        toast(`Train ${train.code} successfully updated.`)
      } else {
        await api.createTrain(payload)
        toast(`Train ${payload.code} successfully registered.`)
      }
      onSaved()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-lg font-bold text-slate-900">
            {isEdit ? `Edit Train ${train.code}` : 'Add New Metro Train'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>

        {formError && (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600">Train Code</label>
              <input
                type="text"
                required
                disabled={isEdit}
                placeholder="NMR-24"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 font-bold uppercase disabled:bg-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600">Corridor Line</label>
              <select
                value={line}
                onChange={(e) => {
                  setLine(e.target.value)
                  if (e.target.value === 'line_2') setDepot('LON Depot (Lokmanya Nagar)')
                  else setDepot('Milan Depot (Khapri)')
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5"
              >
                <option value="line_1">Line 1 (Orange)</option>
                <option value="line_2">Line 2 (Aqua)</option>
                <option value="spare">Spare / Fleet Reserve</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600">Assigned Depot</label>
              <select
                value={depot}
                onChange={(e) => setDepot(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5"
              >
                <option value="Milan Depot (Khapri)">Milan Depot (Khapri)</option>
                <option value="LON Depot (Lokmanya Nagar)">LON Depot (Lokmanya Nagar)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600">Operating Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold"
              >
                <option value="service">In Service</option>
                <option value="standby">Standby</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600">Stabling Bay Track</label>
              <input
                type="text"
                value={track}
                onChange={(e) => setTrack(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600">Track Position</label>
              <select
                value={trackPosition}
                onChange={(e) => setTrackPosition(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5"
              >
                <option value="1">1 (Front - Free Exit)</option>
                <option value="2">2 (Rear - Blocked/Shunting)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600">Fitness Cert Expiry</label>
              <input
                type="date"
                required
                value={certExpiry}
                onChange={(e) => setCertExpiry(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600">Last Cleaned Date</label>
              <input
                type="date"
                value={lastCleaned}
                onChange={(e) => setLastCleaned(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600">Km Since Overhaul</label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={km}
                onChange={(e) => setKm(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600">Total Lifetime Km</label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={totalKm}
                onChange={(e) => setTotalKm(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600">Branding Partner</label>
              <input
                type="text"
                placeholder="SBI Yono, Mahindra..."
                value={brandingPartner}
                onChange={(e) => setBrandingPartner(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600">Branding Priority</label>
              <select
                value={brandingPriority}
                onChange={(e) => setBrandingPriority(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5"
              >
                <option value="none">None</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2 pt-2">
            <Btn kind="ghost" type="button" onClick={onClose}>
              Cancel
            </Btn>
            <Btn kind="primary" type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Train'}
            </Btn>
          </div>
        </form>
      </div>
    </div>
  )
}
