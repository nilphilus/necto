const base64url = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
export function oauthUrl(value, base) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('The identity provider endpoint URL is missing.')
  const url = new URL(value, base)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('OAuth endpoints require HTTPS, except on localhost.')
  if (url.username || url.password || url.hash) throw new Error('Invalid OAuth endpoint URL.')
  return url
}
export async function createPkce() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)))
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
  return { verifier, challenge, state: base64url(crypto.getRandomValues(new Uint8Array(32))) }
}
export async function oauthEndpoints(scheme, base) {
  if (scheme.type === 'openIdConnect') {
    const response = await fetch(oauthUrl(scheme.openIdConnectUrl, base), { credentials: 'omit', redirect: 'error', headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(`OpenID discovery failed (HTTP ${response.status}).`)
    const document = await response.json()
    return { authorizationUrl: oauthUrl(document.authorization_endpoint, base).href, tokenUrl: oauthUrl(document.token_endpoint, base).href }
  }
  const flow = scheme.flows?.authorizationCode
  if (!flow) throw new Error('Interactive sign-in requires an Authorization Code flow. You can provide an access token instead.')
  return { authorizationUrl: oauthUrl(flow.authorizationUrl, base).href, tokenUrl: oauthUrl(flow.tokenUrl, base).href }
}
export function startOAuth({ scheme, base, clientId, scopes, redirectUri }) {
  if (!clientId.trim()) throw new Error('Enter the public OAuth client ID.')
  const popup = window.open('about:blank', '_blank', 'popup,width=560,height=720')
  if (!popup) throw new Error('Allow popups to sign in.')
  let disposed = false, listener, timer, closed, rejectPending
  const abort = () => { disposed = true; popup.close(); rejectPending?.(new Error('Sign-in cancelled.')) }
  const promise = (async () => {
    try {
      const endpoints = await oauthEndpoints(scheme, base)
      const pkce = await createPkce()
      if (disposed) throw new Error('Sign-in cancelled.')
      const code = await new Promise((resolve, reject) => {
        rejectPending = reject
        listener = event => {
          if (event.origin !== window.location.origin || event.source !== popup || event.data?.source !== 'necto-oauth' || event.data.state !== pkce.state) return
          if (event.data.error) reject(new Error('The identity provider rejected the sign-in request.'))
          else if (typeof event.data.code === 'string' && event.data.code) resolve(event.data.code)
        }
        window.addEventListener('message', listener)
        timer = setTimeout(() => reject(new Error('Sign-in timed out.')), 180000)
        closed = setInterval(() => { if (popup.closed) reject(new Error('Sign-in window closed.')) }, 500)
        const url = new URL(endpoints.authorizationUrl)
        for (const [key, value] of Object.entries({ response_type: 'code', client_id: clientId.trim(), redirect_uri: redirectUri, scope: scopes.join(' '), state: pkce.state, code_challenge: pkce.challenge, code_challenge_method: 'S256' })) url.searchParams.set(key, value)
        popup.location = url.href
      })
      if (disposed) throw new Error('Sign-in cancelled.')
      const response = await fetch(endpoints.tokenUrl, { method: 'POST', credentials: 'omit', redirect: 'error', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId.trim(), code_verifier: pkce.verifier }) })
      if (!response.ok) throw new Error(`Token exchange failed (HTTP ${response.status}). Check the provider's public-client and CORS settings.`)
      const token = await response.json()
      if (disposed) throw new Error('Sign-in cancelled.')
      if (typeof token.access_token !== 'string' || token.token_type?.toLowerCase() !== 'bearer') throw new Error('The provider did not return a Bearer access token.')
      const lifetime = Number(token.expires_in)
      return { token: token.access_token, scopes: typeof token.scope === 'string' ? token.scope.split(/\s+/).filter(Boolean) : scopes,
        ...(Number.isFinite(lifetime) && lifetime >= 0 ? { expiresAt: Date.now() + lifetime * 1000 } : {}) }
    } finally { window.removeEventListener('message', listener); clearTimeout(timer); clearInterval(closed); popup.close(); rejectPending = null }
  })()
  return { promise, abort }
}
