import { bandLabel, formatEntryDate, ratingChanges, symptomLabel, textChange } from '../lib/timeline'

function ChangeTag({ change }) {
  if (change.isNew) return <span className="change down">New rating</span>
  if (change.delta === 0) return <span className="change same">No change</span>
  const style = change.delta > 0 ? 'up' : 'down'
  return (
    <span className={`change ${style}`}>
      {change.delta > 0 ? `+${change.delta}` : change.delta} since previous
    </span>
  )
}

function TextTag({ change }) {
  if (!change || change.state === 'same') return null
  let style = ''
  if (change.state === 'new') style = 'down'
  if (change.state === 'removed') style = 'up'
  return (
    <span className={`change ${style}`}>
      {change.state.charAt(0).toUpperCase() + change.state.slice(1)}
    </span>
  )
}

function TextSection({ heading, value, change }) {
  if (!change) return null
  const highlight = change.state === 'changed' || change.state === 'new'
  return (
    <section className="block">
      <div className="bar">
        <h4>{heading}</h4>
        <TextTag change={change} />
      </div>
      <p className={highlight ? 'note highlight' : 'note'}>{value || '(empty)'}</p>
      {change.previous && change.state !== 'same' && (
        <details className="details">
          <summary>Previous entry said</summary>
          <p>{change.previous}</p>
        </details>
      )}
    </section>
  )
}

function Timeline({ entries = [], title = 'Patient timeline', emptyMessage = 'No entries recorded yet', onCorrect, showLegend = true, showOriginalValues = true }) {
  const sorted = [...entries].sort((a, b) => {
    const first = new Date(a.createdAt).getTime()
    const second = new Date(b.createdAt).getTime()
    if (Number.isNaN(first) || Number.isNaN(second)) return 0
    return first - second
  })
  const originals = new Map(
    sorted.map((entry, index) => [entry.id, { entry, number: index + 1 }]),
  )

  return (
    <section className="timeline" aria-label={title}>
      <div className="bar">
        <h3>{title}</h3>
        {showLegend && (
          <p className="legend">
            Ratings: <span className="dot green" /> low (0-3)
            <span className="dot amber" /> monitor (4-7)
            <span className="dot red" /> urgent (8-10)
          </p>
        )}
      </div>
      {sorted.length === 0 ? (
        <p className="empty">{emptyMessage}</p>
      ) : (
        <ol className="list">
          {sorted.map((entry, index) => {
            const previous = index > 0 ? sorted[index - 1] : null
            const changes = ratingChanges(entry, previous)
            const original = entry.correctionOf ? originals.get(entry.correctionOf) : null
            return (
              <li key={entry.id || index}>
                <article className="entry">
                  <header className="bar">
                    <div>
                      <h4>Entry {index + 1}</h4>
                      <p className="date">{formatEntryDate(entry.createdAt)}</p>
                    </div>
                    <div className="actions">
                      {entry.correctionOf && (
                        <span className="badge correction">
                          {original ? `Correction of entry ${original.number}` : 'Correction'}
                        </span>
                      )}
                      {entry.alert && <span className="badge alert">Urgent alert</span>}
                    </div>
                  </header>

                  {changes.length > 0 ? (
                    <ul className="ratings">
                      {changes.map((change) => (
                        <li key={change.symptom} className="rating">
                          <span className="name">{symptomLabel(change.symptom)}</span>
                          <span
                            className={`score ${change.band}`}
                            title={`${bandLabel(change.band)}: ${change.value} out of 10`}
                          >
                            <strong>{change.value}</strong>
                            <span>/10</span>
                          </span>
                          <span className="detail">
                            <ChangeTag change={change} />
                            {change.previousBand && change.previousBand !== change.band && (
                              <span>
                                {bandLabel(change.previousBand)} to {bandLabel(change.band)}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="note">No symptom ratings</p>
                  )}

                  <TextSection
                    heading="Medications taken"
                    value={entry.medications}
                    change={textChange(entry.medications, previous?.medications)}
                  />
                  <TextSection
                    heading="Notes"
                    value={entry.notes}
                    change={textChange(entry.notes, previous?.notes)}
                  />

                  {showOriginalValues && original && (
                    <details className="details">
                      <summary>Values from the original entry {original.number}</summary>
                      <p>{formatEntryDate(original.entry.createdAt)}</p>
                      <ul>
                        {ratingChanges(original.entry).map((change) => (
                          <li key={change.symptom}>
                            {symptomLabel(change.symptom)}: {change.value}/10 ({bandLabel(change.band)})
                          </li>
                        ))}
                      </ul>
                      {original.entry.medications && <p>Medications: {original.entry.medications}</p>}
                      {original.entry.notes && <p>Notes: {original.entry.notes}</p>}
                    </details>
                  )}

                  {onCorrect && (
                    <button type="button" className="button" onClick={() => onCorrect(entry)}>
                      Correct this entry
                    </button>
                  )}
                </article>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

export default Timeline
