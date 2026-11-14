import {test} from 'node:test'
import assert from 'node:assert/strict'
import {historySummary} from './historySummary.js'
test('summary uses the sent URL, not draft values overridden by a preset',()=>{
 const entry={url:'https://api.test/v2/lookup?invoiceReference=INV-43',snapshot:{request:{url:'https://api.test/v1/lookup?invoiceReference=INV-42'},draft:{fields:{'query:invoiceReference':'other'}}}}
 assert.deepEqual(historySummary(entry,{path:'/lookup'}),{input:'invoiceReference=INV-42',target:'api.test/v1'})
})
test('secret queries and path parameters never become the summary',()=>{
 assert.deepEqual(historySummary({url:'https://u:p@api.test/v2/reset/secret?api_key=[redacted]&token=hidden'},{path:'/reset/{resetToken}'}),{input:'',target:'api.test/v2'})
 assert.equal(historySummary({url:'https://api.test/v2/invoices/42'},{path:'/invoices/{invoiceId}'}).input,'invoiceId=42')
})
test('missing URLs, malformed escapes and long values stay bounded',()=>{
 assert.deepEqual(historySummary({url:'broken'},{path:'/x'}),{input:'',target:''})
 assert.deepEqual(historySummary({url:'https://api.test/x/%ZZ'},{path:'/x/{id}'}),{input:'',target:''})
 assert.equal(historySummary({url:'https://api.test/x?reference='+ 'a'.repeat(10000)},{path:'/x'}).input.length,74)
})
