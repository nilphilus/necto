import test from 'node:test'
import assert from 'node:assert/strict'
import { sentRequest } from './sentRequest.js'
test('sent request captures dispatched values, redacts recognized credentials and does not mutate the wire request',()=>{
 const request={url:new URL('https://api.test/orders?token=secret&id=42'),options:{method:'POST',headers:new Headers({authorization:'Bearer secret','content-type':'application/json'}),body:JSON.stringify({customerId:42,password:'secret',nested:{apiKey:'secret'}})}}
 const snapshot=sentRequest(request)
 assert.equal(snapshot.method,'POST');assert.equal(snapshot.body.customerId,42);assert.equal(snapshot.body.password,'[redacted]');assert.equal(snapshot.body.nested.apiKey,'[redacted]');assert.equal(snapshot.headers.authorization,'[redacted]');assert.ok(!snapshot.url.includes('secret'))
 assert.equal(request.options.headers.get('authorization'),'Bearer secret');assert.ok(request.options.body.includes('secret'))
})
test('large or deeply nested diagnostic bodies do not prevent dispatch snapshots',()=>{
 const request=body=>({url:new URL('https://api.test'),options:{headers:new Headers(),body}})
 assert.match(sentRequest(request('x'.repeat(250001))).body,/omitted/)
 assert.match(sentRequest(request('{"nested":'.repeat(140)+'0'+'}'.repeat(140))).body,/omitted/)
})
test('bounded JSON snapshots retain all dispatched array items instead of silently cutting at 1000',()=>{
 const snapshot=sentRequest({url:new URL('https://api.test'),options:{headers:new Headers(),body:JSON.stringify(Array.from({length:1001},(_,id)=>({id})))}})
 assert.equal(snapshot.body.length,1001);assert.equal(snapshot.body[1000].id,1000)
})
