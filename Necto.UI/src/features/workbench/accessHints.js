export function accessHints(value) {
  if (!value || typeof value !== 'object' || typeof value.requiresAuthorization !== 'boolean') return null
  const rules = Array.isArray(value.rules) ? value.rules.slice(0,50).flatMap(rule => {
    if (!rule || typeof rule !== 'object') return []
    const text = []
    if (typeof rule.policy === 'string' && rule.policy) text.push('Policy: ' + rule.policy.slice(0,200))
    if (Array.isArray(rule.anyRole)) { const roles=rule.anyRole.filter(value=>typeof value==='string').slice(0,30); if(roles.length)text.push('Any role: ' + roles.join(', ')) }
    if (Array.isArray(rule.schemes)) { const schemes=rule.schemes.filter(value=>typeof value==='string').slice(0,30); if(schemes.length)text.push('Authentication: ' + schemes.join(', ')) }
    return [text.join(' · ') || 'Default authorization policy']
  }) : []
  return { title: value.anonymousOverride === true ? 'Anonymous endpoint override' : value.requiresAuthorization ? 'Authorization required' : 'No endpoint authorization requirement declared', rules: value.anonymousOverride === true ? [] : rules,
    runtimePolicy: value.runtimePolicy === true, note: 'Endpoint metadata is a hint. The server and gateway decide access; separate rules are cumulative.' }
}
