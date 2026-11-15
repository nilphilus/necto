export function mappingExplanation(mapping) {
  const e = mapping.evidence
  const field = `${mapping.source?.operationId ?? 'Response'}.${mapping.source?.property ?? '(whole value)'} → ${mapping.target?.operationId ?? 'Request'}.${mapping.target?.name ?? '(body)'}`
  if (mapping.match === 'type') return `${field}: shared CLR identifier type ${e?.sourceType ?? 'declared by the generator'}.`
  if (mapping.match === 'attribute') return `${field}: explicit EndpointValue association${e?.logicalKey ? ` “${e.logicalKey}”` : ''}; CLR types must match.`
  if (mapping.match === 'name') return `${field}: suggestion based on compatible CLR types and naming conventions${e?.sourceType ? ` (${e.sourceType})` : ''}. Review its business meaning.`
  return `${field}: explicitly supplied mapping. Review its business meaning.`
}
