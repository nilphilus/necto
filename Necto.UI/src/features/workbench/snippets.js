import { safeRequest } from './privacy.js'
const shell = (value) => "'" + String(value).replaceAll("'", "'\\''") + "'"
export function requestSnippet(
  request,
  language = 'curl',
  includeCredentials = false
) {
  const safe = safeRequest(request, includeCredentials),
    { options, url } = safe
  const headers = [...options.headers]
  const body = options.body
  if (language === 'curl') {
    const parts = ['curl --request ' + options.method + ' ' + shell(url.href)]
    if (options.credentials === 'include')
      parts.push('--cookie ' + shell('[browser session cookies]'))
    for (const [name, value] of headers)
      parts.push('--header ' + shell(name + ': ' + value))
    if (body instanceof FormData)
      for (const [name, value] of body)
        parts.push(
          (value instanceof Blob ? '--form ' : '--form-string ') +
            shell(
              name +
                '=' +
                (value instanceof Blob
                  ? '@/path/to/' + (value.name ?? 'upload.bin')
                  : value)
            )
        )
    else if (body instanceof Blob)
      parts.push(
        '--data-binary ' + shell('@/path/to/' + (body.name ?? 'upload.bin'))
      )
    else if (body !== undefined)
      parts.push(
        '--data-raw ' +
          shell(body instanceof URLSearchParams ? body.toString() : body)
      )
    return parts.join(' \\\n  ')
  }
  if (language === 'fetch') {
    const prelude =
      body instanceof FormData
        ? 'const body = new FormData();\n' +
          [...body]
            .map(
              ([name, value]) =>
                `body.append(${JSON.stringify(name)}, ${value instanceof Blob ? 'file /* choose a File */' : JSON.stringify(value)});`
            )
            .join('\n') +
          '\n'
        : body instanceof Blob
          ? 'const body = file; // choose a File\n'
          : ''
    const value =
      body instanceof FormData || body instanceof Blob
        ? 'body'
        : JSON.stringify(
            body instanceof URLSearchParams ? body.toString() : body
          )
    return `${prelude}const response = await fetch(${JSON.stringify(url.href)}, {\n  method: ${JSON.stringify(options.method)},\n  headers: ${JSON.stringify(Object.fromEntries(headers), null, 2)},${options.credentials ? '\n  credentials: ' + JSON.stringify(options.credentials) + ',' : ''}${body !== undefined ? '\n  body: ' + value + ',' : ''}\n});\nconsole.log(response.status, await response.text());`
  }
  const cs = (value) => '@"' + String(value).replaceAll('"', '""') + '"'
  const lines = [
    'using System;',
    'using System.IO;',
    'using System.Net.Http;',
    'using System.Text;',
    'using var client = new HttpClient();',
    `using var request = new HttpRequestMessage(new HttpMethod(${cs(options.method)}), ${cs(url.href)});`
  ]
  if (options.credentials === 'include')
    lines.push(
      '// Browser session: configure HttpClientHandler.CookieContainer with your session cookies.'
    )
  if (body instanceof FormData) {
    lines.push('var body = new MultipartFormDataContent();')
    for (const [name, value] of body)
      lines.push(
        value instanceof Blob
          ? `body.Add(new StreamContent(File.OpenRead(${cs('/path/to/' + (value.name ?? 'upload.bin'))})), ${cs(name)}, ${cs(value.name ?? 'upload.bin')});`
          : `body.Add(new StringContent(${cs(value)}), ${cs(name)});`
      )
    lines.push('request.Content = body;')
  } else if (body instanceof Blob)
    lines.push(
      `request.Content = new StreamContent(File.OpenRead(${cs('/path/to/' + (body.name ?? 'upload.bin'))}));`
    )
  else if (body !== undefined)
    lines.push(
      `request.Content = new StringContent(${cs(String(body))}, Encoding.UTF8);`
    )
  for (const [name, value] of headers) {
    if (name.toLowerCase() === 'content-type' && body !== undefined)
      lines.push('request.Content.Headers.Remove("Content-Type");')
    lines.push(
      (name.toLowerCase() === 'content-type' && body !== undefined
        ? 'request.Content.Headers'
        : 'request.Headers') +
        `.TryAddWithoutValidation(${cs(name)}, ${cs(value)});`
    )
  }
  lines.push(
    'using var response = await client.SendAsync(request);',
    'Console.WriteLine(await response.Content.ReadAsStringAsync());'
  )
  return lines.join('\n')
}
