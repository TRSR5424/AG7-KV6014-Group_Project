import { useCallback, useEffect, useState } from 'react'
import Timeline from '../components/Timeline'
import { createEntry, listAppointments, listEntries } from '../lib/api'
import { formatEntryDate } from '../lib/timeline'

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
  const [timelineId, setTimelineId] = useState(null)
  const [scheduledAt, setScheduledAt] = useState('')
  const [ratings, setRatings] = useState({})
  const [medications, setMedications] = useState('')
  const [notes, setNotes] = useState('')
  const [entries, setEntries] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [closed, setClosed] = useState(false)
  const [saved, setSaved] = useState(null)
  const [correctionOf, setCorrectionOf] = useState(null)

  const loadEntries = useCallback(async (id) => {
    try {
      const data = await listEntries(token, id)
      setEntries(data.entries || [])
    } catch (err) {
      setError(err.message)
    }
  }, [token])

  useEffect(() => {
    let active = true
    async function loadAppointment() {
      try {
        const data = await listAppointments(token)
        const appointments = data.appointments || []
        const open = appointments.find((item) => item.status === 'open')
        const selected = open || appointments[appointments.length - 1]
        if (!active) return
        if (!selected) {
          setError('No appointment found')
          return
        }
        setTimelineId(selected.id)
        setScheduledAt(selected.scheduled_at)
        setClosed(!open)
        if (open) {
          setAppointmentId(open.id)
        }
        await loadEntries(selected.id)
      } catch (err) {
        if (active) setError(err.message)
      }
    }
    loadAppointment()
    return () => {
      active = false
    }
  }, [token, loadEntries])

  function startCorrection(entry) {
    setCorrectionOf(entry)
    setRatings({ ...entry.ratings })
    setMedications(entry.medications || '')
    setNotes(entry.notes || '')
    setSaved(null)
    setError(null)
  }

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
      const payload = { ratings: rated, medications, notes }
      if (correctionOf) {
        payload.correctionOf = correctionOf.id
      }
      const data = await createEntry(token, appointmentId, payload)
      setSaved({
        alert: Boolean(data.alert),
        message: data.urgentHelpMessage,
      })
      setRatings({})
      setMedications('')
      setNotes('')
      setCorrectionOf(null)
      await loadEntries(timelineId)
    } catch (err) {
      setError(err.message)
      if (err.message.toLowerCase().includes('closed')) {
        setClosed(true)
      }
    } finally {
      setLoading(false)
    }
  }

  let submitLabel = 'Save entry'
  if (loading) submitLabel = 'Saving...'
  else if (correctionOf) submitLabel = 'Save correction'

  return (
    <main className="auth-page patient-page">
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
        {correctionOf && (
          <p className="auth-subtitle">
            Correcting entry from {formatEntryDate(correctionOf.createdAt)}
          </p>
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
              {submitLabel}
            </button>
          </form>
        )}
        <Timeline
          entries={entries}
          onCorrect={closed ? undefined : startCorrection}
          emptyMessage="No entries recorded for this appointment yet"
          showLegend={false}
          showOriginalValues={false}
        />
        <button type="button" className="auth-submit" onClick={onLogout}>
          Sign out
        </button>
      </section>
    </main>
  )
}

export default PatientDashboard
