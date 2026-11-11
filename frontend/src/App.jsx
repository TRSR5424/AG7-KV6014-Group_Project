import { useState } from 'react'
import './App.css'
import LoginPage from './pages/LoginPage'
import ActivationPage from './pages/ActivationPage'
import GPDashboard from './pages/GPDashboard'
import PatientDashboard from './pages/PatientDashboard'
import { STORAGE_KEY, readStoredAuth, readInviteToken } from './lib/auth'

function App() {
  const [auth, setAuth] = useState(readStoredAuth)
  const [mode, setMode] = useState(() => (readInviteToken() ? 'activate' : 'login'))
  function handleLogin(next) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setAuth(next)
  }

  function handleLogout() {
    localStorage.removeItem(STORAGE_KEY)
    setAuth(null)
    setMode('login')
  }

  if (!auth) {
    if (mode === 'activate') {
      return (
        <ActivationPage
          onLogin={handleLogin}
          onShowLogin={() => setMode('login')}
        />
      )
    }
    return (
      <LoginPage
        onLogin={handleLogin}
        onShowActivate={() => setMode('activate')}
      />
    )
  }

  if (auth.user.role === 'patient') {
    return <PatientDashboard user={auth.user} onLogout={handleLogout} />
  }

  return (
    <GPDashboard user={auth.user} token={auth.token} onLogout={handleLogout} />
  )
}

export default App
