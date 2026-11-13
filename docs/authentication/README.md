# Authentication, including a protected OpenAPI document

**Authorize is available before the API document loads.** If `/openapi/v1.json`
returns 401, open **Authorize → API access / documentation login**, enter the
credentials and choose their allowed origin. Applying credentials retries the
configuration, OpenAPI document and mappings. No request preset or unprotected
copy of the API document is required.

## First login

- **Bearer / JWT:** paste an access token obtained from the product's login flow.
  The `Bearer` prefix is optional. Necto does not mint or validate JWTs; the API
  validates the token.
- **HTTP Basic:** enter the product's username and password.
- **API key:** supply the key name, value and header/query location.
- **Existing browser session:** sign in through the product in another tab, then
  enable the browser-session option. Necto sends eligible browser cookies; it
  cannot read or set HttpOnly cookies. A same-origin browser login usually works
  without additional configuration because metadata fetches already use the
  normal browser session.
- **OpenID Connect / SSO:** before OpenAPI is available, enter the provider's
  discovery URL, public client ID and required scopes. Necto uses Authorization
  Code with PKCE. After OpenAPI loads, declared OAuth2 and OpenID Connect schemes
  are available too. An existing OAuth access token can also be pasted.

The documentation-login profile can satisfy compatible security declarations
once the document loads. For example, a Bearer used to unlock OpenAPI also works
for operations requiring a named HTTP Bearer scheme. A Basic credential cannot
satisfy Bearer or an unrelated API key requirement.

**Also use for this API's documentation and mappings** controls metadata access.
It is enabled initially for documentation login and opt-in for named schemes.
Metadata credentials are sent only to that API's configured configuration,
OpenAPI and mappings URLs, and only on approved origins. Replacing a metadata
credential disables older metadata credentials using the same transport;
independent keys can be combined with Bearer authentication.

## Hosting a protected document in ASP.NET Core

Keep authentication and authorization on the actual document, mappings and API.
Necto adds credentials in browser fetch requests; it does not bypass those
policies. For a JWT-protected API, an application can expose only the UI bootstrap
and assets anonymously:

```csharp
// Configure your existing JWT/identity provider in builder.Services.
// builder.Services.AddAuthentication(...).AddJwtBearer(...);
// builder.Services.AddAuthorization();

app.UseAuthentication();
app.UseAuthorization();

app.MapNectoUI(
    openApiPath: "/openapi/v1.json",
    endpointMappingsPath: "/necto/endpoint-mappings")
    .AllowAnonymous(); // UI/assets/configuration/callback, not the API document

app.MapOpenApi().RequireAuthorization();
app.MapNectoEndpointMappings().RequireAuthorization();
// Apply the product's existing policies to its API endpoints as usual.
```

The initial HTML and JavaScript must be loadable for the Authorize button to run.
If the UI itself requires an existing product cookie session, sign into that
product first. An initial browser navigation cannot attach a Bearer token held
in Necto's JavaScript memory. Custom required-header middleware may also need the
application's skip-header metadata on `MapNectoUI`; `AllowAnonymous` only affects
ASP.NET Core authorization.

Existing `UseNectoUI()` registrations remain source-compatible. No backend token
store, authentication proxy or additional production package dependency is
introduced by this feature.

## OpenAPI requirements

Necto reads `components.securitySchemes`, document-level `security` and each
operation's override. A simplified document can declare:

```json
{
  "openapi": "3.1.0",
  "components": {
    "securitySchemes": {
      "Bearer": { "type": "http", "scheme": "bearer" },
      "TenantKey": { "type": "apiKey", "in": "header", "name": "X-Tenant-Key" }
    }
  },
  "security": [{ "Bearer": [] }],
  "paths": {
    "/profile": { "get": { "responses": { "200": { "description": "Profile" } } } },
    "/public": { "get": { "security": [], "responses": { "200": { "description": "Public" } } } }
  }
}
```

Multiple requirement objects are alternatives (OR). Multiple schemes in one
object must all be configured (AND). Optional anonymous alternatives are honored.
An explicit `security: []` does not receive managed token or key headers. An
explicitly enabled browser session still governs cookie transport, including an
anonymous login endpoint that sets cookies. For documents without any security
requirements, the API-access profile supplies fallback authentication.

A conflicting Authorization/header/query input from a preset or request form
produces a local error instead of being silently overwritten. Unsupported schemes
or missing credentials stop the request. Declared OAuth scopes must be present
in the configured access-token scopes; the server remains the authority on
permissions and token validity.

## OAuth2 / OpenID Connect setup

Register a **public browser client**, without a client secret. Its callback is
`<Necto UI base>/oauth-callback`, for example:

```
https://product.example/necto/oauth-callback
```

The dialog displays the exact URI, including a custom route prefix and PathBase.
The callback must be reachable with the same UI bootstrap policy. Allow popups
and preserve the popup/opener relationship (review strict Cross-Origin-Opener-Policy
headers when needed). The provider's token endpoint must allow browser CORS for
the Necto UI origin. Provider URLs require HTTPS, except localhost development.

Authorization Code + S256 PKCE uses a random verifier and state kept only in
memory. Messages must come from the expected popup, UI origin and state. The
code is exchanged directly with the provider; access tokens stay in tab memory.
ID tokens are not used as API credentials. Refresh tokens are discarded;
expiration requires another sign-in. Implicit/password/client-credentials grants
and server-side token brokering are not implemented. Machine credentials and
client secrets belong outside a browser UI.

## API scope and external connections

Authorization is independent of request presets and scoped to a particular API
connection. The host's token is never automatically forwarded to external APIs,
even when their operation names or URLs overlap. Configure those APIs separately
through the API selector in Authorize. Configured external APIs can be authorized
before their protected metadata has loaded. Changing a connection's identity or
a security scheme's transport invalidates affected credentials.

Review the allowed origins before applying credentials. The document origin is
selected initially; a different API server origin must be explicitly selected.
Managed credentials reject unapproved origins and authenticated fetch redirects.
External services must allow the UI origin, Authorization/custom headers and any
credentialed cookie requests through CORS. Browsers enforce SameSite and Secure
cookie rules. Necto does not synthesize CSRF tokens or disable a product's CSRF
protection; configure the product's required anti-forgery header as appropriate.

## Scenarios, trace and clearing credentials

Authentication is applied when sending normal, related and scenario requests.
Scenario preflight checks required authorization before the first request. The
execution trace redacts Authorization, cookies, managed key headers and managed
query keys. The actual network request still carries the credentials.

Auth dialog values are not written to localStorage/sessionStorage, request
presets, saved samples, scenario definitions or agent context. They disappear on
reload. Manually entering secrets into an ordinary request body/preset still
uses those features' existing persistence rules. Query API keys are inherently
visible in network/server URLs, even though their Necto trace is redacted.

Changing or clearing authorization cancels active requests/scenarios, discards
old response displays and ignores superseded metadata loads. Protected metadata
is fetched again with the current credentials. **Clear all for this API** clears
Necto's credentials; it does not invalidate a server-side cookie or sign out of
the identity provider. Use the product's logout flow for that.

HTTP 401 means credentials are absent, invalid or expired. HTTP 403 means the
current account lacks access. Neither status causes automatic replay of API
mutations.

## Validation

Pure tests cover inheritance, OR/AND, anonymous overrides, Basic/query/cookie
transport, origin/API isolation, expiry/scopes, header conflicts, trace redaction,
metadata URL boundaries, bootstrap transitions, scheme changes and PKCE.

`Necto.UI/tests/authentication.e2e.cjs` runs an HTTP fixture with protected OpenAPI
and mappings, real cookie and PKCE code exchange, and the built SampleApi UI.
It verifies initial 401 → Authorize → metadata recovery, authenticated chains,
scenario trace redaction, API key and Basic requests, cookie sessions, SSO before
OpenAPI is available, clearing credentials and a narrow viewport. The fixture is
test code, not a production identity provider. Run after `dotnet build` with
Playwright installed and its Chromium browser available; set `PLAYWRIGHT_MODULE`
to an installed Playwright module path and `NECTO_DOTNET` to the .NET executable
when they are not available on the normal module/path search paths.
