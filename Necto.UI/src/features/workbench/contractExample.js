export function exampleBody(mediaType, value) {
  if (/json/i.test(mediaType)) {
    const body = JSON.stringify(value, null, 2)
    if (body === undefined) throw new Error('This example has no JSON value.')
    return body
  }
  if (/^(text\/)|xml|yaml|javascript/i.test(mediaType) && typeof value === 'string') return value
  throw new Error('Use as draft supports JSON and text/XML examples. Files and structured forms require their request editors.')
}
export function applyContractExample(session, operation, example) {
  if (session.pending) throw new Error('Wait for the running request before replacing its draft.')
  if (!Object.hasOwn(operation.requestBody?.content ?? {}, example.mediaType)) throw new Error('This request media type is no longer available.')
  // Revalidate at the application boundary; response examples never call this path.
  const body = exampleBody(example.mediaType, example.value)
  session.mediaType = example.mediaType
  session.body = body
  session.variantIndex = undefined
  session.sampleName = undefined
  session.exampleKey = undefined
  session.bindings = (session.bindings ?? []).filter(binding => binding.location !== 'body')
  session.resultStale = Boolean(session.result)
}
