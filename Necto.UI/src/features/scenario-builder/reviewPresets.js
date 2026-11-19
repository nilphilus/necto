export function runIssueKey(issue) {
  return JSON.stringify([
    issue.stepId,
    issue.target?.location,
    issue.target?.name,
    issue.missingInput ? '' : issue.message,
  ])
}

export function suggestRunPresets(issues, activePresets, presetNames, prepare) {
  const missing = issues.filter(issue => issue.missingInput).map(runIssueKey)
  if (!missing.length) return []

  const suggestions = []
  for (const name of presetNames) {
    if (activePresets.includes(name)) continue

    let effects
    let unresolved = []
    try {
      effects = prepare([...activePresets, name]).presetEffects
    } catch (cause) {
      if (!(cause instanceof AggregateError)) continue
      effects = cause.presetEffects
      unresolved = cause.errors
    }

    const remaining = new Set(unresolved.map(runIssueKey))
    if (missing.every(key => remaining.has(key))) continue

    const fields = new Set()
    for (const step of effects) {
      for (const field of step.fields) {
        if (field.preset === name) fields.add(`${step.label} · ${field.field.replace(':', ' ')}`)
      }
    }
    suggestions.push({ name, fields: [...fields] })
  }

  return suggestions
}
