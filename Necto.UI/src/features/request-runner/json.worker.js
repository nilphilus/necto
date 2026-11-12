self.onmessage = ({ data }) => {
  try { self.postMessage({ json: JSON.parse(data), valid: true }) }
  catch { self.postMessage({ valid: false }) }
}
