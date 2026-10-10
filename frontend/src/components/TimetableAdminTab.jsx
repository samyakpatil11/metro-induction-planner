import React, { useState, useEffect } from 'react'
import { api } from '../api'
import { Card, Btn, Chip, Confirm } from './ui'

export default function TimetableAdminTab({ toast, isOfficer }) {
  const [timetable, setTimetable] = useState([])
  const [stations, setStations] = useState([])
  const [depots, setDepots] = useState([])
  const [loading, setLoading] = useState(true)

  // Sub-section toggle: Timetable params | Stations | Depot Bays
  const [section, setSection] = useState('params')

  // Timetable editing state
  const [editingParam, setEditingParam] = useState(null)
  const [paramForm, setParamForm] = useState({})

  // Stations modal / state
  const [stationModal, setStationModal] = useState(false)
  const [editingStation, setEditingStation] = useState(null)
  const [deletingStation, setDeletingStation] = useState(null)

  // Depots modal / state
  const [depotModal, setDepotModal] = useState(false)
  const [editingDepot, setEditingDepot] = useState(null)
  const [deletingDepot, setDeletingDepot] = useState(null)

  const [busy, setBusy] = useState(false)

  const loadData = async () => {
    setLoading(true)
    try {
      const [tt, st, dp] = await Promise.all([api.timetable(), api.stations(), api.depots()])
      setTimetable(tt)
      setStations(st)
      setDepots(dp)
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const startEditParam = (param) => {
    setEditingParam(param.line)
    setParamForm({ ...param })
  }

  const saveParam = async (line) => {
    setBusy(true)
    try {
      await api.updateTimetable(line, {
        line_name: paramForm.line_name,
        first_train_time: paramForm.first_train_time,
        last_train_time: paramForm.last_train_time,
        peak_headway_min: parseInt(paramForm.peak_headway_min, 10),
        off_peak_headway_min: parseInt(paramForm.off_peak_headway_min, 10),
        trips_per_train: parseInt(paramForm.trips_per_train, 10),
        service_needed: parseInt(paramForm.service_needed, 10),
        corridor_km: parseFloat(paramForm.corridor_km),
      })
      toast(`Timetable for ${paramForm.line_name || line} updated.`)
      setEditingParam(null)
      loadData()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  // Delete Station
  const confirmDeleteStation = async () => {
    if (!deletingStation) return
    setBusy(true)
    try {
      await api.deleteStation(deletingStation.code)
      toast(`Station ${deletingStation.name} (${deletingStation.code}) deleted.`)
      setDeletingStation(null)
      loadData()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  // Delete Depot Bay
  const confirmDeleteDepot = async () => {
    if (!deletingDepot) return
    setBusy(true)
    try {
      await api.deleteDepotBay(deletingDepot.id)
      toast(`Bay ${deletingDepot.bay_number} at ${deletingDepot.depot} deleted.`)
      setDeletingDepot(null)
      loadData()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Sub navigation pills */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setSection('params')}
          className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${section === 'params' ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
        >
          Timetable Parameters
        </button>
        <button
          onClick={() => setSection('stations')}
          className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${section === 'stations' ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
        >
          Stations ({stations.length})
        </button>
        <button
          onClick={() => setSection('depots')}
          className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${section === 'depots' ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
        >
          Depot & Stabling Bays ({depots.length})
        </button>
      </div>

      {/* SECTION 1: TIMETABLE PARAMETERS */}
      {section === 'params' && (
        <div className="grid gap-6 md:grid-cols-2">
          {timetable.map((p) => {
            const isEditing = editingParam === p.line
            return (
              <Card
                key={p.line}
                title={p.line_name}
                subtitle={`Corridor length: ${p.corridor_km} km`}
                right={
                  isOfficer && (
                    isEditing ? (
                      <div className="flex gap-2">
                        <Btn kind="ghost" className="!py-1 !text-xs" onClick={() => setEditingParam(null)}>Cancel</Btn>
                        <Btn kind="primary" className="!py-1 !text-xs" onClick={() => saveParam(p.line)} disabled={busy}>Save</Btn>
                      </div>
                    ) : (
                      <Btn kind="ghost" className="!py-1 !text-xs" onClick={() => startEditParam(p)}>Edit</Btn>
                    )
                  )
                }
              >
                <div className="space-y-4 p-5 text-sm">
                  {isEditing ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-500">First Train Time</label>
                          <input
                            type="time"
                            value={paramForm.first_train_time}
                            onChange={(e) => setParamForm({ ...paramForm, first_train_time: e.target.value })}
                            className="mt-1 w-full rounded border border-slate-300 p-1.5 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500">Last Train Time</label>
                          <input
                            type="time"
                            value={paramForm.last_train_time}
                            onChange={(e) => setParamForm({ ...paramForm, last_train_time: e.target.value })}
                            className="mt-1 w-full rounded border border-slate-300 p-1.5 text-sm"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-500">Peak Headway (mins)</label>
                          <input
                            type="number"
                            min="2"
                            max="60"
                            value={paramForm.peak_headway_min}
                            onChange={(e) => setParamForm({ ...paramForm, peak_headway_min: e.target.value })}
                            className="mt-1 w-full rounded border border-slate-300 p-1.5 text-sm font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500">Off-Peak Headway (mins)</label>
                          <input
                            type="number"
                            min="2"
                            max="60"
                            value={paramForm.off_peak_headway_min}
                            onChange={(e) => setParamForm({ ...paramForm, off_peak_headway_min: e.target.value })}
                            className="mt-1 w-full rounded border border-slate-300 p-1.5 text-sm font-mono"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-500">Trips Per Train / Day</label>
                          <input
                            type="number"
                            min="1"
                            max="30"
                            value={paramForm.trips_per_train}
                            onChange={(e) => setParamForm({ ...paramForm, trips_per_train: e.target.value })}
                            className="mt-1 w-full rounded border border-slate-300 p-1.5 text-sm font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500">Required Service Trains</label>
                          <input
                            type="number"
                            min="1"
                            max="20"
                            value={paramForm.service_needed}
                            onChange={(e) => setParamForm({ ...paramForm, service_needed: e.target.value })}
                            className="mt-1 w-full rounded border border-slate-300 p-1.5 text-sm font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <span className="text-xs text-slate-400">Daily Operating Window</span>
                        <p className="mt-1 font-bold text-slate-900">{p.first_train_time} – {p.last_train_time}</p>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <span className="text-xs text-slate-400">Headways (Peak / Off-Peak)</span>
                        <p className="mt-1 font-bold text-slate-900">{p.peak_headway_min}m / {p.off_peak_headway_min}m</p>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <span className="text-xs text-slate-400">Active Trains in Service</span>
                        <p className="mt-1 text-lg font-extrabold text-orange-600">{p.service_needed} trains</p>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <span className="text-xs text-slate-400">Round Trips Per Train</span>
                        <p className="mt-1 font-bold text-slate-900">{p.trips_per_train} trips</p>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* SECTION 2: STATIONS */}
      {section === 'stations' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Configured Metro Stations</h3>
            {isOfficer && (
              <Btn kind="primary" className="!py-1.5 !text-xs" onClick={() => { setEditingStation(null); setStationModal(true) }}>
                + Add Station
              </Btn>
            )}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-white/[0.08] border-t-white/15 bg-white shadow-sm">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Station Name</th>
                  <th className="px-4 py-3">Line</th>
                  <th className="px-4 py-3">Seq Order</th>
                  <th className="px-4 py-3">Attributes</th>
                  <th className="px-4 py-3">Depot Link</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stations.map((s) => (
                  <tr key={s.code} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">{s.code}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{s.name}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-semibold text-slate-600">
                        {s.line === 'line_1' ? 'Line 1 (Orange)' : 'Line 2 (Aqua)'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">#{s.order_in_line}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {s.terminal && <Chip className="border-amber-200 bg-amber-50 text-amber-700">Terminal</Chip>}
                        {s.interchange && <Chip className="border-purple-200 bg-purple-50 text-purple-700">Interchange</Chip>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{s.depot_attached || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      {isOfficer && (
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => { setEditingStation(s); setStationModal(true) }}
                            className="rounded px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeletingStation(s)}
                            className="rounded px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 3: DEPOT & STABLING BAYS */}
      {section === 'depots' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Depots & Maintenance Bay Layout</h3>
            {isOfficer && (
              <Btn kind="primary" className="!py-1.5 !text-xs" onClick={() => { setEditingDepot(null); setDepotModal(true) }}>
                + Add Depot Bay
              </Btn>
            )}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-white/[0.08] border-t-white/15 bg-white shadow-sm">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Depot</th>
                  <th className="px-4 py-3">Bay Track Number</th>
                  <th className="px-4 py-3">Bay Type</th>
                  <th className="px-4 py-3">Train Capacity</th>
                  <th className="px-4 py-3">Corridor</th>
                  <th className="px-4 py-3">Notes</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {depots.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-semibold text-slate-900">{d.depot}</td>
                    <td className="px-4 py-3 font-mono font-bold text-orange-600">{d.bay_number}</td>
                    <td className="px-4 py-3">
                      <Chip className={
                        d.bay_type === 'maintenance'
                          ? 'border-amber-200 bg-amber-50 text-amber-700'
                          : d.bay_type === 'wash_plant'
                          ? 'border-sky-200 bg-sky-50 text-sky-700'
                          : 'border-slate-200 bg-slate-50 text-slate-700'
                      }>
                        {d.bay_type}
                      </Chip>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{d.capacity} train(s)</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{d.line}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{d.notes || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      {isOfficer && (
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => { setEditingDepot(d); setDepotModal(true) }}
                            className="rounded px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeletingDepot(d)}
                            className="rounded px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Station Modal */}
      {stationModal && (
        <StationModal
          station={editingStation}
          onClose={() => setStationModal(false)}
          onSaved={() => { setStationModal(false); loadData() }}
          toast={toast}
        />
      )}

      {/* Depot Bay Modal */}
      {depotModal && (
        <DepotModal
          bay={editingDepot}
          onClose={() => setDepotModal(false)}
          onSaved={() => { setDepotModal(false); loadData() }}
          toast={toast}
        />
      )}

      {/* Delete Station Confirm */}
      {deletingStation && (
        <Confirm
          title={`Delete Station ${deletingStation.name}?`}
          text={`Are you sure you want to delete station ${deletingStation.name} (${deletingStation.code})?`}
          confirmText="Yes, delete"
          kind="danger"
          busy={busy}
          onConfirm={confirmDeleteStation}
          onCancel={() => setDeletingStation(null)}
        />
      )}

      {/* Delete Depot Confirm */}
      {deletingDepot && (
        <Confirm
          title={`Delete Bay ${deletingDepot.bay_number}?`}
          text={`Are you sure you want to delete ${deletingDepot.bay_number} from ${deletingDepot.depot}?`}
          confirmText="Yes, delete"
          kind="danger"
          busy={busy}
          onConfirm={confirmDeleteDepot}
          onCancel={() => setDeletingDepot(null)}
        />
      )}
    </div>
  )
}

function StationModal({ station, onClose, onSaved, toast }) {
  const isEdit = Boolean(station)
  const [code, setCode] = useState(station?.code || '')
  const [name, setName] = useState(station?.name || '')
  const [line, setLine] = useState(station?.line || 'line_1')
  const [order, setOrder] = useState(station?.order_in_line || 1)
  const [terminal, setTerminal] = useState(station?.terminal || false)
  const [interchange, setInterchange] = useState(station?.interchange || false)
  const [depotAttached, setDepotAttached] = useState(station?.depot_attached || '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    const payload = {
      code: code.trim().toUpperCase(),
      name: name.trim(),
      line,
      order_in_line: parseInt(order, 10),
      terminal,
      interchange,
      depot_attached: depotAttached.trim() || null,
    }

    try {
      if (isEdit) {
        await api.updateStation(station.code, payload)
        toast(`Station ${payload.name} updated.`)
      } else {
        await api.createStation(payload)
        toast(`Station ${payload.name} created.`)
      }
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-lg font-bold text-slate-900">{isEdit ? 'Edit Station' : 'Add Station'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>
        {error && <div className="mt-3 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error}</div>}
        <form onSubmit={handleSave} className="mt-4 space-y-3 text-sm">
          <div>
            <label className="block text-xs font-semibold text-slate-600">Station Code (2-6 letters)</label>
            <input
              type="text"
              required
              disabled={isEdit}
              placeholder="e.g. SIT"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 uppercase font-mono disabled:bg-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600">Station Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Sitabuldi Interchange"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600">Line</label>
              <select value={line} onChange={(e) => setLine(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5">
                <option value="line_1">Line 1 (Orange)</option>
                <option value="line_2">Line 2 (Aqua)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600">Sequence Order</label>
              <input
                type="number"
                min="1"
                value={order}
                onChange={(e) => setOrder(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono"
              />
            </div>
          </div>
          <div className="flex gap-4 pt-1">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
              <input type="checkbox" checked={terminal} onChange={(e) => setTerminal(e.target.checked)} className="size-4 rounded text-orange-600" />
              Terminal Station
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
              <input type="checkbox" checked={interchange} onChange={(e) => setInterchange(e.target.checked)} className="size-4 rounded text-orange-600" />
              Interchange Hub
            </label>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600">Depot Attached (Optional)</label>
            <input
              type="text"
              placeholder="Milan Depot (Khapri) or LON Depot"
              value={depotAttached}
              onChange={(e) => setDepotAttached(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
            />
          </div>
          <div className="mt-5 flex justify-end gap-2 pt-2">
            <Btn kind="ghost" type="button" onClick={onClose}>Cancel</Btn>
            <Btn kind="primary" type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</Btn>
          </div>
        </form>
      </div>
    </div>
  )
}

function DepotModal({ bay, onClose, onSaved, toast }) {
  const isEdit = Boolean(bay)
  const [depot, setDepot] = useState(bay?.depot || 'Milan Depot (Khapri)')
  const [bayNumber, setBayNumber] = useState(bay?.bay_number || 'S-07')
  const [bayType, setBayType] = useState(bay?.bay_type || 'stabling')
  const [capacity, setCapacity] = useState(bay?.capacity || 2)
  const [line, setLine] = useState(bay?.line || 'line_1')
  const [notes, setNotes] = useState(bay?.notes || '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    const payload = {
      depot,
      bay_number: bayNumber.trim(),
      bay_type: bayType,
      capacity: parseInt(capacity, 10),
      line,
      notes: notes.trim() || null,
    }

    try {
      if (isEdit) {
        await api.updateDepotBay(bay.id, payload)
        toast(`Bay ${payload.bay_number} updated.`)
      } else {
        await api.createDepotBay(payload)
        toast(`Bay ${payload.bay_number} created.`)
      }
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-lg font-bold text-slate-900">{isEdit ? 'Edit Bay Track' : 'Add Depot Bay Track'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>
        {error && <div className="mt-3 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error}</div>}
        <form onSubmit={handleSave} className="mt-4 space-y-3 text-sm">
          <div>
            <label className="block text-xs font-semibold text-slate-600">Depot</label>
            <select
              value={depot}
              onChange={(e) => {
                setDepot(e.target.value)
                setLine(e.target.value.includes('Milan') ? 'line_1' : 'line_2')
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5"
            >
              <option value="Milan Depot (Khapri)">Milan Depot (Khapri)</option>
              <option value="LON Depot (Lokmanya Nagar)">LON Depot (Lokmanya Nagar)</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600">Bay / Track ID</label>
              <input
                type="text"
                required
                placeholder="e.g. S-07 or M-04"
                value={bayNumber}
                onChange={(e) => setBayNumber(e.target.value.toUpperCase())}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600">Bay Purpose</label>
              <select value={bayType} onChange={(e) => setBayType(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5">
                <option value="stabling">Stabling (Parking)</option>
                <option value="maintenance">Maintenance / Inspection</option>
                <option value="wash_plant">Wash Plant</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600">Train Capacity</label>
              <input
                type="number"
                min="1"
                max="6"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600">Associated Line</label>
              <select value={line} onChange={(e) => setLine(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5">
                <option value="line_1">Line 1 (Orange)</option>
                <option value="line_2">Line 2 (Aqua)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600">Notes / Remarks</label>
            <input
              type="text"
              placeholder="e.g. Overhead catenary powered track"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5"
            />
          </div>
          <div className="mt-5 flex justify-end gap-2 pt-2">
            <Btn kind="ghost" type="button" onClick={onClose}>Cancel</Btn>
            <Btn kind="primary" type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</Btn>
          </div>
        </form>
      </div>
    </div>
  )
}
