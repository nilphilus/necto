async function parseResponse(text, signal) {
  signal?.throwIfAborted()
  if (text.length < 1000000 || typeof Worker === 'undefined') {
    try {
      return JSON.parse(text)
    } catch {
      return undefined
    }
  }
  const worker = new Worker(
    new URL('../request-runner/json.worker.js', import.meta.url),
    { type: 'module' }
  )
  let abort
  try {
    return await new Promise((resolve, reject) => {
      abort = () => reject(signal.reason)
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) {
        abort()
        return
      }
      worker.onmessage = ({ data }) =>
        resolve(data.valid ? data.json : undefined)
      worker.onerror = () =>
        reject(new Error('Could not parse the response in the background.'))
      worker.postMessage(text)
    })
  } finally {
    signal?.removeEventListener('abort', abort)
    worker.terminate()
  }
}

export const DEFAULT_RESPONSE_LIMIT = 32 * 1024 * 1024
async function readBoundedBody(response, { signal, onProgress, responseLimitBytes = DEFAULT_RESPONSE_LIMIT } = {}, binary = false) {
  const limit = Math.max(1, Math.min(512 * 1024 * 1024, Number(responseLimitBytes) || DEFAULT_RESPONSE_LIMIT))
  signal?.throwIfAborted()
  const binaryResult = (parts, bytes) => ({ binary: new Blob(parts, { type: response.headers.get('content-type') ?? '' }), bytes })
  if (!response.body) return binary ? binaryResult([], 0) : { text: '', bytes: 0 }
  const reader = response.body.getReader(), decoder = binary ? null : new TextDecoder(), parts = []
  let bytes = 0, updated = 0
  const declared = Number(response.headers.get('content-length'))
  const total = Number.isFinite(declared) && declared > 0 ? declared : undefined
  const abort = () => { reader.cancel(signal.reason).catch(() => {}) }
  signal?.addEventListener('abort', abort, { once: true })
  try {
    signal?.throwIfAborted()
    onProgress?.({ bytes, total, limit })
    while (true) {
      const chunk = await reader.read()
      signal?.throwIfAborted()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > limit) {
        await reader.cancel('Response budget exceeded')
        throw Object.assign(new Error(`Response exceeded the ${Math.round(limit / 1024 / 1024)} MiB preview budget. Reception stopped; no partial response is retained. Change the budget in Tools → Configure request → Response budget before explicitly sending again.`), { code: 'RESPONSE_LIMIT_EXCEEDED' })
      }
      parts.push(binary ? chunk.value.slice() : decoder.decode(chunk.value, { stream: true }))
      if (performance.now() - updated > 100) { updated = performance.now(); onProgress?.({ bytes, total, limit }) }
    }
    if (decoder) parts.push(decoder.decode())
    onProgress?.({ bytes, total, limit, phase: 'parsing' })
    return binary ? binaryResult(parts, bytes) : { text: parts.join(''), bytes }
  } catch (error) {
    onProgress?.({ bytes, total, limit })
    throw error
  } finally {
    signal?.removeEventListener('abort', abort)
    reader.releaseLock()
  }
}

export const readBoundedText = (response, options) => readBoundedBody(response, options)
export const readBoundedBinary = (response, options) => readBoundedBody(response, options, true)

const textual = (type) =>
  !type ||
  /^(text\/)|json|xml|yaml|javascript|x-www-form-urlencoded/i.test(type)
export const STREAM_EVENT_LIMIT = 200
export const STREAM_TEXT_LIMIT = 1000000
async function readStream(response, metadata, signal, onProgress) {
  const reader = response.body.getReader(),
    decoder = new TextDecoder(),
    events = []
  const sse = /event-stream/i.test(metadata.contentType)
  const view = { selectedIndex: undefined, selectedPath: undefined }
  let buffer = '',
    rawText = '',
    bytes = 0,
    total = 0,
    limited = false,
    lastUpdate = 0,
    data = [],
    event = 'message',
    id = '',
    malformed = 0
  const snapshot = (done) => ({
    ...metadata,
    rawText,
    text: rawText,
    json: events.find(event => event.index === view.selectedIndex)?.data,
    selectedPath: view.selectedPath,
    stream: { events: [...events], bytes, total, limited, done, malformed, view }
  })
  const append = (text, eventName = 'message', eventId = '') => {
    if (
      events.length >= STREAM_EVENT_LIMIT ||
      rawText.length + text.length > STREAM_TEXT_LIMIT
    ) {
      limited = true
      return
    }
    let value = text,
      error = ''
    try {
      value = JSON.parse(text)
    } catch {
      if (!sse) {
        error = 'Malformed JSON record'
        malformed++
      }
    }
    events.push({
      index: total++,
      data: value,
      event: eventName,
      id: eventId,
      error
    })
    rawText += (rawText ? '\n' : '') + text
  }
  const line = (value) => {
    if (!sse) {
      if (value.trim()) append(value.trim())
      return
    }
    if (!value) {
      if (data.length) append(data.join('\n'), event, id)
      data = []
      event = 'message'
      return
    }
    if (value.startsWith(':')) return
    const index = value.indexOf(':'),
      key = index < 0 ? value : value.slice(0, index),
      content = index < 0 ? '' : value.slice(index + 1).replace(/^ /, '')
    if (key === 'data') data.push(content)
    if (key === 'event') event = content
    if (key === 'id' && !content.includes('\0')) id = content
  }
  try {
    onProgress?.(snapshot(false))
    while (true) {
      signal?.throwIfAborted()
      const next = await reader.read()
      if (next.done) break
      const remaining = Math.max(0, STREAM_TEXT_LIMIT - bytes)
      const chunk = next.value.subarray(0, remaining)
      bytes += chunk.byteLength
      buffer += decoder.decode(chunk, { stream: true })
      let index
      while ((index = buffer.indexOf('\n')) >= 0 && !limited) {
        line(buffer.slice(0, index).replace(/\r$/, ''))
        buffer = buffer.slice(index + 1)
      }
      if (buffer.length > 65536 || data.join('\n').length > 65536) {
        append('[record exceeds 64 KiB]', 'error')
        malformed++
        limited = true
        buffer = ''
        data = []
      }
      if (events.length >= STREAM_EVENT_LIMIT || bytes >= STREAM_TEXT_LIMIT)
        limited = true
      if (Date.now() - lastUpdate > 50 || limited) {
        onProgress?.(snapshot(false))
        lastUpdate = Date.now()
      }
      if (limited) {
        await reader.cancel('Preview limit reached')
        break
      }
    }
    buffer += decoder.decode()
    if (!limited) {
      if (buffer) line(buffer.replace(/\r$/, ''))
      if (sse && data.length) line('')
    }
    return snapshot(true)
  } finally {
    reader.releaseLock()
  }
}
export async function sendRequest(request, { onProgress, responseLimitBytes } = {}) {
  const reportProgress = onProgress
  onProgress = update => { if (!request.options.signal?.aborted) reportProgress?.(update) }
  const response = await fetch(request.url, request.options)
  const contentType = response.headers.get('content-type') ?? ''
  const metadata = {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    contentType,
    headers: Object.fromEntries(response.headers),
    finalUrl: response.url
  }
  const signal = request.options.signal
  if (/event-stream|(?:x-)?ndjson|jsonl/i.test(contentType) && response.body)
    return readStream(response, metadata, signal, onProgress)
  if (!textual(contentType)) {
    const { binary, bytes } = await readBoundedBinary(response, { signal, responseLimitBytes,
      onProgress: progress => onProgress?.({ ...metadata, receiving: true, incomplete: true, progress, text: '', byteLength: progress.bytes }) })
    signal?.throwIfAborted()
    return {
      ...metadata,
      binary,
      text: '',
      rawText: '',
      byteLength: bytes
    }
  }
  const { text, bytes } = await readBoundedText(response, { signal, responseLimitBytes,
    onProgress: progress => onProgress?.({ ...metadata, receiving: true, incomplete: true, progress, text: '', byteLength: progress.bytes }) })
  const json = text ? await parseResponse(text, signal) : undefined
  signal?.throwIfAborted()
  return {
    ...metadata,
    rawText: text,
    text,
    json,
    byteLength: bytes
  }
}

export function responseFilename(result) {
  const disposition = result.headers?.['content-disposition'] ?? ''
  const name =
    disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1] ??
    disposition.match(/filename="([^"]+)"/i)?.[1] ??
    disposition.match(/filename=([^;]+)/i)?.[1]
  if (name) {
    try {
      return (
        decodeURIComponent(name)
          .split(/[\\/]/)
          .pop()
          .replace(/[\x00-\x1f\x7f]/g, '')
          .slice(0, 180) || 'response.bin'
      )
    } catch {
      /* Fall back to the response media type. */
    }
  }
  const extensions = {
    'application/pdf': 'pdf',
    'application/zip': 'zip',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'application/xml': 'xml',
    'text/xml': 'xml'
  }
  return (
    'response.' +
    (extensions[result.contentType?.split(';')[0].trim().toLowerCase()] ??
      (/\+xml(?:;|$)/i.test(result.contentType || '') ? 'xml' : undefined) ??
      (result.binary ? 'bin' : result.json === undefined ? 'txt' : 'json'))
  )
}
