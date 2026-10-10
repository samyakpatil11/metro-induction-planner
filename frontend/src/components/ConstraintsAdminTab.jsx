import React, { useState, useEffect } from 'react'
import { api } from '../api'
import { Card, Btn, Chip, Confirm } from './ui'

const CATEGORY_NAMES = {
  fleet: 'Fleet Demand & Spares',
  safety: 'Safety & Overhaul Rules',
  maintenance: 'Maintenance & Cleaning',
  depot: 'Depot Bay Capacities',
  commercial: 'Commercial & Branding',
}

export default function ConstraintsAdminTab({ toast, isOfficer, onConstraintsChanged }) {
  const [constraints, setConstraints] = useState([])
  const [presets, setPresets] = useState([])
  const [initialState, setInitialState] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  // Presets modal
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [presetDesc, setPresetDesc] = useState('')

  const loadConstraints = async () => {
    setLoading(true)
    try {
      const res = await api.constraints()
      setConstraints(res.constraints)
      setPresets(res.presets)
      // snapshot for unsaved changes detection
      setInitialState(JSON.stringify(res.constraints))
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadConstraints()
  }, [])

  const hasUnsavedChanges = initialState && JSON.stringify(constraints) !== initialState

  // Local state modifier
  const updateLocal = (key, field, val) => {
    setConstraints((prev) =>
      prev.map((c) => (c.key === key ? { ...c, [field]: val } : c))
    )
  }

  // Save constraints
  const saveAll = async () => {
    setBusy(true)
    try {
      const payload = constraints.map((c) => ({
        key: c.key,
        enabled: c.enabled,
        is_hard: c.is_hard,
        weight: c.weight,
        value: c.value,
      }))
      const res = await api.updateConstraints(payload)
      setConstraints(res.constraints)
      setPresets(res.presets)
      setInitialState(JSON.stringify(res.constraints))
      toast('All constraints updated successfully.')
      if (onConstraintsChanged) onConstraintsChanged()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  // Apply a preset
  const applyPreset = async (presetId, name) => {
    setBusy(true)
    try {
      const res = await api.applyPreset(presetId)
      setConstraints(res.constraints)
      setPresets(res.presets)
      setInitialState(JSON.stringify(res.constraints))
      toast(`Applied preset "${name}".`)
      if (onConstraintsChanged) onConstraintsChanged()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  // Reset to default preset
  const resetToDefaults = async () => {
    setBusy(true)
    try {
      const res = await api.resetConstraintsDefaults()
      setConstraints(res.constraints)
      setPresets(res.presets)
      setInitialState(JSON.stringify(res.constraints))
      toast('Constraints reset to system defaults (Normal day).')
      if (onConstraintsChanged) onConstraintsChanged()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  // Save new preset
  const handleSavePreset = async (e) => {
    e.preventDefault()
    if (!presetName.trim()) return
    setBusy(true)
    const configMap = {}
    constraints.forEach((c) => {
      configMap[c.key] = {
        enabled: c.enabled,
        is_hard: c.is_hard,
        weight: c.weight,
        value: c.value,
      }
    })

    try {
      await api.savePreset(presetName.trim(), presetDesc.trim(), configMap)
      toast(`Preset "${presetName}" saved.`)
      setSaveModalOpen(false)
      setPresetName('')
      setPresetDesc('')
      loadConstraints()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  // Group by category
  const categories = ['fleet', 'safety', 'maintenance', 'depot', 'commercial']

  return (
    <div className="space-y-6">
      {/* Top Banner & Preset Selector */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h3 className="text-base font-bold text-slate-900">Scheduling Constraints & Operating Rules</h3>
          <p className="text-xs text-slate-500">
            Define active parameters, hard guarantees vs soft penalty weights for Google CP-SAT solver.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Preset Buttons */}
          <span className="text-xs font-semibold text-slate-400">Presets:</span>
          {presets.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p.id, p.name)}
              disabled={busy || !isOfficer}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${p.is_default ? 'border-orange-300 bg-orange-50 text-orange-950 hover:bg-orange-100' : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'}`}
              title={p.description}
            >
              ⚡ {p.name}
            </button>
          ))}

          {isOfficer && (
            <>
              <Btn
                kind="ghost"
                className="!py-1.5 !text-xs"
                onClick={() => setSaveModalOpen(true)}
              >
                💾 Save Preset
              </Btn>
              <Btn
                kind="ghost"
                className="!py-1.5 !text-xs !text-rose-600"
                onClick={resetToDefaults}
                disabled={busy}
              >
                Reset Defaults
              </Btn>
            </>
          )}
        </div>
      </div>

      {/* Unsaved changes warning bar */}
      {hasUnsavedChanges && (
        <div className="sticky top-16 z-20 flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-md">
          <div className="flex items-center gap-2 font-medium">
            <span>⚠️ You have unsaved constraint changes.</span>
          </div>
          <div className="flex gap-2">
            <Btn kind="ghost" className="!py-1 !text-xs" onClick={loadConstraints}>Discard</Btn>
            <Btn kind="primary" className="!py-1 !text-xs" onClick={saveAll} disabled={busy}>
              {busy ? 'Saving…' : 'Save Changes'}
            </Btn>
          </div>
        </div>
      )}

      {/* Constraint Categories */}
      <div className="space-y-6">
        {categories.map((cat) => {
          const catConstraints = constraints.filter((c) => c.category === cat)
          if (!catConstraints.length) return null

          return (
            <Card key={cat} title={CATEGORY_NAMES[cat] || cat}>
              <div className="divide-y divide-slate-100">
                {catConstraints.map((c) => (
                  <div key={c.key} className="flex flex-wrap items-center justify-between gap-4 p-5 transition-colors hover:bg-slate-50/50">
                    <div className="max-w-md">
                      <div className="flex items-center gap-2.5">
                        <label className="relative inline-flex cursor-pointer items-center">
                          <input
                            type="checkbox"
                            checked={c.enabled}
                            disabled={!isOfficer}
                            onChange={(e) => updateLocal(c.key, 'enabled', e.target.checked)}
                            className="peer sr-only"
                          />
                          <div className="peer h-5 w-9 rounded-full bg-slate-300 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-orange-600 peer-checked:after:translate-x-full peer-focus:outline-none" />
                        </label>
                        <span className={`text-sm font-bold ${c.enabled ? 'text-slate-900' : 'text-slate-400 line-through'}`}>
                          {c.name}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{c.description}</p>
                    </div>

                    {/* Constraint Value & Mode Settings */}
                    <div className="flex flex-wrap items-center gap-4">
                      {/* Hard vs Soft Toggle */}
                      <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 p-1">
                        <button
                          type="button"
                          disabled={!isOfficer || !c.enabled}
                          onClick={() => updateLocal(c.key, 'is_hard', true)}
                          className={`rounded-md px-2.5 py-1 text-xs font-bold transition ${c.is_hard ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
                        >
                          Hard Rule
                        </button>
                        <button
                          type="button"
                          disabled={!isOfficer || !c.enabled}
                          onClick={() => updateLocal(c.key, 'is_hard', false)}
                          className={`rounded-md px-2.5 py-1 text-xs font-bold transition ${!c.is_hard ? 'bg-orange-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
                        >
                          Soft Goal
                        </button>
                      </div>

                      {/* Weight slider for soft goals */}
                      {!c.is_hard && (
                        <div className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50/50 px-3 py-1.5">
                          <span className="text-xs font-semibold text-orange-950">Weight:</span>
                          <input
                            type="range"
                            min="0.5"
                            max="10"
                            step="0.5"
                            disabled={!isOfficer || !c.enabled}
                            value={c.weight}
                            onChange={(e) => updateLocal(c.key, 'weight', parseFloat(e.target.value))}
                            className="h-1.5 w-20 cursor-pointer accent-orange-600"
                          />
                          <span className="w-6 font-mono text-xs font-bold text-orange-950">{c.weight}x</span>
                        </div>
                      )}

                      {/* Value Input */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-400">Value:</span>
                        {c.value_type === 'int' ? (
                          <input
                            type="number"
                            disabled={!isOfficer || !c.enabled}
                            value={c.value ?? ''}
                            onChange={(e) => updateLocal(c.key, 'value', parseInt(e.target.value, 10) || 0)}
                            className="w-20 rounded-lg border border-slate-300 px-2.5 py-1 text-center font-mono text-sm font-bold text-slate-900 disabled:bg-slate-100"
                          />
                        ) : c.value_type === 'float' ? (
                          <input
                            type="number"
                            step="0.1"
                            disabled={!isOfficer || !c.enabled}
                            value={c.value ?? ''}
                            onChange={(e) => updateLocal(c.key, 'value', parseFloat(e.target.value) || 0)}
                            className="w-20 rounded-lg border border-slate-300 px-2.5 py-1 text-center font-mono text-sm font-bold text-slate-900 disabled:bg-slate-100"
                          />
                        ) : (
                          <input
                            type="text"
                            disabled={!isOfficer || !c.enabled}
                            value={c.value ?? ''}
                            onChange={(e) => updateLocal(c.key, 'value', e.target.value)}
                            className="w-28 rounded-lg border border-slate-300 px-2.5 py-1 text-sm font-semibold disabled:bg-slate-100"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )
        })}
      </div>

      {/* Bottom Save Action */}
      {isOfficer && (
        <div className="flex justify-end pt-2">
          <Btn kind="primary" onClick={saveAll} disabled={busy || !hasUnsavedChanges} className="!px-6">
            {busy ? 'Saving…' : 'Save Constraints'}
          </Btn>
        </div>
      )}

      {/* Save Preset Modal */}
      {saveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setSaveModalOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900">Save Preset</h3>
              <button onClick={() => setSaveModalOpen(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <form onSubmit={handleSavePreset} className="mt-4 space-y-3.5 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-600">Preset Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Weekend Rush or Special Event"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600">Description / Rationale</label>
                <textarea
                  rows={2}
                  placeholder="Notes about operational conditions for this configuration"
                  value={presetDesc}
                  onChange={(e) => setPresetDesc(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Btn kind="ghost" type="button" onClick={() => setSaveModalOpen(false)}>Cancel</Btn>
                <Btn kind="primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save Preset'}</Btn>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
