import React from 'react'

/**
 * BentoGridSkeleton
 * Shimmer pulse skeleton reproducing the exact dimensions and grid layout
 * of the Overview Bento dashboard to eliminate layout shift (CLS: 0).
 */
export default function BentoGridSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading fleet command center">
      {/* 1. Hero Command Center Banner */}
      <section className="command-hero relative isolate overflow-hidden rounded-3xl p-5 text-white shadow-xl sm:p-7 lg:p-8">
        <div className="command-hero__glow" aria-hidden="true" />
        <div className="relative z-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(290px,.82fr)] lg:items-center">
          {/* Left Column */}
          <div>
            <div className="flex items-center gap-2">
              <div className="h-4 w-44 rounded-full skeleton-shimmer-dark" />
              <div className="h-5 w-24 rounded-full skeleton-shimmer-dark" />
            </div>
            <div className="mt-4 h-10 w-3/4 rounded-xl skeleton-shimmer-dark sm:h-12" />
            <div className="mt-3 h-4 w-full max-w-lg rounded-lg skeleton-shimmer-dark" />
            <div className="mt-2 h-4 w-2/3 max-w-md rounded-lg skeleton-shimmer-dark" />

            <div className="mt-6 flex flex-wrap gap-2">
              <div className="h-10 w-44 rounded-xl skeleton-shimmer-dark" />
              <div className="h-10 w-28 rounded-xl skeleton-shimmer-dark" />
            </div>
          </div>

          {/* Right Corridor Card */}
          <div className="command-routes rounded-2xl border border-white/10 bg-black/10 p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="h-3 w-28 rounded skeleton-shimmer-dark" />
              <div className="h-3 w-16 rounded skeleton-shimmer-dark" />
            </div>
            {/* Route Status Rows */}
            <div className="space-y-3">
              <div className="h-9 w-full rounded-lg skeleton-shimmer-dark" />
              <div className="h-9 w-full rounded-lg skeleton-shimmer-dark" />
            </div>
            {/* Metrics */}
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/10 pt-4">
              <div className="space-y-1.5">
                <div className="h-6 w-12 rounded skeleton-shimmer-dark" />
                <div className="h-2.5 w-14 rounded skeleton-shimmer-dark" />
              </div>
              <div className="space-y-1.5">
                <div className="h-6 w-12 rounded skeleton-shimmer-dark" />
                <div className="h-2.5 w-14 rounded skeleton-shimmer-dark" />
              </div>
              <div className="space-y-1.5">
                <div className="h-6 w-12 rounded skeleton-shimmer-dark" />
                <div className="h-2.5 w-14 rounded skeleton-shimmer-dark" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Headline / Plan Alert Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="size-2.5 rounded-full skeleton-shimmer" />
          <div className="space-y-1.5">
            <div className="h-4 w-40 rounded skeleton-shimmer" />
            <div className="h-3 w-64 rounded skeleton-shimmer" />
          </div>
        </div>
        <div className="h-9 w-28 rounded-lg skeleton-shimmer" />
      </div>

      {/* 3. Row 1: Line Readiness & Notifications */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Card: Line Readiness */}
        <div className="dashboard-panel rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="space-y-1">
              <div className="h-4 w-28 rounded skeleton-shimmer" />
              <div className="h-3 w-44 rounded skeleton-shimmer" />
            </div>
          </div>
          <div className="space-y-4 pt-1">
            <div className="space-y-2">
              <div className="flex justify-between">
                <div className="h-3 w-24 rounded skeleton-shimmer" />
                <div className="h-3 w-16 rounded skeleton-shimmer" />
              </div>
              <div className="h-2 w-full rounded-full skeleton-shimmer" />
              <div className="flex gap-1 pt-1">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-5 w-8 rounded skeleton-shimmer" />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <div className="h-3 w-24 rounded skeleton-shimmer" />
                <div className="h-3 w-16 rounded skeleton-shimmer" />
              </div>
              <div className="h-2 w-full rounded-full skeleton-shimmer" />
              <div className="flex gap-1 pt-1">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-5 w-8 rounded skeleton-shimmer" />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Card: Notifications */}
        <div className="dashboard-panel rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="space-y-1">
              <div className="h-4 w-32 rounded skeleton-shimmer" />
              <div className="h-3 w-28 rounded skeleton-shimmer" />
            </div>
          </div>
          <div className="flex gap-2 pb-3">
            <div className="h-10 flex-1 rounded-md skeleton-shimmer" />
            <div className="h-10 flex-1 rounded-md skeleton-shimmer" />
            <div className="h-10 flex-1 rounded-md skeleton-shimmer" />
          </div>
          <div className="space-y-3 border-t border-slate-100 pt-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-2">
                <div className="size-2 rounded-full skeleton-shimmer mt-1 shrink-0" />
                <div className="space-y-1 flex-1">
                  <div className="h-3.5 w-3/4 rounded skeleton-shimmer" />
                  <div className="h-2.5 w-full rounded skeleton-shimmer" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4. Row 2: Live Fleet Deployment (Full Width) */}
      <div className="dashboard-panel rounded-2xl bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="space-y-1">
            <div className="h-4 w-48 rounded skeleton-shimmer" />
            <div className="h-3 w-36 rounded skeleton-shimmer" />
          </div>
          <div className="h-4 w-28 rounded skeleton-shimmer" />
        </div>
        <div className="space-y-4 pt-1">
          <div className="h-16 w-full rounded-lg skeleton-shimmer" />
          <div className="h-16 w-full rounded-lg skeleton-shimmer" />
          <div className="grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
            <div className="h-12 rounded-lg skeleton-shimmer" />
            <div className="h-12 rounded-lg skeleton-shimmer" />
          </div>
        </div>
      </div>

      {/* 5. Row 3: Fleet Summary & Active Management Portal */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        {/* Card: Fleet Summary */}
        <div className="dashboard-panel rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="space-y-1">
              <div className="h-4 w-36 rounded skeleton-shimmer" />
              <div className="h-3 w-48 rounded skeleton-shimmer" />
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-[minmax(170px,0.75fr)_minmax(0,1fr)]">
            <div className="flex items-center gap-4">
              <div className="size-24 rounded-full skeleton-shimmer shrink-0" />
              <div className="space-y-2 flex-1">
                <div className="h-3 w-20 rounded skeleton-shimmer" />
                <div className="h-3 w-16 rounded skeleton-shimmer" />
                <div className="h-3 w-20 rounded skeleton-shimmer" />
              </div>
            </div>
            <div className="space-y-3">
              <div className="h-3 w-36 rounded skeleton-shimmer" />
              <div className="h-4 w-full rounded skeleton-shimmer" />
              <div className="h-4 w-full rounded skeleton-shimmer" />
              <div className="h-4 w-full rounded skeleton-shimmer" />
            </div>
          </div>
        </div>

        {/* Card: Active Management Portal */}
        <div className="dashboard-panel rounded-2xl bg-white p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="h-4 w-40 rounded skeleton-shimmer" />
            <div className="mt-2 h-3 w-28 rounded skeleton-shimmer" />
            <div className="mt-4 h-14 w-full rounded-xl skeleton-shimmer" />
          </div>
          <div className="mt-4 h-10 w-full rounded-xl skeleton-shimmer" />
        </div>
      </div>
    </div>
  )
}
