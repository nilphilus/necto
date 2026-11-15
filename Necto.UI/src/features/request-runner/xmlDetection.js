export function isXmlResponse(contentType, text) {
  const type = (contentType || '').split(';')[0].trim().toLowerCase()
  return type === 'application/xml' || type === 'text/xml' || type.endsWith('+xml') ||
    ((!type || type === 'text/plain') && looksLikeXml(text))
}

// A hint only: parsing and validation happen when the preview is opened.
export function looksLikeXml(value) {
  return typeof value === 'string' && /^\s*<(?:\?xml\s|[\p{L}_:]|!--|!DOCTYPE\s)/u.test(value.slice(0, 512))
}
