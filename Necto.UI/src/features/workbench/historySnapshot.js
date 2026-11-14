import { safeRequest, sensitiveName } from './privacy.js';
import { payloadSnapshot } from './body.js';
function withoutSecrets(value, depth = 0) {
  if (depth > 64) return undefined;
  if (Array.isArray(value))
    return value.map((item) => withoutSecrets(item, depth + 1));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([name]) => !sensitiveName(name))
        .map(([name, item]) => [name, withoutSecrets(item, depth + 1)])
    );
  return value;
}
export function historySnapshot(request, draft) {
  const safe = safeRequest(request),
    body = safe.options.body;
  const wire =
    body instanceof FormData
      ? {
          kind: 'form',
          entries: [...body].map(([name, value]) => [
            name,
            value instanceof Blob
              ? { file: value.name ?? 'upload.bin', type: value.type }
              : value
          ])
        }
      : body instanceof Blob
        ? { kind: 'binary', name: body.name ?? 'upload.bin', type: body.type }
        : body === undefined
          ? undefined
          : { kind: 'text', text: String(body) };
  let editorBody = draft?.body ?? '';
  if (
    typeof body === 'string' &&
    /json/i.test(safe.options.headers.get('Content-Type') ?? '')
  ) {
    try {
      editorBody = JSON.stringify(withoutSecrets(JSON.parse(body)), null, 2);
    } catch {
      editorBody = '';
    }
  }
  const editor = draft
    ? {
        ...payloadSnapshot(draft),
        fields: withoutSecrets(draft.fields ?? {}),
        body: editorBody,
        assertions: draft.assertions ?? [],
        timeout: draft.timeout,
        serverIndex: draft.serverIndex,
        serverValues: withoutSecrets(draft.serverValues ?? {})
      }
    : undefined;
  if (editor?.formFields)
    editor.formFields = editor.formFields.map((row) =>
      sensitiveName(row.name) ? { ...row, value: '' } : row
    );
  return {
    request: {
      url: safe.url.href,
      method: safe.options.method,
      headers: [...safe.options.headers],
      body: wire
    },
    draft: editor
  };
}
export function requestFromHistory(snapshot) {
  const wire = snapshot.request.body;
  let body;
  if (wire?.kind === 'text') body = wire.text;
  if (wire?.kind === 'binary')
    body = new File([], wire.name, { type: wire.type });
  if (wire?.kind === 'form') {
    body = new FormData();
    for (const [name, value] of wire.entries) {
      if (value && typeof value === 'object')
        body.append(name, new Blob([], { type: value.type }), value.file);
      else body.append(name, value);
    }
  }
  return {
    url: new URL(snapshot.request.url),
    options: {
      method: snapshot.request.method,
      headers: new Headers(snapshot.request.headers),
      body
    }
  };
}
export function restoreHistoryDraft(session, snapshot) {
  if (!snapshot?.draft) throw new Error('Draft not retained for this entry.');
  Object.assign(session, JSON.parse(JSON.stringify(snapshot.draft)), {
    binaryFile: undefined,
    bindings: [],
    sampleName: undefined,
    error: '',
    resultStale: Boolean(session.result)
  });
}
