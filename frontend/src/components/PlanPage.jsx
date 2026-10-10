import React, { useState } from 'react'
import { api } from '../api'
import { Card, Btn, Chip, StatusChip, RiskChip, Confirm, STATUS, LINES, fmtTime } from './ui'

const RULES = [
  'A train with an expired fitness certificate never carries passengers.',
  'A train with a serious open fault never carries passengers.',
  'A train that has run 25,000 km since its last overhaul must go to maintenance.',
  'Line 1 and Line 2 each get 8 trains. Spare trains fill any gaps.',
  'Then the planner prefers safe, low-wear trains, keeps advertising trains running, and avoids trains that are due for cleaning or parked behind another train.',
]

export default function PlanPage({ plan, strategies, trains, isOfficer, refresh, openTrain, toast }) {
  if (!plan) return <NoPlan {...{ strategies, isOfficer, refresh, toast }} />

  const groups = [
    { title: 'Running on Line 1', items: plan.entries.filter((e) => e.serves === 'line_1') },
    { title: 'Running on Line 2', items: plan.entries.filter((e) => e.serves === 'line_2') },
    { title: 'Going to maintenance', items: plan.entries.filter((e) => e.assignment === 'maintenance') },
    { title: 'On standby', items: plan.entries.filter((e) => e.assignment === 'standby') },
  ]
  const { warnings, coverage } = plan.summary

  return (
    <div className="page-enter grid gap-6 lg:grid-cols-3">
      {/* Right column first on phones: the decision is the most important thing */}
      <div className="space-y-6 lg:order-2">
        <DecisionCard {...{ plan, isOfficer, refresh, toast }} />
        <NewPlanCard {...{ plan, strategies, isOfficer, refresh, toast }} />
        <WhatIf {...{ plan, trains, isOfficer, refresh, toast }} />
        <RulesCard />
      </div>

      <div className="space-y-6 lg:order-1 lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Tonight’s plan</h2>
            <p className="text-sm text-slate-500">
              Priority: <b>{strategies.find((s) => s.id === plan.strategy)?.label}</b> · made by {plan.created_by}
            </p>
          </div>
          <PdfButton toast={toast} />
        </div>

        {warnings.length > 0 && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
            <p className="font-bold">⚠️ Please note</p>
            <ul className="ml-5 list-disc">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          </div>
        )}

        {groups.map((g) => (
          <Card key={g.title} title={`${g.title} (${g.items.length})`}
            right={g.title.includes('Line') && (
              <Chip className={coverage[g.title.includes('1') ? 'line_1' : 'line_2'].have < 8 ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'}>
                {coverage[g.title.includes('1') ? 'line_1' : 'line_2'].have} of {coverage[g.title.includes('1') ? 'line_1' : 'line_2'].need} needed
              </Chip>
            )}>
            {g.items.length === 0 ? <p className="p-5 text-slate-500">No trains here.</p> : (
              <ul className="divide-y divide-slate-100">
                {g.items.map((e) => (
                  <li key={e.code} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                    <button onClick={() => openTrain(e.code)} className="w-20 text-left font-bold text-orange-700 hover:underline">{e.code}</button>
                    <p className="min-w-[14rem] flex-1 text-slate-700">{e.reason}</p>
                    <RiskChip level={e.risk_level} value={e.risk} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}

function PdfButton({ toast }) {
  const [busy, setBusy] = useState(false)
  async function download() {
    setBusy(true)
    try {
      const blob = await api.report()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'induction-plan.pdf'
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }
  return <Btn kind="ghost" onClick={download} disabled={busy}>{busy ? 'Preparing…' : '📄 Download PDF report'}</Btn>
}

// ---- Approve / reject ------------------------------------------------------
function DecisionCard({ plan, isOfficer, refresh, toast }) {
  const [notes, setNotes] = useState('')
  const [asking, setAsking] = useState(null) // 'approve' | 'reject'
  const [busy, setBusy] = useState(false)

  async function decide() {
    setBusy(true)
    try {
      await (asking === 'approve' ? api.approve(notes) : api.reject(notes))
      toast(asking === 'approve' ? 'Plan approved.' : 'Plan rejected.')
      setAsking(null); setNotes('')
      await refresh()
    } catch (e) { toast(e.message, 'error'); setAsking(null) } finally { setBusy(false) }
  }

  const tone = { proposed: 'Waiting for approval', approved: 'Approved', rejected: 'Rejected' }[plan.status]
  return (
    <Card title="Decision" primary>
      <div className="space-y-3 p-5">
        <p className={`text-lg font-bold ${plan.status === 'approved' ? 'text-emerald-800' : plan.status === 'rejected' ? 'text-rose-700' : 'text-amber-800'}`}>{tone}</p>

        {plan.status !== 'proposed' && (
          <p className="text-slate-600">
            By <b>{plan.decided_by}</b> on {fmtTime(plan.decided_at)}.
            {plan.notes && <><br />Note: “{plan.notes}”</>}
          </p>
        )}

        {plan.status === 'proposed' && !isOfficer && (
          <p className="rounded-lg bg-slate-100 p-3 text-slate-600">You have read-only access. A depot officer must approve this plan.</p>
        )}

        {plan.status === 'proposed' && isOfficer && (
          <>
            <p className="text-slate-600">Read through the plan, then approve it, or reject it and say why.</p>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Note (required if you reject)"
              className="w-full rounded-lg border border-slate-300 p-2.5 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200" />
            <div className="flex gap-2">
              <Btn kind="success" className="flex-1" onClick={() => setAsking('approve')}>✓ Approve</Btn>
              <Btn kind="danger" className="flex-1" onClick={() => notes.trim().length < 3 ? toast('Please write a reason first.', 'error') : setAsking('reject')}>✕ Reject</Btn>
            </div>
          </>
        )}
      </div>
      {asking && (
        <Confirm busy={busy} kind={asking === 'approve' ? 'success' : 'primary'}
          title={asking === 'approve' ? 'Approve tonight’s plan?' : 'Reject tonight’s plan?'}
          text={asking === 'approve' ? 'Every train will be set to the status shown in the plan.' : 'You will need to create a new plan afterwards.'}
          confirmText={asking === 'approve' ? 'Yes, approve' : 'Yes, reject'} onConfirm={decide} onCancel={() => setAsking(null)} />
      )}
    </Card>
  )
}

// ---- Choose a priority and create a fresh plan -----------------------------
function StrategyPicker({ strategies, value, onChange }) {
  return (
    <div className="space-y-2">
      {strategies.map((s) => (
        <label key={s.id} className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${value === s.id ? 'border-orange-500 bg-orange-50' : 'border-slate-200 hover:border-slate-300'}`}>
          <input type="radio" name="strategy" checked={value === s.id} onChange={() => onChange(s.id)} className="mt-1 accent-orange-600" />
          <span><b className="block">{s.label}</b><span className="text-sm text-slate-500">{s.description}</span></span>
        </label>
      ))}
    </div>
  )
}

function NewPlanCard({ plan, strategies, isOfficer, refresh, toast }) {
  const [strategy, setStrategy] = useState(plan.strategy)
  const [busy, setBusy] = useState(false)
  const [ask, setAsk] = useState(false)

  async function create() {
    setBusy(true)
    try { await api.createPlan(strategy); toast('New plan created. Please review it.'); setAsk(false); await refresh() }
    catch (e) { toast(e.message, 'error'); setAsk(false) } finally { setBusy(false) }
  }
  return (
    <Card title="Make a new plan" subtitle="Choose what matters most tonight.">
      <div className="space-y-3 p-5">
        <StrategyPicker {...{ strategies }} value={strategy} onChange={setStrategy} />
        {isOfficer
          ? <Btn className="w-full" onClick={() => (plan.status === 'proposed' ? create() : setAsk(true))} disabled={busy}>{busy ? 'Working…' : 'Create new plan'}</Btn>
          : <p className="text-sm text-slate-500">Only a depot officer can create plans.</p>}
      </div>
      {ask && <Confirm busy={busy} title="Replace the current plan?" confirmText="Create new plan"
        text={`The current plan is already ${plan.status}. A new plan will be proposed and will need approval again.`}
        onConfirm={create} onCancel={() => setAsk(false)} />}
    </Card>
  )
}

// ---- What-if: try changes without saving anything ---------------------------
function WhatIf({ plan, trains, isOfficer, refresh, toast }) {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [changes, setChanges] = useState({})
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)

  const add = (status) => { if (code) { setChanges({ ...changes, [code]: status }); setResult(null) } }
  const drop = (c) => { const n = { ...changes }; delete n[c]; setChanges(n); setResult(null) }

  async function preview() {
    setBusy(true)
    try { setResult(await api.preview(plan.strategy, changes)) } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }
  async function use() {
    setBusy(true)
    try { await api.createPlan(plan.strategy, changes); toast('New plan created. Please review it.'); setChanges({}); setResult(null); await refresh() }
    catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  return (
    <Card title="Try a change (what-if)" subtitle="See what would happen. Nothing is saved until you use it."
      right={<button onClick={() => setOpen(!open)} className="text-sm font-semibold text-orange-700">{open ? 'Hide' : 'Open'}</button>}>
      {open && (
        <div className="space-y-3 p-5">
          <select value={code} onChange={(e) => setCode(e.target.value)} className="w-full rounded-lg border border-slate-300 p-2.5">
            <option value="">Choose a train…</option>
            {trains.map((t) => <option key={t.code} value={t.code}>{t.code} · {LINES[t.line]} · now: {STATUS[t.tonight]?.label || '—'}</option>)}
          </select>
          <div className="flex gap-2">
            {Object.entries(STATUS).map(([k, v]) => (
              <button key={k} disabled={!code} onClick={() => add(k)} className="flex-1 rounded-lg border border-slate-300 px-2 py-2 text-sm font-semibold hover:border-orange-500">{v.label}</button>
            ))}
          </div>
          <p className="text-xs text-slate-500">Pick a train, then choose where it should go.</p>

          {Object.keys(changes).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(changes).map(([c, s]) => (
                <Chip key={c} className="border-orange-300 bg-orange-50 text-orange-800">
                  {c} → {STATUS[s].label}
                  <button onClick={() => drop(c)} aria-label={`Remove ${c}`} className="ml-1 font-bold">×</button>
                </Chip>
              ))}
            </div>
          )}

          <Btn kind="ghost" className="w-full" onClick={preview} disabled={busy || !Object.keys(changes).length}>Preview result</Btn>

          {result && (
            <div className="space-y-2 rounded-xl bg-slate-50 p-3">
              <p className="font-bold">If you do this:</p>
              {result.changes.length === 0 ? <p className="text-slate-600">Nothing changes.</p> : (
                <ul className="space-y-1">
                  {result.changes.map((c) => (
                    <li key={c.code}><b>{c.code}</b>: {STATUS[c.from]?.label} → <b>{STATUS[c.to].label}</b>{!changes[c.code] && <span className="text-slate-500"> (automatic, to keep the lines covered)</span>}</li>
                  ))}
                </ul>
              )}
              {result.summary.warnings.map((w, i) => <p key={i} className="text-amber-800">⚠️ {w}</p>)}
              {isOfficer && result.changes.length > 0 && <Btn className="w-full" onClick={use} disabled={busy}>Use this as the new plan</Btn>}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

function RulesCard() {
  const [open, setOpen] = useState(false)
  return (
    <Card title="How does the planner decide?" right={<button onClick={() => setOpen(!open)} className="text-sm font-semibold text-orange-700">{open ? 'Hide' : 'Show'}</button>}>
      {open && <ol className="ml-8 list-decimal space-y-2 p-5 pl-2 text-slate-700">{RULES.map((r) => <li key={r}>{r}</li>)}</ol>}
    </Card>
  )
}

function NoPlan({ strategies, isOfficer, refresh, toast }) {
  const [strategy, setStrategy] = useState('safest')
  return (
    <Card title="No plan for tonight yet" className="mx-auto max-w-lg">
      <div className="space-y-3 p-5">
        <StrategyPicker {...{ strategies }} value={strategy} onChange={setStrategy} />
        {isOfficer
          ? <Btn className="w-full" onClick={async () => { try { await api.createPlan(strategy); await refresh() } catch (e) { toast(e.message, 'error') } }}>Create plan</Btn>
          : <p className="text-slate-500">Ask a depot officer to create the plan.</p>}
      </div>
    </Card>
  )
}
