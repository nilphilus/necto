const features = {
  workflow: { image: 'workflow.png', title: 'The right value. Already in the next request.', description: 'Select an invoice, choose a related request, and carry its ID forward. Open the form to review or edit before sending.', alt: 'Necto showing a selected invoice and its response values.', link: 'connections', action: 'How connections work' },
  scenarios: { image: 'scenarios.png', title: 'The same journey. Fresh responses.', description: 'Save a request chain and replay it with values from new responses. See which step ran, what it returned, and where the next value came from.', alt: 'A completed invoice scenario with step statuses, response details, and a linked input value.', link: 'scenarios', action: 'Read about scenarios' },
  search: { image: 'search.png', title: 'Find the object, not just the page.', description: 'Search the whole response, jump to the matching page, and select the object you need. Preview pagination works independently of API pagination.', alt: 'Necto searching a large JSON response and selecting an object on a later page.', link: 'large-responses', action: 'Preview and memory limits' },
  graph: { image: 'graph.png', title: 'See how your API fits together.', description: 'Explore separate entity and endpoint graphs. Select a node to understand its connections and open the relevant request.', alt: 'Necto endpoint graph showing connected operations and details of a selected request.', link: 'graphs', action: 'Explore the graph views' },
}

const tabs = [...document.querySelectorAll('[data-feature]')]
function selectFeature(tab, focus = false) {
  const feature = features[tab.dataset.feature]
  if (!feature) return
  for (const button of tabs) { button.setAttribute('aria-selected', String(button === tab)); button.tabIndex = button === tab ? 0 : -1 }
  document.querySelector('#product-panel').setAttribute('aria-labelledby', tab.id)
  const image = document.querySelector('#product-image')
  image.src = `assets/${feature.image}`; image.alt = feature.alt
  document.querySelector('#feature-title').textContent = feature.title
  document.querySelector('#feature-description').textContent = feature.description
  const link = document.querySelector('#feature-link')
  link.href = `technical.html#${feature.link}`; link.textContent = `${feature.action} →`
  if (focus) tab.focus()
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectFeature(tab))
  tab.addEventListener('keydown', event => {
    const target = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null
    if (target !== null) { event.preventDefault(); selectFeature(tabs[target], true) }
  })
})

const select = document.querySelector('#select-example')
const next = document.querySelector('#next-example')
select?.addEventListener('click', () => {
  select.setAttribute('aria-pressed', 'true'); select.textContent = 'Selected ✓'
  document.querySelector('#demo-object').classList.add('selected')
  document.querySelector('#next-invoice').value = '42'
  document.querySelector('#connected-tag').hidden = false
  document.querySelector('#demo-hint').textContent = 'invoice.id → invoiceId. Ready for the next request.'
  next.disabled = false
})
next?.addEventListener('click', () => {
  document.querySelector('#demo-result').hidden = false
  document.querySelector('#demo-hint').textContent = 'The example continued with invoiceId = 42.'
  next.disabled = true
})
document.querySelector('#reset-example')?.addEventListener('click', () => {
  select.setAttribute('aria-pressed', 'false'); select.innerHTML = 'Select invoice <span aria-hidden="true">+</span>'
  document.querySelector('#demo-object').classList.remove('selected')
  document.querySelector('#next-invoice').value = ''
  document.querySelector('#connected-tag').hidden = true
  document.querySelector('#demo-result').hidden = true
  document.querySelector('#demo-hint').textContent = 'Select the invoice to carry its ID forward.'
  next.disabled = true
})

const viewer = document.querySelector('#image-viewer')
document.querySelector('#expand-screenshot')?.addEventListener('click', () => {
  const image = document.querySelector('#product-image')
  const expanded = document.querySelector('#viewer-image')
  expanded.src = image.src; expanded.alt = image.alt
  document.querySelector('#viewer-title').textContent = document.querySelector('#feature-title').textContent
  viewer.showModal()
})
document.querySelector('#close-viewer')?.addEventListener('click', () => viewer.close())
viewer?.addEventListener('click', event => { if (event.target === viewer) viewer.close() })

const snippets = { install: 'dotnet add package Necto.OpenApi', setup: '// Keep your existing OpenAPI registration. Add these once after builder.Build().\napp.MapNectoEndpointMappings();\napp.UseNectoUI();' }
document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
  const text = snippets[button.dataset.copy] ?? document.querySelector(button.dataset.copy)?.textContent
  if (!text) return
  const status = document.querySelector('#copy-status')
  try {
    await navigator.clipboard.writeText(text)
    status.textContent = 'Copied to clipboard.'
  } catch {
    const area = document.createElement('textarea'); area.value = text; area.setAttribute('aria-label', 'Code to copy'); area.className = 'copy-fallback'; document.body.append(area); area.select()
    try { if (!document.execCommand('copy')) throw new Error(); status.textContent = 'Copied to clipboard.' } catch { status.textContent = 'Copy is unavailable. Select the code and copy it manually.' }
    area.remove(); button.focus()
  }
  clearTimeout(window.copyStatusTimer); window.copyStatusTimer = setTimeout(() => { status.textContent = '' }, 3500)
}))
