function PatientDashboard({ user, onLogout }) {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <h2>Patient dashboard</h2>
        <p className="auth-subtitle">Signed in as {user.email}</p>
        <p className="auth-subtitle">This dashboard is a test</p>
        <button type="button" className="auth-submit" onClick={onLogout}>
          Sign out
        </button>
      </section>
    </main>
  )
}

export default PatientDashboard
