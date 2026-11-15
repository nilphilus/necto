export function constraintLabels(schema = {}) {
  return [['minimum','Minimum'],['maximum','Maximum'],['minLength','Minimum length'],['maxLength','Maximum length'],['minItems','Minimum items'],['maxItems','Maximum items'],['pattern','Pattern']]
    .filter(([key]) => schema[key] !== undefined).map(([key,label]) => `${label}: ${String(schema[key]).slice(0,300)}`)
}
