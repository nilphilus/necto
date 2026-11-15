import test from 'node:test'
import assert from 'node:assert/strict'
import {mappingExplanation} from './mappingExplanation.js'
test('evidence distinguishes declared identifiers, explicit keys and heuristic names',()=>{
 const m={source:{operationId:'Invoices',property:'id'},target:{operationId:'Details',name:'invoiceId'}}
 assert.match(mappingExplanation({...m,match:'type',evidence:{sourceType:'Billing.InvoiceId'}}),/shared CLR identifier type Billing.InvoiceId/)
 assert.match(mappingExplanation({...m,match:'attribute',evidence:{logicalKey:'LegacyInvoice'}}),/explicit EndpointValue association “LegacyInvoice”/)
 assert.match(mappingExplanation({...m,match:'name'}),/suggestion.*naming conventions.*Review/)
})
