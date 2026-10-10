// Keep the bearer token in memory only. Persisted browser tokens caused the
// dashboard to reopen without asking for credentials on a later visit.
const LEGACY_KEY = 'metro_token'
try {
  localStorage.removeItem(LEGACY_KEY)
} catch {
  // Storage may be unavailable in privacy-restricted browser contexts.
}

let accessToken = null
export const token = {
  get: () => accessToken,
  set: (value) => { accessToken = value },
  clear: () => { accessToken = null },
}

async function call(path, { method = 'GET', body, blob, formData } = {}) {
  let res
  try {
    const headers = {}
    if (!formData) {
      headers['Content-Type'] = 'application/json'
    }
    if (token.get()) {
      headers['Authorization'] = 'Bearer ' + token.get()
    }

    res = await fetch('/api' + path, {
      method,
      headers,
      body: formData ? formData : (body ? JSON.stringify(body) : undefined),
    })
  } catch {
    throw new Error('Cannot reach the server. Is it running?')
  }
  if (res.status === 401 && path !== '/login') {
    token.clear()
    window.dispatchEvent(new Event('metro-logout'))
  }
  if (!res.ok) {
    let msg = 'Something went wrong. Please try again.'
    try {
      const j = await res.json()
      if (typeof j.detail === 'string') msg = j.detail
      else if (Array.isArray(j.detail)) msg = j.detail.map(d => `${d.loc ? d.loc.join('.') + ': ' : ''}${d.msg}`).join('; ')
    } catch {}
    throw new Error(msg)
  }
  return blob ? res.blob() : res.json()
}

export const api = {
  health: () => call('/health'),
  login: (username, password) => call('/login', { method: 'POST', body: { username, password } }),
  me: () => call('/me'),
  overview: () => call('/overview'),
  trains: () => call('/trains'),
  audit: (limit = 100, offset = 0) => call(`/audit?limit=${limit}&offset=${offset}`),
  exportTrains: () => call('/trains/export.csv', { blob: true }),
  importTrainsCsv: (file) => {
    const fd = new FormData()
    fd.append('file', file)
    return call('/trains/import.csv', { method: 'POST', formData: fd })
  },
  train: (code) => call(`/trains/${code}`),
  createTrain: (data) => call('/trains', { method: 'POST', body: data }),
  updateTrain: (code, data) => call(`/trains/${code}`, { method: 'PUT', body: data }),
  deleteTrain: (code) => call(`/trains/${code}`, { method: 'DELETE' }),

  // Timetable
  timetable: () => call('/timetable'),
  updateTimetable: (line, data) => call(`/timetable/${line}`, { method: 'PUT', body: data }),

  // Stations & Depots
  stations: () => call('/stations'),
  createStation: (data) => call('/stations', { method: 'POST', body: data }),
  updateStation: (code, data) => call(`/stations/${code}`, { method: 'PUT', body: data }),
  deleteStation: (code) => call(`/stations/${code}`, { method: 'DELETE' }),

  depots: () => call('/depots'),
  createDepotBay: (data) => call('/depots', { method: 'POST', body: data }),
  updateDepotBay: (id, data) => call(`/depots/${id}`, { method: 'PUT', body: data }),
  deleteDepotBay: (id) => call(`/depots/${id}`, { method: 'DELETE' }),

  // Constraints & Presets
  constraints: () => call('/constraints'),
  updateConstraints: (constraints) => call('/constraints', { method: 'PUT', body: { constraints } }),
  savePreset: (name, description, config) => call('/constraints/presets', { method: 'POST', body: { name, description, config } }),
  applyPreset: (id) => call(`/constraints/presets/${id}/apply`, { method: 'POST' }),
  resetConstraintsDefaults: () => call('/constraints/reset-defaults', { method: 'POST' }),

  // Scheduler Run & Compare
  scheduleRun: (strategy = 'safest', changes = {}, save = true) =>
    call('/schedule/run', { method: 'POST', body: { strategy, changes, save } }),
  scheduleHistory: (limit = 15) => call(`/schedule/history?limit=${limit}`),

  // Change Log & Synthetic Reset
  changeLog: (limit = 100, offset = 0, entity_type = null) =>
    call(`/changelog?limit=${limit}&offset=${offset}${entity_type ? `&entity_type=${entity_type}` : ''}`),
  resetSyntheticData: () => call('/reset-synthetic-data', { method: 'POST' }),

  // Standard Plan actions
  strategies: () => call('/strategies'),
  plan: () => call('/plan'),
  preview: (strategy, changes) => call('/plan/preview', { method: 'POST', body: { strategy, changes } }),
  createPlan: (strategy, changes = {}) => call('/plan', { method: 'POST', body: { strategy, changes } }),
  approve: (notes) => call('/plan/approve', { method: 'POST', body: { notes } }),
  reject: (notes) => call('/plan/reject', { method: 'POST', body: { notes } }),
  report: () => call('/plan/report', { blob: true }),
  reportFault: (code, description, severity) =>
    call(`/trains/${code}/faults`, { method: 'POST', body: { description, severity } }),
  resolveFault: (id) => call(`/faults/${id}/resolve`, { method: 'POST' }),
}
