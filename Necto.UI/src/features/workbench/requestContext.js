import { safeRequest } from './privacy.js';
const files = new WeakMap();
let nextFile = 0;
function fileId(file) {
  if (!files.has(file)) files.set(file, ++nextFile);
  return files.get(file);
}
export function requestIdentity(request, draft = {}) {
  let first = 2166136261,
    second = 5381;
  function add(value) {
    const text = String(value);
    for (let index = 0; index < text.length; index++) {
      const code = text.charCodeAt(index);
      first = Math.imul(first ^ code, 16777619);
      second = Math.imul(second, 33) ^ code;
    }
    first = Math.imul(first ^ 0, 16777619);
  }
  add(request.options.method);
  add(request.url.href);
  for (const [name, value] of request.options.headers) {
    add(name);
    add(value);
  }
  const body = request.options.body;
  if (body instanceof FormData || body instanceof URLSearchParams)
    for (const [name, value] of body) {
      add(name);
      add(
        value instanceof Blob
          ? `${value.name}:${value.size}:${value.type}`
          : value
      );
    }
  else if (body instanceof Blob) add(`${body.size}:${body.type}`);
  else add(body ?? '');
  if (draft.binaryFile) add(fileId(draft.binaryFile));
  for (const row of draft.formFields ?? [])
    for (const file of row.files ?? []) add(fileId(file));
  return `${first >>> 0}:${second >>> 0}`;
}
export function captureSentRequest(request, draft) {
  let safe;
  try {
    safe = safeRequest(request);
  } catch {
    return undefined;
  }
  let body = safe.options.body;
  if (body instanceof FormData) {
    const form = new FormData();
    for (const [name, value] of body) {
      if (value instanceof Blob)
        form.append(
          name,
          new Blob([], { type: value.type }),
          value.name ?? 'upload.bin'
        );
      else form.append(name, value);
    }
    body = form;
  } else if (body instanceof Blob)
    body = new File([], body.name ?? 'upload.bin', { type: body.type });
  return Object.freeze({
    url: new URL(safe.url),
    options: Object.freeze({
      method: safe.options.method,
      headers: new Headers(safe.options.headers),
      body,
      credentials: safe.options.credentials
    })
  });
}
