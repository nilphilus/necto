import { parseXml } from './xml.js'
self.onmessage = ({ data }) => {
  try { self.postMessage({ nodes: parseXml(data) }) }
  catch (error) { self.postMessage({ error: error.message.startsWith('XML') ? error.message : 'Invalid XML: ' + error.message }) }
}
