import { exportWorkspace } from './workspace.js';
export function createCiBundle(
  scenario,
  document,
  mappings = [],
  includeBodies = false
) {
  if (scenario.steps.some((step) => step.apiId !== 'local'))
    throw new Error('The current CI runner supports one local API per run.');
  const storage = {
    length: 1,
    key: () => 'necto:scenarios:ci',
    getItem: () => JSON.stringify({ version: 1, scenarios: [scenario] })
  };
  const safe = exportWorkspace(storage, includeBodies).entries[0].value
    .scenarios[0];
  return {
    format: 'necto-ci-bundle',
    version: 1,
    scenario: safe,
    document: JSON.parse(JSON.stringify(document)),
    mappings: JSON.parse(JSON.stringify(mappings))
  };
}
const quote = (value) => "'" + String(value).replaceAll("'", "'\\''") + "'";
export function ciCommand(baseUrl, { bearer = false, writes = false, shell = 'bash' } = {}) {
  const url = new URL(baseUrl);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    [...url.searchParams].length
  )
    throw new Error(
      'Use an HTTP(S) API base URL without credentials or query parameters.'
    );
  return `node tools/necto-run.mjs --bundle necto-ci.json --base-url ${shell === 'powershell' ? "'" + url.href.replaceAll("'", "''") + "'" : quote(url.href)}${bearer ? ' --bearer-env NECTO_CI_TOKEN' : ''}${writes ? ' --allow-writes' : ''} --report necto-report.json --junit necto-report.xml`;
}

export function ciSetup(version) {
  if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version)) throw new Error('Runner version must be a release version.')
  return `git clone https://github.com/nilphilus/necto.git
cd necto
git checkout --detach v${version}
corepack pnpm --dir Necto.UI install --frozen-lockfile`
}
