import React, { useEffect, useState } from 'react'
import { api } from '../api'
import { Btn, Chip, StatusChip, RiskChip, LINES, STATUS, fmtDate } from './ui'
import { KmBar } from './TrainsPage'

export default function TrainDrawer({ code, initialAssignment, isOfficer, strategy, hasPlan, onClose, onChanged, toast }) {
  const [t, setT] = useState(null)
  const [desc, setDesc] = useState('')
  const [severity, setSeverity] = useState('low')
  const [busy, setBusy] = useState(false)
  const [assignment, setAssignment] = useState('service')
  const [assignmentPreview, setAssignmentPreview] = useState(null)
  const [assignmentError, setAssignmentError] = useState('')
  const [assignmentBusy, setAssignmentBusy] = useState(false)

  const load = () => api.train(code).then((train) => { setT(train); setAssignment(initialAssignment || train.tonight || 'service') }).catch((e) => toast(e.message, 'error'))
  useEffect(() => { setT(null); setAssignmentPreview(null); setAssignmentError(''); load() }, [code, initialAssignment])
  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose() }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', onKeyDown) }
  }, [onClose])

  async function act(fn, ok) {
    setBusy(true)
    try { await fn(); toast(ok); setDesc(''); await Promise.all([load(), onChanged()]) }
    catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  async function previewAssignment() {
    setAssignmentBusy(true)
    setAssignmentError('')
    try { setAssignmentPreview(await api.preview(strategy, { [code]: assignment })) }
    catch (e) { setAssignmentPreview(null); setAssignmentError(e.message) }
    finally { setAssignmentBusy(false) }
  }

  async function applyAssignment() {
    setAssignmentBusy(true)
    setAssignmentError('')
    try {
      await api.createPlan(strategy, { [code]: assignment })
      setAssignmentPreview(null)
      toast('New proposed plan created. Review and approve it to apply the assignment.')
      await onChanged()
      await load()
    } catch (e) { setAssignmentError(e.message) }
    finally { setAssignmentBusy(false) }
  }

  const requestedEntry = assignmentPreview?.entries.find((entry) => entry.code === code)
  const assignmentWasAccepted = requestedEntry?.assignment === assignment
  const canApplyAssignment = assignmentPreview && assignmentWasAccepted && (assignmentPreview.changes.length > 0 || !hasPlan)

  const maxImpact = t ? Math.max(0.01, ...t.risk_factors.map((f) => Math.abs(f.impact))) : 1

  return (
    <div className="motion-overlay fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-3 backdrop-blur-[2px] sm:p-6" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-labelledby="train-dialog-title" className="drawer-enter max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/[0.08] border-t-white/15 bg-white p-5 shadow-2xl sm:p-7" onClick={(e) => e.stopPropagation()}>
        {!t ? <p className="text-slate-500">Loading…</p> : (
          <div className="space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 id="train-dialog-title" className="text-2xl font-bold text-slate-900">{t.code}</h2>
                <p className="text-slate-500">{LINES[t.line]} · {t.depot}</p>
              </div>
              <button onClick={onClose} aria-label="Close" className="flex size-9 items-center justify-center rounded-lg text-2xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">×</button>
            </div>

            <div className="rounded-xl bg-slate-50 p-4">
              <p className="mb-1 flex items-center gap-2 text-sm font-bold text-slate-500">TONIGHT <StatusChip status={t.tonight} /></p>
              <p className="text-slate-700">{t.tonight_reason || 'No plan has been made yet.'}</p>
            </div>

            <section className="rounded-xl border border-white/[0.08] border-t-white/15 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-900">Change tonight&apos;s assignment</h3>
                  <p className="mt-1 text-sm text-slate-500">Choose a status, preview the impact, then create a proposed plan.</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">Officer action</span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2" role="group" aria-label={`Assignment for ${t.code}`}>
                {['service', 'standby', 'maintenance'].map((status) => (
                  <button key={status} type="button" disabled={!isOfficer} onClick={() => { setAssignment(status); setAssignmentPreview(null); setAssignmentError('') }}
                    className={`rounded-lg border px-2 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${assignment === status ? 'border-orange-500 bg-orange-50 text-orange-800 ring-1 ring-orange-300' : 'border-slate-200 bg-white text-slate-600 hover:border-orange-300'}`}>
                    {STATUS[status].label}
                  </button>
                ))}
              </div>
              {isOfficer ? (
                <>
                  <Btn kind="ghost" className="mt-3 w-full" onClick={previewAssignment} disabled={assignmentBusy || assignment === t.tonight}>
                    {assignmentBusy ? 'Checking…' : 'Preview assignment'}
                  </Btn>
                  {assignment === t.tonight && <p className="mt-2 text-center text-xs text-slate-500">This train already has that assignment tonight.</p>}
                </>
              ) : <p className="mt-3 rounded-lg bg-slate-100 p-3 text-sm text-slate-600">Read-only access. A depot officer can change assignments.</p>}
              {assignmentError && <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">{assignmentError}</p>}
                  {assignmentPreview && (
                <div className="mt-3 space-y-3 rounded-lg bg-slate-50 p-3">
                  <p className="text-sm font-bold text-slate-800">Preview: {t.code} → {STATUS[assignment].label}</p>
                  {!assignmentWasAccepted && <p className="rounded-md border border-rose-200 bg-rose-50 p-2 text-sm font-semibold text-rose-800" role="alert">The planner could not place this train in {STATUS[assignment].label.toLowerCase()}. Review the safety and coverage notes below.</p>}
                  {assignmentPreview.changes.length > 0 ? (
                    <ul className="space-y-1 text-sm">
                      {assignmentPreview.changes.map((change) => <li key={change.code}><b>{change.code}</b>: {STATUS[change.from]?.label || 'No plan'} → <b>{STATUS[change.to].label}</b>{change.code !== t.code && <span className="text-slate-500"> (adjusted to balance the plan)</span>}</li>)}
                    </ul>
                  ) : <p className="text-sm text-slate-600">The assignment fits without changing other trains.</p>}
                  {assignmentPreview.summary.warnings.map((warning, i) => <p key={i} className="text-sm text-amber-800">{warning}</p>)}
                  <p className="text-xs leading-relaxed text-slate-500">This creates a proposed plan. Assignments take effect only after the plan is approved.</p>
                  {isOfficer && canApplyAssignment && <Btn className="w-full" onClick={applyAssignment} disabled={assignmentBusy}>Create proposed plan</Btn>}
                </div>
              )}
            </section>

            <div className="grid grid-cols-2 gap-4">
              <Fact label="Fitness certificate">
                {t.cert_days_left < 0 ? <span className="font-bold text-rose-700">Expired {-t.cert_days_left} days ago</span> : `${t.cert_days_left} days left`}
              </Fact>
              <Fact label="Since last overhaul"><KmBar km={t.km_since_overhaul} limit={t.overhaul_limit_km} /></Fact>
              <Fact label="Advertising">{t.branding_partner || 'None'}</Fact>
              <Fact label="Cleaning">{t.cleaning_due ? <span className="font-bold text-amber-800">Due</span> : 'Up to date'}</Fact>
            </div>

            <section>
              <h3 className="mb-1 flex items-center gap-2 font-bold text-slate-900">Breakdown risk <RiskChip level={t.risk_level} value={t.risk} /></h3>
              <p className="mb-3 text-sm text-slate-500">Estimated chance of a fault in the next 7 days. The bars show each factor’s relative contribution to the model score (log odds); this is not a SHAP explanation or a percentage-point change.</p>
              <ul className="space-y-2">
                {t.risk_factors.map((f) => (
                  <li key={f.feature}>
                    <div className="flex justify-between text-sm"><span>{f.text}</span><span className={f.impact > 0 ? 'text-rose-700 font-medium' : 'text-emerald-700 font-medium'}>{f.impact > 0 ? 'adds risk' : 'reduces risk'}</span></div>
                    <div className="mt-1 h-2 rounded-full bg-slate-100">
                      <div className={`h-2 rounded-full ${f.impact > 0 ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${Math.max(4, (Math.abs(f.impact) / maxImpact) * 100)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h3 className="mb-2 font-bold text-slate-900">Fault reports</h3>
              {t.faults.length === 0 && <p className="text-slate-500">No faults recorded.</p>}
              <ul className="space-y-2">
                {t.faults.map((f) => (
                  <li key={f.id} className={`flex items-center gap-3 rounded-xl border p-3 ${f.status === 'open' ? 'border-slate-200' : 'border-slate-100 bg-slate-50 text-slate-500'}`}>
                    <div className="flex-1">
                      <p className="font-semibold">{f.description}</p>
                      <p className="text-xs text-slate-500">Reported {fmtDate(f.opened)}{f.status === 'closed' && ` · fixed ${fmtDate(f.closed)}`}</p>
                    </div>
                    {f.severity === 'high' && f.status === 'open' && <Chip className="border-rose-200 bg-rose-50 text-rose-700">Serious</Chip>}
                    {f.status === 'open' && isOfficer && <Btn kind="ghost" className="!px-3 !py-1" disabled={busy} onClick={() => act(() => api.resolveFault(f.id), 'Marked as fixed.')}>Mark fixed</Btn>}
                  </li>
                ))}
              </ul>

              {isOfficer && (
                <div className="mt-4 space-y-2 rounded-xl border border-dashed border-slate-300 p-4">
                  <p className="text-sm font-bold">Report a new fault</p>
                  <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What is wrong? e.g. Door not closing"
                    className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-200" />
                  <div className="flex gap-2">
                    {[['low', 'Minor'], ['high', 'Serious (stops the train running)']].map(([v, l]) => (
                      <button key={v} onClick={() => setSeverity(v)} className={`flex-1 rounded-lg border px-2 py-2 text-sm font-semibold ${severity === v ? 'border-orange-600 bg-orange-50 text-orange-800' : 'border-slate-300'}`}>{l}</button>
                    ))}
                  </div>
                  <Btn className="w-full" disabled={busy || desc.trim().length < 3}
                    onClick={() => act(() => api.reportFault(t.code, desc, severity), 'Fault reported. Risk updated.')}>Add fault</Btn>
                </div>
              )}
            </section>
          </div>
        )}
      </aside>
    </div>
  )
}

const Fact = ({ label, children }) => (
  <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><div className="mt-0.5">{children}</div></div>
)
