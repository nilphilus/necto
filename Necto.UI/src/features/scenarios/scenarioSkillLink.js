const repository = 'nilphilus/necto'
const releases = `https://github.com/${repository}/releases`
export const latestScenarioSkill = `${releases}/latest`

export function scenarioSkillRelease(version) {
  if (typeof version !== 'string' || version.length > 80 ||
      !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(version)) return null

  const tag = `v${version}`
  const asset = `necto-scenarios-${version}.zip`
  return {
    asset,
    lookup: `https://api.github.com/repos/${repository}/releases/tags/${tag}`,
    download: `${releases}/download/${tag}/${asset}`,
  }
}

export async function scenarioSkillDestination(release, fetchRelease = fetch) {
  if (!release) return latestScenarioSkill
  try {
    const response = await fetchRelease(release.lookup, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(2500),
    })
    if (response.ok) {
      const { assets } = await response.json()
      if (Array.isArray(assets) && assets.some((item) => item.name === release.asset && item.state === 'uploaded'))
        return release.download
    }
  } catch {
    // The release page remains available if the public API cannot be reached.
  }
  return latestScenarioSkill
}
