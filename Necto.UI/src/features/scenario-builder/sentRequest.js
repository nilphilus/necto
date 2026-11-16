import { safeRequest } from '../workbench/privacy.js'
import { describeBody } from '../workbench/body.js'
export function sentRequest(request) {
 const oversized=typeof request.options.body==='string'&&request.options.body.length>250000
 let safe,omitted=oversized
 try {safe=safeRequest(oversized?{...request,options:{...request.options,body:undefined}}:request)}
 catch {omitted=true;safe=safeRequest({...request,options:{...request.options,body:undefined}})}
 return {url:safe.url.href,method:safe.options.method??'GET',headers:Object.fromEntries(safe.options.headers),body:omitted?'[request body omitted: preview budget or redaction depth exceeded]':describeBody(safe.options.body)}
}
