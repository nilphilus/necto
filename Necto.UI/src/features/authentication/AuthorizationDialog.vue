<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { API_ACCESS } from './authentication.js'
import { startOAuth } from './oauth.js'
const props = defineProps({ authentication: Object, apiId: String })
const emit = defineEmits(['close', 'retry'])
const dialog = ref(null), selectedApi = ref(props.apiId || 'local'), schemeName = ref(API_ACCESS), manualType = ref('bearer')
const discoveryUrl = ref('')
const token = ref(''), username = ref(''), password = ref(''), headerName = ref('X-API-Key'), keyLocation = ref('header')
const metadata = ref(true), enabled = ref(false), clientId = ref(''), scopes = ref(''), origins = ref([]), error = ref(''), pending = ref(false)
let oauth
const records = computed(() => [...props.authentication.apis.values()])
const api = computed(() => props.authentication.apis.get(selectedApi.value))
const schemes = computed(() => Object.entries(api.value?.schemes ?? {}))
const scheme = computed(() => schemeName.value !== API_ACCESS ? api.value?.schemes?.[schemeName.value] : manualType.value === 'oauth' ? { type: 'openIdConnect', openIdConnectUrl: discoveryUrl.value } : manualType.value === 'session' ? { type: 'browserSession' }
  : manualType.value === 'key' ? { type: 'apiKey', in: keyLocation.value, name: headerName.value.trim() }
  : { type: 'http', scheme: manualType.value })
const isOAuth = computed(() => ['oauth2', 'openIdConnect'].includes(scheme.value?.type))
const isCookie = computed(() => scheme.value?.type === 'browserSession' || scheme.value?.in === 'cookie')
const configured = computed(() => schemeName.value === API_ACCESS ? api.value?.access : api.value?.credentials?.[schemeName.value])
const knownOrigins = computed(() => [...new Set([...(api.value?.origins ?? []), ...(api.value ? [new URL(api.value.configuration.openApiUrl).origin] : [])])])
const redirectUri = new URL('./oauth-callback', document.baseURI).href
watch(selectedApi, () => { schemeName.value = API_ACCESS; reset() })
watch(schemeName, reset)
function reset() {
  oauth?.abort(); pending.value = false; error.value = ''
  const saved = configured.value
  token.value = ''; username.value = saved?.username ?? ''; password.value = ''; enabled.value = saved?.enabled ?? false; scopes.value = saved?.scopes?.join(' ') ?? ''
  clientId.value = saved?.clientId ?? ''
  metadata.value = saved?.metadata ?? schemeName.value === API_ACCESS
  if (schemeName.value === API_ACCESS && api.value?.accessScheme) {
    const previous = api.value.accessScheme
    manualType.value = previous.type === 'browserSession' ? 'session' : previous.type === 'apiKey' ? 'key' : ['oauth2', 'openIdConnect'].includes(previous.type) ? 'oauth' : previous.scheme?.toLowerCase() ?? 'bearer'
    headerName.value = previous.name ?? 'X-API-Key'; keyLocation.value = previous.in ?? 'header'; discoveryUrl.value = previous.openIdConnectUrl ?? ''
  }
  origins.value = saved?.origins?.filter(origin => knownOrigins.value.includes(origin)) ?? (api.value ? [new URL(api.value.configuration.openApiUrl).origin] : [])
}
function input() { return { clientId: clientId.value, token: token.value, username: username.value, password: password.value, enabled: enabled.value, metadata: metadata.value, origins: origins.value, scopes: scopes.value.split(/\s+/).filter(Boolean) } }
function save() {
  try { props.authentication.save(selectedApi.value, schemeName.value, scheme.value, input()); token.value = ''; password.value = ''; error.value = '' }
  catch (cause) { error.value = cause.message }
}
async function signIn() {
  error.value = ''
  try {
    if (!origins.value.length) throw new Error('Choose at least one API origin.')
    pending.value = true
    oauth = startOAuth({ scheme: scheme.value, base: api.value.configuration.openApiUrl, clientId: clientId.value, scopes: scopes.value.split(/\s+/).filter(Boolean), redirectUri })
    const result = await oauth.promise
    props.authentication.save(selectedApi.value, schemeName.value, scheme.value, { ...input(), ...result })
  } catch (cause) { error.value = cause.message }
  finally { pending.value = false; oauth = null }
}
onMounted(() => { reset(); dialog.value.showModal() })
onBeforeUnmount(() => { oauth?.abort(); dialog.value?.close() })
</script>
<template>
  <dialog ref="dialog" class="authorization-dialog" aria-labelledby="authorization-title" @cancel.prevent="emit('close')">
    <header><h2 id="authorization-title">Authorize API</h2><button type="button" class="secondary" aria-label="Close authorization" @click="emit('close')">×</button></header>
    <p class="muted">Credentials stay in this tab's memory. They are not saved in presets, samples, scenarios or agent context.</p>
    <label>API <select v-model="selectedApi" :disabled="pending"><option v-for="entry in records" :key="entry.id" :value="entry.id">{{ entry.name }} [{{ entry.id }}]</option></select></label>
    <label>Authorization scheme <select v-model="schemeName" :disabled="pending"><option :value="API_ACCESS">API access / documentation login</option><option v-for="[name, definition] in schemes" :key="name" :value="name">{{ name }} · {{ definition.type }}</option></select></label>
    <p v-if="schemeName === API_ACCESS" class="muted">Fallback for APIs without security requirements in OpenAPI. Explicitly anonymous operations stay anonymous.</p>
    <label v-if="schemeName === API_ACCESS">Authentication type <select v-model="manualType" :disabled="pending"><option value="bearer">Bearer / JWT</option><option value="basic">HTTP Basic</option><option value="key">API key</option><option value="session">Existing browser session</option><option value="oauth">OpenID Connect / SSO</option></select></label>
    <p v-else-if="scheme?.description" class="muted">{{ scheme.description }}</p>
    <form @submit.prevent="save">
      <fieldset :disabled="pending">
        <label v-if="schemeName === API_ACCESS && manualType === 'oauth'">OpenID discovery URL <input v-model="discoveryUrl" type="url" placeholder="https://identity.example/.well-known/openid-configuration"></label>
        <template v-if="schemeName === API_ACCESS && manualType === 'key'"><label>Key name <input v-model="headerName" required></label><label>Send key in <select v-model="keyLocation"><option value="header">Header</option><option value="query">Query string</option></select></label></template>
        <template v-if="scheme?.scheme?.toLowerCase() === 'basic'"><label>Username <input v-model="username" autocomplete="off" required></label><label>Password <input v-model="password" type="password" autocomplete="off"></label></template>
        <template v-else-if="isCookie"><label class="check"><input v-model="enabled" type="checkbox"> Use my existing browser login session</label><p class="muted">Sign in through the product's login page in another tab, then return here. Necto cannot read or set HttpOnly cookies. Cross-origin sessions require the API's CORS and cookie settings.</p></template>
        <label v-else>Access token / API key <input v-model="token" type="password" autocomplete="off" spellcheck="false" :required="!isOAuth" placeholder="Paste the value; Bearer prefix is optional"></label>
        <template v-if="isOAuth"><label>Public client ID <input v-model="clientId" autocomplete="off"></label><label>Scopes (space separated) <input v-model="scopes" placeholder="openid profile api.read"></label><p class="muted">Interactive sign-in uses Authorization Code + PKCE (no client secret). Register this redirect URI with your identity provider:</p><code>{{ redirectUri }}</code><button type="button" class="secondary" @click="signIn">Sign in with identity provider</button></template>
        <fieldset><legend>Allow credentials only for these origins</legend><label v-for="origin in knownOrigins" :key="origin" class="check"><input v-model="origins" type="checkbox" :value="origin"> <code>{{ origin }}</code></label></fieldset>
        <label class="check"><input v-model="metadata" type="checkbox"> Also use for this API's documentation and mappings</label>
        <button type="submit" class="primary">{{ isCookie ? 'Use browser session' : 'Apply credentials' }}</button>
      </fieldset>
    </form>
    <p v-if="pending" role="status">Waiting for sign-in… <button type="button" class="secondary" @click="oauth?.abort()">Cancel sign-in</button></p>
    <p v-if="configured" class="authorized" role="status">Credentials configured for this API and scheme.<template v-if="configured.expiresAt"> Expires {{ new Date(configured.expiresAt).toLocaleTimeString() }}.</template></p>
    <div class="auth-actions"><button v-if="configured" type="button" class="secondary" @click="authentication.clear(selectedApi, schemeName)">Clear this authorization</button><button type="button" class="secondary" @click="authentication.clear(selectedApi)">Clear all for this API</button><button type="button" class="secondary" @click="emit('retry')">Retry API documentation</button></div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p class="muted">Clearing Necto credentials does not log you out of the product or identity provider. HTTP 401 means authentication is missing or expired; HTTP 403 means your account lacks permission.</p>
  </dialog>
</template>
<style scoped>
.authorization-dialog { width: min(43rem, calc(100% - 2rem)); max-height: 88dvh; overflow: auto; padding: 1.25rem; border: 1px solid var(--line); border-radius: .75rem; background: var(--surface); color: inherit; }
.authorization-dialog::backdrop { background: #202b2780; }header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }h2 { margin: 0; font-size: 1.25rem; }label { display: grid; gap: .3rem; margin: .7rem 0; font-size: .85rem; }input, select { width: 100%; min-width: 0; }.check { display: flex; align-items: center; gap: .45rem; }.check input { width: auto; }fieldset { min-width: 0; margin: .7rem 0; padding: .6rem; border: 1px solid var(--line); border-radius: .4rem; }form > fieldset { border: 0; padding: 0; }legend { font-size: .8rem; color: var(--muted); }p { font-size: .8rem; line-height: 1.6; }code { font-size: .75rem; overflow-wrap: anywhere; }.auth-actions { display: flex; flex-wrap: wrap; gap: .4rem; }button { font-size: .8rem; }.authorized { padding: .6rem; background: var(--accent-soft); border-radius: .4rem; }
</style>
