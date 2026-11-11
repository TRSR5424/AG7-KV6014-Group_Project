import { useState } from 'react'
import { readInviteToken } from '../lib/auth'

function ActivationPage({ onLogin, onShowLogin }) {
  const [token, setToken] = useState(readInviteToken)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError(null)
    if (!token || !email || !password || !confirmPassword || !consent) {
      setError('Please fill in all fields and agree to the terms')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 10) {
      setError('Password must be at least 10 characters')
      return
    }
    setLoading(true)
    try {
      const response = await fetch('/api/auth/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email, password, consentGiven: true }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Activation failed')
      }
      onLogin({ token: data.token, user: data.user })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h2>Activate your account</h2>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <div className="auth-field">
          <label htmlFor="token">Invite token:</label>
          <input
            type="text"
            id="token"
            value={token}
            onChange={(event) => setToken(event.target.value)}
          />
        </div>
        <div className="auth-field">
          <label htmlFor="email">Email:</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="auth-field">
          <label htmlFor="password">Password:</label>
          <input
            type="password"
            id="password"
            minLength={10}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <div className="auth-field">
          <label htmlFor="confirmPassword">Confirm password:</label>
          <input
            type="password"
            id="confirmPassword"
            minLength={10}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </div>
        <label className="auth-consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
          />
          <span>
            I understand this app is not an emergency service and agree to my symptom data being shared with my GP
          </span>
        </label>
        <button type="submit" className="auth-submit" disabled={loading}>
          {loading ? 'Activating...' : 'Activate account'}
        </button>
        <p className="auth-switch">
          Already activated?{' '}
          <button type="button" className="auth-link" onClick={onShowLogin}>
            Back to sign in
          </button>
        </p>
      </form>
    </main>
  )
}

export default ActivationPage
