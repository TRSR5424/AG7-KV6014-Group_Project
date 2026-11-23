import { useCallback, useEffect, useState } from 'react'
import Timeline from '../components/Timeline'
import { closeAppointment, downloadSummary, getAppointment, listAppointments, listEntries } from '../lib/api'
import { formatEntryDate } from '../lib/timeline'

const PATIENT_PREFIX = '#/gp/patients/'
const PATIENT_LIST_ROUTE = '#/gp/patients'

function currentPatientRoute() {
  if (!window.location.hash.startsWith(PATIENT_PREFIX)) return null
  return window.location.hash.slice(PATIENT_PREFIX.length) || null
}

function navigateToPatient(id) {
  window.location.hash = `${PATIENT_PREFIX}${id}`
}

function navigateToPatientList() {
  window.location.hash = PATIENT_LIST_ROUTE
}

function GPDashboard({ user, token, onLogout }) {
  const [email, setEmail] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [invite, setInvite] = useState(null)
  const [appointments, setAppointments] = useState([])
  const [selectedId, setSelectedId] = useState(() => currentPatientRoute())
  const [selected, setSelected] = useState(null)
  const [entries, setEntries] = useState([])
  const [detailLoading, setDetailLoading] = useState(false)

  const loadPatientList = useCallback(async () => {
    try {
      const data = await listAppointments(token)
      const rows = await Promise.all((data.appointments || []).map(async (appointment) => {
        try {
          const entryData = await listEntries(token, appointment.id)
          const sorted = (entryData.entries || []).slice().sort((a, b) => {
            const first = new Date(a.createdAt).getTime()
            const second = new Date(b.createdAt).getTime()
            if (Number.isNaN(first) || Number.isNaN(second)) return 0
            return first - second
          })
          return { ...appointment, latestEntry: sorted[sorted.length - 1] || null }
        } catch {
          return { ...appointment, latestEntry: null }
        }
      }))
      rows.sort((a, b) => {
        const first = new Date(a.latestEntry?.createdAt || a.scheduled_at).getTime()
        const second = new Date(b.latestEntry?.createdAt || b.scheduled_at).getTime()
        if (Number.isNaN(first) || Number.isNaN(second)) return 0
        return second - first
      })
      setAppointments(rows)
    } catch (err) {
      setError(err.message)
    }
  }, [token])

  useEffect(() => {
    async function load() {
      await loadPatientList()
    }
    load()
  }, [loadPatientList])

  useEffect(() => {
    function handleHashChange() {
      setSelectedId(currentPatientRoute())
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  useEffect(() => {
    let active = true
    async function loadSelected() {
      if (!selectedId) {
        setSelected(null)
        setEntries([])
        return
      }
      setDetailLoading(true)
      setError(null)
      try {
        const [detail, entryData] = await Promise.all([
          getAppointment(token, selectedId),
          listEntries(token, selectedId),
        ])
        if (!active) return
        setSelected(detail)
        setEntries(entryData.entries || [])
      } catch (err) {
        if (active) setError(err.message)
      } finally {
        if (active) setDetailLoading(false)
      }
    }
    loadSelected()
    return () => {
      active = false
    }
  }, [selectedId, token])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError(null)
    setInvite(null)
    if (!email || !scheduledAt) {
      setError('Please enter an email and appointment date')
      return
    }
    setLoading(true)
    try {
      const response = await fetch('/api/invites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email, scheduledAt: new Date(scheduledAt).toISOString() }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Could not create invite')
      }
      setInvite(data)
      setEmail('')
      setScheduledAt('')
      await loadPatientList()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleClose() {
    setError(null)
    setDetailLoading(true)
    try {
      await closeAppointment(token, selectedId)
      setSelected((current) => (current ? { ...current, status: 'closed' } : current))
      await loadPatientList()
    } catch (err) {
      setError(err.message)
    } finally {
      setDetailLoading(false)
    }
  }

  async function handleDownload() {
    setError(null)
    setDetailLoading(true)
    try {
      await downloadSummary(token, selectedId)
    } catch (err) {
      setError(err.message)
    } finally {
      setDetailLoading(false)
    }
  }

  const inviteLink = invite ? `${window.location.origin}/?token=${invite.inviteToken}` : ''

  return (
    <main className="auth-page gp-page">
      <section className="auth-card gp-card">
        <div className="bar">
          <div>
            <h2>GP dashboard</h2>
            <p className="auth-subtitle">Signed in as {user.email}</p>
          </div>
          <button type="button" className="auth-link" onClick={onLogout}>
            Sign out
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="patientEmail">Patient email:</label>
            <input
              type="email"
              id="patientEmail"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="auth-field">
            <label htmlFor="scheduledAt">Appointment date:</label>
            <input
              type="datetime-local"
              id="scheduledAt"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
            />
          </div>
          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? 'Creating...' : 'Create invite'}
          </button>
        </form>

        {invite && (
          <div className="auth-invite">
            <p className="auth-subtitle">Invite created, send this</p>
            <code>{inviteLink}</code>
          </div>
        )}
        {error && <p className="auth-error" role="alert">{error}</p>}
        {selectedId ? (
          <section className="section">
            <div className="bar">
              <div>
                <h3>{selected?.patient_email || 'Patient timeline'}</h3>
                <p className="auth-subtitle">
                  {selected?.scheduled_at
                    ? `Appointment: ${formatEntryDate(selected.scheduled_at)}`
                    : 'Loading appointment...'}
                  {selected?.status && ` - ${selected.status}`}
                </p>
              </div>
              <div className="actions">
                <button type="button" className="auth-link" onClick={navigateToPatientList}>
                  Back to patients
                </button>
                <button type="button" className="button" onClick={handleDownload} disabled={detailLoading}>
                  Download PDF
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={handleClose}
                  disabled={detailLoading || selected?.status !== 'open'}
                >
                  Close log
                </button>
              </div>
            </div>
            <Timeline
              entries={entries}
              title="Patient entries"
              emptyMessage={detailLoading ? 'Loading entries...' : 'No entries recorded for this patient yet'}
            />
          </section>
        ) : (
          <section className="section">
            <div className="bar">
              <h3>Patients</h3>
              <button type="button" className="auth-link" onClick={loadPatientList}>
                Refresh
              </button>
            </div>
            {appointments.length === 0 ? (
              <p className="empty">No patients or appointments yet</p>
            ) : (
              <div className="scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Patient</th>
                      <th>Appointment</th>
                      <th>Status</th>
                      <th>Latest entry</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {appointments.map((row) => (
                      <tr key={row.id}>
                        <td>{row.patient_email || 'Awaiting activation'}</td>
                        <td>{formatEntryDate(row.scheduled_at)}</td>
                        <td>{row.status}</td>
                        <td>{row.latestEntry ? formatEntryDate(row.latestEntry.createdAt) : 'No entries'}</td>
                        <td>
                          <button type="button" className="button" onClick={() => navigateToPatient(row.id)}>
                            View timeline
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </section>
    </main>
  )
}

export default GPDashboard
