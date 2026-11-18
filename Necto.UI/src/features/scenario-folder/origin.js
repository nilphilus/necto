export async function contentRevision(text) {
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(value=>value.toString(16).padStart(2,'0')).join('')
}
