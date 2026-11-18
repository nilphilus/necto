const { run } = require('./qa-fixture.cjs')

run(async ({ p, assert }) => {
  const repository = 'https://github.com/nilphilus/necto/releases'
  const version = '0.11.0-preview.1'
  const asset = `necto-scenarios-${version}.zip`
  let packageVersion = version
  let uploaded = true
  let lookups = 0
  const navigations = []
  await p.route('**/configuration', async (route) => {
    const response = await route.fetch()
    const configuration = await response.json()
    configuration.nectoPackageVersion = packageVersion
    await route.fulfill({ response, json: configuration })
  })
  await p.context().route('https://api.github.com/repos/nilphilus/necto/releases/tags/**', async (route) => {
    lookups++
    await route.fulfill({ json: { assets: uploaded ? [{ name: asset, state: 'uploaded' }] : [] } })
  })
  await p.context().route(repository + '/**', async (route) => {
    navigations.push(route.request().url())
    await route.fulfill({ body: 'Scenario skill release' })
  })
  await p.reload()
  await p.getByRole('button', { name: 'Scenarios', exact: true }).click()
  const link = p.getByRole('link', { name: 'Get the Necto skill' })
  assert.equal(await link.getAttribute('href'), repository + '/latest')
  assert.equal(lookups, 0)

  async function openSkill(destination) {
    const newPage = p.context().waitForEvent('page')
    await link.click()
    const tab = await newPage
    await tab.waitForURL(destination)
    await tab.close()
  }

  await openSkill(`${repository}/download/v${version}/${asset}`)
  uploaded = false
  await openSkill(repository + '/latest')
  assert.equal(lookups, 2)

  packageVersion = undefined
  await p.reload()
  await openSkill(repository + '/latest')
  assert.equal(lookups, 2)
  assert.equal(navigations.length, 3)
})
