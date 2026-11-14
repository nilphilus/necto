import { validatePayloadSnapshot } from './body.js'
import { requestUrl } from '../request-runner/request.js'
import { sensitiveName } from './privacy.js'
const managedHeader = name => /^(host|cookie|content-length|origin|referer|connection|accept-encoding|user-agent|transfer-encoding|te|trailer|upgrade|keep-alive)$|^(sec-|proxy-)/i.test(name)
export function shellWords(source) {
  if (source.length > 1000000) throw new Error('cURL imports are limited to 1 MB.')
  const words = []; let word = '', quote = '', started = false
  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (quote === "'") { if (char === "'") quote = ''; else word += char; continue }
    if (char === '\\') {
      const next = source[++i]
      if (next === undefined) throw new Error('Incomplete shell escape.')
      if (next === '\n') continue
      if (quote === '"' && !['"','\\','$','`'].includes(next)) word += '\\'
      word += next; started = true; continue
    }
    if (char === '$' || char === '`') throw new Error('Shell variables and substitutions are unsupported. Paste resolved values.')
    if (quote === '"') { if (char === '"') quote = ''; else word += char; continue }
    if (char === "'" || char === '"') { quote = char; started = true; continue }
    if (/[|;&<>]/.test(char)) throw new Error('Import one cURL command without shell operators.')
    if (/\s/.test(char)) { if (started) { words.push(word); word = ''; started = false } }
    else { word += char; started = true }
  }
  if (quote) throw new Error('Unclosed shell quote.')
  if (started) words.push(word)
  return words
}
export function parseCurl(source) {
  const words = shellWords(source.trim())
  if (words.shift() !== 'curl') throw new Error('Paste a POSIX cURL command beginning with curl.')
  let target, method, get = false, json = false
  const headers = new Headers(), data = [], warnings = []
  const value = (index, flag) => { if (words[index] === undefined) throw new Error(`Missing value for ${flag}.`); return words[index] }
  for (let i = 0; i < words.length; i++) {
    let word = words[i]
    if (/^-[XHdu].+/.test(word) && !word.startsWith('--')) { words.splice(i + 1, 0, word.slice(2)); word = word.slice(0, 2) }
    if (word.startsWith('--') && word.includes('=')) { const at = word.indexOf('='); words.splice(i + 1, 0, word.slice(at + 1)); word = word.slice(0, at) }
    if (['-X','--request'].includes(word)) method = value(++i, word).toUpperCase()
    else if (word === '--url') { if (target) throw new Error('Only one URL is supported.'); target = value(++i, word) }
    else if (['-H','--header'].includes(word)) {
      const header = value(++i, word), at = header.indexOf(':')
      if (at < 1) throw new Error('Use headers in Name: value form.')
      const name = header.slice(0, at).trim(), content = header.slice(at + 1).trim()
      if (sensitiveName(name)) warnings.push(`Removed credential header ${name}. Configure Authorize instead.`)
      else if (managedHeader(name)) warnings.push(`Omitted browser-managed header ${name}.`)
      else headers.append(name, content)
    } else if (['-d','--data','--data-raw','--data-binary','--json'].includes(word)) {
      const content = value(++i, word)
      if (content.startsWith('@') && word !== '--data-raw') throw new Error('File-reading cURL options are unsupported. Use the upload editor.')
      data.push(content); if (word === '--json') json = true
    } else if (['-u','--user','-b','--cookie','--oauth2-bearer'].includes(word)) { value(++i, word); warnings.push('Credentials were omitted. Configure Authorize or browser-session authentication.') }
    else if (['-I','--head'].includes(word)) method = 'HEAD'
    else if (['-G','--get'].includes(word)) get = true
    else if (['--compressed','-s','--silent','-S','--show-error'].includes(word)) { /* Browser transport/output settings. */ }
    else if (['-L','--location'].includes(word)) warnings.push('Redirects follow Necto and browser authentication rules.')
    else if (word.startsWith('-')) throw new Error(`Unsupported cURL option: ${word}. No request has been imported.`)
    else { if (target) throw new Error('Only one URL is supported.'); target = word }
  }
  if (!target) throw new Error('The command needs an HTTP(S) URL.')
  let url
  try { url = new URL(target) } catch { throw new Error('Use an absolute HTTP(S) URL.') }
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error('Use HTTP(S) without URL credentials or fragments.')
  let body = data.length ? data.join('&') : undefined
  if (get && body !== undefined) { for (const [name, item] of new URLSearchParams(body)) url.searchParams.append(name, item); body = undefined }
  for (const name of new Set(url.searchParams.keys())) if (sensitiveName(name)) { url.searchParams.delete(name); warnings.push(`Removed credential query parameter ${name}.`) }
  if (body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', json ? 'application/json' : 'application/x-www-form-urlencoded')
  if (json && !headers.has('Accept')) headers.set('Accept','application/json')
  method ??= get ? 'GET' : body === undefined ? 'GET' : 'POST'
  if (['CONNECT','TRACE','TRACK'].includes(method) || ['GET','HEAD'].includes(method) && body !== undefined) throw new Error('This method/body combination is not supported by browser requests. Use -G for query data.')
  return { url, method, headers, body, warnings: [...new Set(warnings)] }
}
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export function curlMatches(request, operations, configuration) {
  const matches = []
  for (const operation of operations.filter(item => item.method === request.method)) {
    const scoped = operation.configuration ? { ...operation.configuration, serverProfiles: configuration?.serverProfiles } : configuration ?? {}
    const candidates = [{ index: -1, server: undefined }, ...(operation.servers ?? []).map((server, index) => ({ server, index }))]
    for (const candidate of candidates) {
      let base
      try { base = requestUrl(candidate.server ? { ...operation, requestServer: candidate.server } : operation, scoped) } catch { continue }
      if (base.origin !== request.url.origin) continue
      const names = [], pattern = operation.path.split(/(\{[^}]+\})/).map(part => { if (/^\{/.test(part)) { names.push(part.slice(1,-1)); return '([^/]+)' }; return escape(part) }).join('')
      const found = request.url.pathname.match(new RegExp('^' + escape(base.pathname.replace(/\/$/,'')) + pattern + '/?$'))
      if (!found) continue
      let fields
      try { fields = Object.fromEntries(names.map((name,index) => [`path:${name}`,decodeURIComponent(found[index+1])])) } catch { continue }
      matches.push({ operation, serverIndex: candidate.index, fields }); break
    }
  }
  return matches
}
export function curlDraft(request, match) {
  const operation = match.operation, fields = { ...match.fields }, extraHeaders = Object.create(null), extraQuery = []
  for (const name of new Set(request.url.searchParams.keys())) {
    const values = request.url.searchParams.getAll(name), parameter = operation.parameters.find(item => item.in === 'query' && item.name === name)
    if (!parameter) { for (const value of values) extraQuery.push([name,value]); continue }
    const schema = operation.resolve(parameter.schema)
    fields[`query:${name}`] = schema?.type === 'array' ? JSON.stringify(values.length === 1 && parameter.explode === false ? values[0].split(parameter.style === 'spaceDelimited' ? ' ' : parameter.style === 'pipeDelimited' ? '|' : ',') : values) : values[0]
  }
  for (const [name,value] of request.headers) {
    if (name === 'content-type') continue
    const parameter = operation.parameters.find(item => item.in === 'header' && item.name.toLowerCase() === name)
    if (parameter) fields[`header:${parameter.name}`] = value
    else extraHeaders[name] = value
  }
  const requestedType = request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()
  const mediaType = Object.keys(operation.requestBody?.content ?? {}).find(type => type.toLowerCase() === requestedType) ?? requestedType
  if (request.body !== undefined && (!operation.requestBody || !operation.requestBody.content?.[mediaType])) throw new Error(`The selected endpoint does not declare ${mediaType ?? 'this body type'}. Choose the supported editor format manually.`)
  const draft = { fields, body: request.body ?? '', mediaType, serverIndex: match.serverIndex, serverValues: {}, extraHeaders, extraQuery, bindings: [], assertions: [] }
  if (mediaType === 'application/x-www-form-urlencoded') draft.formFields = [...new URLSearchParams(request.body)].map(([name,value]) => ({name,value,kind:'text',enabled:true,required:false,multiple:false,files:[]}))
  validatePayloadSnapshot(draft)
  return draft
}
