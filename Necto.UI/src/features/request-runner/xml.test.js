import test from 'node:test'
import assert from 'node:assert/strict'
import { parseXml } from './xml.js'
import { isXmlResponse, looksLikeXml } from './xmlDetection.js'
import { responseFilename } from '../workbench/response.js'

test('XML recognition supports media types and embedded strings without treating arbitrary JSON strings as XML', () => {
  for (const type of ['application/xml', 'text/xml; charset=utf-8', 'application/soap+xml', 'APPLICATION/ATOM+XML']) assert.equal(isXmlResponse(type, ''), true)
  assert.equal(isXmlResponse('text/plain', '<invoice/>'), true)
  assert.equal(isXmlResponse('text/html', '<invoice/>'), false)
  assert.equal(looksLikeXml('  <?xml version="1.0"?><invoice/>'), true)
  for (const value of ['42', 'one < two', null, {}, '< not markup']) assert.equal(looksLikeXml(value), false)
})

test('XML tree preserves namespaces, attributes, entities, mixed content, CDATA and instructions', () => {
  const nodes = parseXml('<?xml version="1.0"?><i:invoice xmlns:i="urn:invoice" id="42"><!--note--><i:name>A &amp; B</i:name>Hello <b>world</b> !<![CDATA[<raw/>]]><?display quiet?></i:invoice>')
  const root = nodes[nodes[0].children.find(id => nodes[id].kind === 'element')]
  assert.equal(root.name, 'i:invoice')
  assert.deepEqual(root.attributes, [{ name: 'xmlns:i', value: 'urn:invoice' }, { name: 'id', value: '42' }])
  assert.ok(nodes.some(node => node.value === 'A & B'))
  assert.ok(nodes.some(node => node.kind === 'cdata' && node.value === '<raw/>'))
  assert.ok(nodes.some(node => node.kind === 'instruction' && node.value === 'display quiet'))
  assert.ok(root.children.some(id => nodes[id].value === 'Hello '))
})

test('formatting whitespace is omitted for element-only content, xml:space is inherited and reset', () => {
  const nodes = parseXml('<r>\n <a/>\n <b xml:space="preserve"> <c/> <d xml:space="default"> <e/> </d> </b>\n</r>')
  const find = name => nodes.find(node => node.name === name)
  assert.equal(find('r').children.length, 2)
  assert.equal(find('b').children.length, 5)
  assert.equal(find('d').children.length, 1)
})

test('invalid XML and DTD entities fail safely instead of producing a partial tree', () => {
  for (const xml of ['<r><a></r>', '<r/><second/>', '<r>&unknown;</r>', '<p:r/>', '<r a="1" a="2"/>']) assert.throws(() => parseXml(xml))
  assert.throws(() => parseXml('<!DOCTYPE r SYSTEM "https://example.invalid/external"><r/>'), /DOCTYPE/)
  assert.throws(() => parseXml('<!DOCTYPE r [<!ENTITY x "expanded">]><r>&x;</r>'), /DOCTYPE/)
})

test('large collections produce a flat index; resource limits report a raw fallback', () => {
  const nodes = parseXml('<invoices>' + '<invoice id="42"><total>125.00</total></invoice>'.repeat(10000) + '</invoices>')
  assert.equal(nodes[1].children.length, 10000)
  assert.throws(() => parseXml('<r><a/><b/></r>', { nodes: 3 }), /node limit/)
  assert.throws(() => parseXml('<r>long text</r>', { text: 4 }), /text limit/)
  assert.throws(() => parseXml('<r><a><b/></a></r>', { depth: 2 }), /depth limit/)
})

test('XML download extensions support text/xml and vendor XML types', () => {
  assert.equal(responseFilename({ contentType: 'text/xml; charset=utf-8' }), 'response.xml')
  assert.equal(responseFilename({ contentType: 'application/soap+xml' }), 'response.xml')
})
