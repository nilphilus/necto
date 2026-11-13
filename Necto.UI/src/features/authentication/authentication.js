export const API_ACCESS = Symbol('Necto API access')
export function requirements(operation) {
  const security = operation.security
  if (security === null || security === undefined) return null
  if (!Array.isArray(security)) throw new Error('Invalid OpenAPI security requirements.')
  return security
}

export function httpOrigin(value, base) {
  const url = new URL(value, base)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an HTTP(S) URL without embedded credentials.')
  return url.origin
}

export function validateCredential(scheme, input, base) {
  const origins = [...new Set((input.origins ?? []).map(origin => httpOrigin(origin, base)))]
  if (!origins.length) throw new Error('Choose at least one API origin for these credentials.')
  const credential = { ...input, origins }
  if (scheme.type === 'http' && scheme.scheme?.toLowerCase() === 'basic') {
    if (!input.username || input.username.includes(':')) throw new Error('Enter a Basic username without a colon.')
    if (typeof input.password !== 'string') throw new Error('Enter a password.')
  } else if (scheme.type === 'http' && scheme.scheme?.toLowerCase() === 'bearer' || ['oauth2', 'openIdConnect'].includes(scheme.type)) {
    credential.token = input.token?.trim().replace(/^Bearer\s+/i, '')
    if (!credential.token || /[\s\r\n]/.test(credential.token)) throw new Error('Enter a token without spaces or line breaks.')
  } else if (scheme.type === 'apiKey' && ['header', 'query'].includes(scheme.in)) {
    if (!scheme.name || !input.token?.trim()) throw new Error('Enter the API key value.')
    credential.token = input.token.trim()
    if (scheme.in === 'header') {
      if (/^(cookie|set-cookie|host|origin|content-length|connection)$/i.test(scheme.name)) throw new Error('This header is controlled by the browser. Use a browser session for cookies.')
      try { new Headers([[scheme.name, credential.token]]) } catch { throw new Error('The API key name or value is not valid for an HTTP header.') }
    }
  } else if (scheme.type === 'apiKey' && scheme.in === 'cookie' || scheme.type === 'browserSession') {
    if (!input.enabled) throw new Error('Enable the existing browser session.')
  } else throw new Error('This authentication scheme is not supported.')
  if (input.scopes !== undefined && (!Array.isArray(input.scopes) || input.scopes.some(scope => typeof scope !== 'string'))) throw new Error('Scopes must be a list of names.')
  credential.scopes = [...new Set(input.scopes ?? [])]
  return credential
}

export function compatibleScheme(manual, declared) {
  if (!manual || !declared) return false
  if (manual.type === 'browserSession') return declared.type === 'apiKey' && declared.in === 'cookie'
  const bearerTransport = scheme => scheme.type === 'http' && scheme.scheme?.toLowerCase() === 'bearer' || ['oauth2', 'openIdConnect'].includes(scheme.type)
  if (bearerTransport(manual) && bearerTransport(declared)) return true
  return manual.type === declared.type && (manual.type === 'http' ? manual.scheme?.toLowerCase() === declared.scheme?.toLowerCase()
    : manual.type === 'apiKey' ? manual.in === declared.in && (manual.in === 'header' ? manual.name?.toLowerCase() === declared.name?.toLowerCase() : manual.name === declared.name) : false)
}

function basic(credential) {
  const bytes = new TextEncoder().encode(`${credential.username}:${credential.password}`)
  return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''))
}

function applyScheme(plan, name, scheme, credential, scopes, now) {
  if (!scheme || !credential) throw new Error(`Authorize ${name} before sending this request.`)
  if (!credential.origins.includes(plan.url.origin)) throw new Error(`Credentials for ${name} are not authorized for this request origin. Review the allowed origins.`)
  if (credential.expiresAt !== undefined && credential.expiresAt <= now) throw new Error(`Authorization for ${name} expired. Sign in again.`)
  if (['oauth2', 'openIdConnect'].includes(scheme.type) && scopes.some(scope => !credential.scopes.includes(scope)))
    throw new Error(`Authorization for ${name} is missing a required scope. Review the requested scopes.`)
  function header(key, value) {
    if (plan.headers.has(key) && plan.headers.get(key) !== value) throw new Error(`Authentication conflicts with an existing ${key} header. Remove the duplicate input or preset.`)
    plan.headers.set(key, value); plan.secretHeaders.add(key.toLowerCase())
  }
  if (scheme.type === 'http' && scheme.scheme?.toLowerCase() === 'basic') header('Authorization', 'Basic ' + basic(credential))
  else if (scheme.type === 'http' && scheme.scheme?.toLowerCase() === 'bearer' || ['oauth2', 'openIdConnect'].includes(scheme.type)) header('Authorization', 'Bearer ' + credential.token)
  else if (scheme.type === 'apiKey' && scheme.in === 'header') header(scheme.name, credential.token)
  else if (scheme.type === 'apiKey' && scheme.in === 'query') {
    if (plan.url.searchParams.has(scheme.name) && plan.url.searchParams.getAll(scheme.name).some(value => value !== credential.token)) throw new Error(`Authentication conflicts with the ${scheme.name} query input.`)
    plan.url.searchParams.set(scheme.name, credential.token); plan.secretQuery.add(scheme.name)
  } else if (scheme.type === 'apiKey' && scheme.in === 'cookie' || scheme.type === 'browserSession') plan.cookies = true
  else throw new Error(`Unsupported authentication scheme: ${name}.`)
}

export function authorizeRequest(request, operation, api, now = Date.now()) {
  const security = requirements(operation)
  const candidates = security === null ? api?.access ? [{ __apiAccess: [] }] : [] : security
  const schemes = { ...operation.securitySchemes, ...api?.schemes }
  const errors = []
  for (const alternative of candidates.filter(entry => entry && Object.keys(entry).length)) {
    const plan = { url: new URL(request.url), headers: new Headers(request.options.headers), cookies: false, secretHeaders: new Set(), secretQuery: new Set() }
    try {
      for (const [name, scopes] of Object.entries(alternative)) {
        if (!Array.isArray(scopes)) throw new Error('Invalid OpenAPI security scopes.')
        const fallback = security === null && name === '__apiAccess'
        const scheme = fallback ? api.accessScheme : schemes[name]
        const credential = fallback ? api.access : api?.credentials?.[name] ?? (compatibleScheme(api?.accessScheme, scheme) ? api?.access : undefined)
        applyScheme(plan, name, scheme, credential, scopes, now)
      }
      return { ...request, url: plan.url, options: { ...request.options, headers: plan.headers, credentials: plan.cookies ? 'include' : 'omit', redirect: 'error' },
        sensitiveHeaders: [...plan.secretHeaders], sensitiveQuery: [...plan.secretQuery] }
    } catch (error) { errors.push(error.message) }
  }
  if (!candidates.length || candidates.some(entry => entry && !Object.keys(entry).length)) {
    const browserSession = [[api?.accessScheme, api?.access], ...Object.entries(api?.credentials ?? {}).map(([name, credential]) => [schemes[name], credential])]
      .some(([scheme, credential]) => credential?.enabled && credential.origins.includes(new URL(request.url).origin) &&
        (scheme?.type === 'browserSession' || scheme?.type === 'apiKey' && scheme?.in === 'cookie'))
    return { ...request, options: { ...request.options, credentials: browserSession ? 'include' : 'same-origin', ...(browserSession ? { redirect: 'error' } : {}) } }
  }
  throw new Error(errors[0] ?? 'Authorize this API before sending the request.')
}

export function redactedRequest(request) {
  const headers = new Headers(request.options.headers)
  const url = new URL(request.url)
  for (const key of new Set(['authorization', 'proxy-authorization', 'cookie', ...(request.sensitiveHeaders ?? [])])) if (headers.has(key)) headers.set(key, '[redacted]')
  for (const key of request.sensitiveQuery ?? []) if (url.searchParams.has(key)) url.searchParams.set(key, '[redacted]')
  return { ...request, url, options: { ...request.options, headers } }
}
