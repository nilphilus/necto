import { SaxesParser } from 'saxes'

export const XML_NODE_LIMIT = 200000
export const XML_TEXT_LIMIT = 16 * 1024 * 1024
export const XML_DEPTH_LIMIT = 2048

export function parseXml(text, limits = {}) {
  const maxNodes = limits.nodes ?? XML_NODE_LIMIT
  const maxText = limits.text ?? XML_TEXT_LIMIT
  const maxDepth = limits.depth ?? XML_DEPTH_LIMIT
  const nodes = [{ kind: 'document', children: [] }]
  const stack = [0]
  let characters = 0, entries = 1
  const parser = new SaxesParser({ xmlns: true })
  const reserve = (count) => {
    characters += count
    if (characters > maxText) throw new Error('XML preview text limit reached. Use Raw or download the original response.')
  }
  function add(node) {
    if (++entries > maxNodes) throw new Error('XML preview node limit reached. Use Raw or download the original response.')
    const index = nodes.length
    nodes.push(node)
    nodes[stack.at(-1)].children.push(index)
    return index
  }
  function finish(index) {
    const node = nodes[index]
    const mixed = node.children.some(child => nodes[child].kind === 'text' && /\S/.test(nodes[child].value))
    if (!node.preserveSpace && !mixed) node.children = node.children.filter(child => nodes[child].kind !== 'text' || /\S/.test(nodes[child].value))
  }
  parser.on('error', error => { throw error })
  parser.on('doctype', () => { throw new Error('XML with a DOCTYPE is not previewed. Use Raw or download the original response.') })
  parser.on('opentag', tag => {
    if (stack.length > maxDepth) throw new Error('XML preview depth limit reached. Use Raw or download the original response.')
    const attributes = Object.values(tag.attributes).map(attribute => ({ name: attribute.name, value: attribute.value }))
    reserve(tag.name.length + attributes.reduce((sum, attribute) => sum + attribute.name.length + attribute.value.length, 0))
    entries += attributes.length
    if (entries > maxNodes) throw new Error('XML preview node limit reached (including attributes). Use Raw or download the original response.')
    const space = tag.attributes['xml:space']?.value
    stack.push(add({ kind: 'element', name: tag.name, attributes, children: [],
      preserveSpace: space === 'preserve' || (space !== 'default' && nodes[stack.at(-1)].preserveSpace === true) }))
  })
  parser.on('closetag', () => finish(stack.pop()))
  for (const kind of ['text', 'cdata', 'comment']) parser.on(kind, value => { reserve(value.length); add({ kind, value }) })
  parser.on('processinginstruction', ({ target, body }) => { reserve(target.length + body.length); add({ kind: 'instruction', value: target + (body ? ' ' + body : '') }) })
  parser.on('xmldecl', declaration => {
    const value = Object.entries(declaration).filter(([, value]) => value !== undefined).map(([name, value]) => `${name}="${value}"`).join(' ')
    reserve(value.length); add({ kind: 'instruction', value: 'xml ' + value })
  })
  // Bound the parser's temporary text buffer; all work runs off the UI thread.
  for (let offset = 0; offset < text.length; offset += 65536) parser.write(text.slice(offset, offset + 65536))
  parser.close()
  finish(0)
  return nodes
}
