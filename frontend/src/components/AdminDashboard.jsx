import React, { useState } from 'react'
import FleetAdminTab from './FleetAdminTab'
import TimetableAdminTab from './TimetableAdminTab'
import ConstraintsAdminTab from './ConstraintsAdminTab'
import RunCompareTab from './RunCompareTab'
import ChangeLogTab from './ChangeLogTab'

const ADMIN_SUBTABS = [
  { id: 'fleet', label: 'Fleet & Trains' },
  { id: 'timetable', label: 'Timetable & Infrastructure' },
  { id: 'constraints', label: 'Constraints' },
  { id: 'run_compare', label: 'Run & Compare' },
  { id: 'changelog', label: 'Change Log' },
]

export default function AdminDashboard({
  trains,
  onRefresh,
  toast,
  isOfficer,
  onPlanCreated,
}) {
  const [subTab, setSubTab] = useState('fleet')

  return (
    <section className="page-enter space-y-6">
      {/* Admin header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-black tracking-tight text-slate-900">
            Admin & Data Manager
          </h2>
          <p className="text-sm text-slate-500">
            Maintain fleet assets, timetable specifications, mathematical CP-SAT constraints, and audit trails.
          </p>
        </div>
      </div>

      {/* Sub-tab navigation */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {ADMIN_SUBTABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              subTab === tab.id
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sub-tab bodies */}
      <div className="pt-1">
        {subTab === 'fleet' && (
          <FleetAdminTab
            trains={trains}
            onRefresh={onRefresh}
            toast={toast}
            isOfficer={isOfficer}
          />
        )}

        {subTab === 'timetable' && (
          <TimetableAdminTab
            toast={toast}
            isOfficer={isOfficer}
          />
        )}

        {subTab === 'constraints' && (
          <ConstraintsAdminTab
            toast={toast}
            isOfficer={isOfficer}
            onConstraintsChanged={onRefresh}
          />
        )}

        {subTab === 'run_compare' && (
          <RunCompareTab
            toast={toast}
            isOfficer={isOfficer}
            onPlanCreated={() => {
              onRefresh()
              if (onPlanCreated) onPlanCreated()
            }}
          />
        )}

        {subTab === 'changelog' && (
          <ChangeLogTab
            toast={toast}
            isOfficer={isOfficer}
            onResetComplete={onRefresh}
          />
        )}
      </div>
    </section>
  )
}
