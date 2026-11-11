import { useState } from 'react'

function GPDashboard({ user, token, onLogout }) {
  const [email, setEmail] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [invite, setInvite] = useState(null)

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
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const inviteLink = invite ? `${window.location.origin}/?token=${invite.inviteToken}` : ''

  return (
    <main className="auth-page">
      <section className="auth-card">
        <h2>GP dashboard</h2>
        <p className="auth-subtitle">Signed in as {user.email}</p>

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
          {error && <p className="auth-error" role="alert">{error}</p>}
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

        <button type="button" className="auth-submit" onClick={onLogout}>
          Sign out
        </button>
      </section>
    </main>
  )
}

export default GPDashboard
