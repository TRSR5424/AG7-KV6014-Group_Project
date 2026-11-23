const jsonHeaders = { 'Content-Type': 'application/json' }

async function request(path, token, options = {}) {
  return fetch(path, {
    ...options,
    headers: {
      ...(options.body ? jsonHeaders : {}),
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  })
}

async function requestJson(path, token, options = {}, fallbackError) {
  const response = await request(path, token, options)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || fallbackError)
  }
  return data
}

export function listAppointments(token) {
  return requestJson('/api/appointments', token, {}, 'Could not load appointments')
}

export function getAppointment(token, id) {
  return requestJson(
    `/api/appointments/${encodeURIComponent(id)}`,
    token,
    {},
    'Could not load appointment',
  )
}

export function listEntries(token, id) {
  return requestJson(
    `/api/appointments/${encodeURIComponent(id)}/entries`,
    token,
    {},
    'Could not load entries',
  )
}

export function createEntry(token, id, entry) {
  return requestJson(
    `/api/appointments/${encodeURIComponent(id)}/entries`,
    token,
    { method: 'POST', body: JSON.stringify(entry) },
    'Could not save entry',
  )
}

export function closeAppointment(token, id) {
  return requestJson(
    `/api/appointments/${encodeURIComponent(id)}/close`,
    token,
    { method: 'PATCH' },
    'Could not close log',
  )
}

export async function downloadSummary(token, id) {
  const response = await request(`/api/appointments/${encodeURIComponent(id)}/summary`, token)
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.error || 'Could not download summary')
  }
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = `appointment-${id}-summary.pdf`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
