const SYMPTOMS = [
  'temperature',
  'fatigue',
  'cough',
  'breathing',
  'pain',
  'headache',
  'nausea',
  'other',
]

const SYMPTOM_LABELS = {
  temperature: 'Temperature',
  fatigue: 'Fatigue',
  cough: 'Cough',
  breathing: 'Breathing',
  pain: 'Pain',
  headache: 'Headache',
  nausea: 'Nausea',
  other: 'Other',
}

export function symptomLabel(symptom) {
  return SYMPTOM_LABELS[symptom] || symptom.charAt(0).toUpperCase() + symptom.slice(1)
}

export function ratingBand(rating) {
  const value = Number(rating)
  if (value >= 8) return 'red'
  if (value >= 4) return 'amber'
  return 'green'
}

export function bandLabel(band) {
  return { green: 'Low', amber: 'Monitor', red: 'Urgent' }[band] || band
}

export function formatEntryDate(value) {
  if (!value) return 'Unknown date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function ratingChanges(entry, previous) {
  const previousRatings = previous?.ratings || {}
  return Object.entries(entry?.ratings || {})
    .map(([symptom, rating]) => {
      const value = Number(rating)
      const hasPrevious = previousRatings[symptom] !== undefined
      const previousValue = hasPrevious ? Number(previousRatings[symptom]) : null
      return {
        symptom,
        value,
        previousValue,
        isNew: !hasPrevious,
        delta: hasPrevious ? value - previousValue : null,
        band: ratingBand(value),
        previousBand: hasPrevious ? ratingBand(previousValue) : null,
      }
    })
    .sort((a, b) => SYMPTOMS.indexOf(a.symptom) - SYMPTOMS.indexOf(b.symptom))
}

export function textChange(current, previous) {
  const currentValue = current || ''
  const previousValue = previous || ''
  if (!currentValue && !previousValue) return null
  if (!previousValue) return { state: 'new', previous: '' }
  if (currentValue === previousValue) return { state: 'same', previous: previousValue }
  return { state: currentValue ? 'changed' : 'removed', previous: previousValue }
}

