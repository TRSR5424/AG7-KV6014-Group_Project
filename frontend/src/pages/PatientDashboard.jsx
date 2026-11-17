import { useEffect, useState } from 'react'

const SYMPTOM_GROUPS = [
  { heading: 'General', symptoms: ['temperature', 'fatigue'] },
  { heading: 'Respiratory', symptoms: ['cough', 'breathing'] },
  { heading: 'Pain and comfort', symptoms: ['pain', 'headache'] },
  { heading: 'Digestive', symptoms: ['nausea'] },
  { heading: 'Other (please specify)', symptoms: ['other'] }
]

const URGENT_NOTICE = 'If you need urgent help, call 999. This app is not an emergency service.'

function PatientDashboard({ user, token, onLogout }) {
  const [appointmentId, setAppointmentId] = useState(null)
  const [scheduledAt, setScheduledAt] = useState('')
  const [ratings, setRatings] = useState({})
  const [medications, setMedications] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [closed, setClosed] = useState(false)
  const [saved, setSaved] = useState(null)

  useEffect(() => {
    async function loadAppointment() {
      try {
        const response = await fetch('/api/appointments', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(data.error || 'Could not load appointments')
        }
        const open = (data.appointments || []).find((item) => item.status === 'open')
        if (!open) {
          setClosed(true)
          setError('No open appointment found')
          return
        }
        setAppointmentId(open.id)
        setScheduledAt(open.scheduled_at)
      } catch (err) {
        setError(err.message)
      }
    }
    loadAppointment()
  }, [token])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError(null)
    setSaved(null)
    const rated = Object.fromEntries(
      Object.entries(ratings).filter(([, value]) => value !== ''),
    )
    if (Object.keys(rated).length === 0) {
      setError('Please rate at least one symptom')
      return
    }
    if (!appointmentId) {
      setError('No open appointment found')
      return
    }
    setLoading(true)
    try {
      const response = await fetch(`/api/appointments/${appointmentId}/entries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ratings: rated, medications, notes }),
      })
      const data = await response.json().catch(() => ({}))
      if (response.status === 409) {
        setClosed(true)
        setError(data.error || 'This log is closed')
        return
      }
      if (!response.ok) {
        throw new Error(data.error || 'Could not save entry')
      }
      setSaved({ alert: Boolean(data.alert), message: data.urgentHelpMessage })
      setRatings({})
      setMedications('')
      setNotes('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card patient-card">
        <h2>Patient dashboard</h2>
        <p className="auth-subtitle">Signed in as {user.email}</p>
        {scheduledAt && (
          <p className="auth-subtitle">
            Appointment: {new Date(scheduledAt).toLocaleString()}
          </p>
        )}
        <p className="auth-error" role="alert">{URGENT_NOTICE}</p>
        {error && <p className="auth-error" role="alert">{error}</p>}
        {saved && (
          <div className="auth-invite">
            <p className="auth-subtitle">Entry saved</p>
            {saved.alert && saved.message && (
              <p className="auth-error" role="alert">{saved.message}</p>
            )}
          </div>
        )}
        {!closed && (
          <form className="auth-form" onSubmit={handleSubmit}>
            {SYMPTOM_GROUPS.map((group) => (
              <fieldset key={group.heading} className="symptom-group">
                <legend>{group.heading}</legend>
                {group.symptoms.map((symptom) => (
                  <div key={symptom} className="symptom-row">
                    <label htmlFor={`symptom-${symptom}`}>
                      {symptom.charAt(0).toUpperCase() + symptom.slice(1)}:
                    </label>
                    <input
                      type="number"
                      id={`symptom-${symptom}`}
                      min="0"
                      max="10"
                      step="1"
                      placeholder="0-10"
                      value={ratings[symptom] ?? ''}
                      onChange={(event) =>
                        setRatings({ ...ratings, [symptom]: event.target.value })
                      }
                    />
                  </div>
                ))}
              </fieldset>
            ))}
            <div className="auth-field">
              <label htmlFor="medications">Medications taken:</label>
              <textarea
                id="medications"
                rows="3"
                maxLength="1000"
                value={medications}
                onChange={(event) => setMedications(event.target.value)}
              />
            </div>
            <div className="auth-field">
              <label htmlFor="notes">Notes:</label>
              <textarea
                id="notes"
                rows="4"
                maxLength="2000"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
            <button type="submit" className="auth-submit" disabled={loading || !appointmentId}>
              {loading ? 'Saving...' : 'Save entry'}
            </button>
          </form>
        )}
        <button type="button" className="auth-submit" onClick={onLogout}>
          Sign out
        </button>
      </section>
    </main>
  )
}

export default PatientDashboard
