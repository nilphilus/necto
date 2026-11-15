#!/usr/bin/env node
import { resolveCiReferences } from './ci-references.mjs'
import { failureDiagnostic } from './failure-diagnostic.mjs'
import { executionOptions } from '../Necto.UI/src/features/workbench/executionOptions.js'
import { junitReport } from './junit.mjs'
import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import {
  parseDocument
} from '../Necto.UI/src/features/workbench/document.js'
import { readOperations } from '../Necto.UI/src/features/api-catalog/catalog.js'
import { resolveMappingLinks } from '../Necto.UI/src/features/related-endpoints/mappings.js'
import {
  prepareScenario,
  validateScenario,
  executeScenario
} from '../Necto.UI/src/features/scenarios/scenario.js'
import {
  buildRequest,
  initialBody,
  sendRequest
} from '../Necto.UI/src/features/request-runner/request.js'
import { evaluateAssertions } from '../Necto.UI/src/features/workbench/assertions.js'
import { safeRequest } from '../Necto.UI/src/features/workbench/privacy.js'
function requireWritePermission(scenario, allowWrites) {
  validateScenario(scenario)
  if (!allowWrites && scenario.steps.some(step => !['GET', 'HEAD', 'OPTIONS'].includes(step.method)))
    throw new Error('This scenario contains writes. Pass --allow-writes explicitly.')
}
export async function runScenario({
  scenario,
  document,
  baseUrl,
  mappings = [],
  timeout = 30000,
  bearer,
  allowWrites = false
}) {
  const origin = new URL(baseUrl).origin
  const configuration = {
    openApiUrl: new URL('/openapi.json', baseUrl).href,
    apiBaseUrl: baseUrl
  }
  const operations = readOperations(document).map((operation) => ({
    ...operation,
    server: undefined,
    servers: []
  }))
  const links = resolveMappingLinks(operations, [{ apiId: 'local', mappings }])
  requireWritePermission(scenario, allowWrites)
  const plan = prepareScenario(scenario, {
    operations,
    links,
    configuration,
    createSession: (operation) => ({
      fields: {},
      body: initialBody(operation),
      bindings: []
    }),
    valuesFor: () => new Map()
  })
  const controller = new AbortController()
  const summary = await executeScenario(plan, {
    signal: controller.signal,
    execute: async (operation, session, values, signal, onRequest) => {
      const request = buildRequest(operation, configuration, session, values)
      if (request.url.origin !== origin)
        throw Object.assign(new Error('Request origin differs from --base-url.'), { code: 'ORIGIN_MISMATCH' })
      request.options.redirect = 'error'
      const deadline = AbortSignal.timeout(Math.min(600000, Math.max(1, Number(session.timeout ?? timeout))))
      request.options.signal = AbortSignal.any([
        signal,
        deadline
      ])
      if (bearer)
        request.options.headers.set('Authorization', `Bearer ${bearer}`)
      onRequest(safeRequest(request))
      const start = performance.now()
      const policy = executionOptions(session)
      let result
      try { result = await sendRequest(request, { responseLimitBytes: policy.responseLimitMiB * 1024 * 1024 }) }
      catch (cause) {
        const code = signal.aborted ? 'CANCELED' : deadline.aborted ? 'TIMEOUT' : cause.code === 'RESPONSE_LIMIT_EXCEEDED' ? cause.code : 'NETWORK_ERROR'
        throw Object.assign(new Error(failureDiagnostic(code).message), { code })
      }
      result.elapsed = Math.round(performance.now() - start)
      result.assertions = evaluateAssertions(session.assertions ?? [], result)
      return result
    }
  })
  return {
    version: 1,
    scenario: scenario.name,
    status: summary.status,
    steps: plan.map((step, index) => ({
      step: index + 1,
      operation: step.operation.key,
      status: step.status,
      httpStatus: step.httpStatus,
      elapsed: step.elapsed,
      checks:
        step.response?.assertions?.map(({ label, passed }) => ({
          label,
          passed
        })) ?? [],
      error: step.error ? failureDiagnostic(step.failureCode).message : '',
      ...(step.error ? { failure: failureDiagnostic(step.failureCode, step.session, step.httpStatus) } : {})
    }))
  }
}
async function main() {
  const args = Object.create(null)
  for (let index = 2; index < process.argv.length; index++) {
    const key = process.argv[index]
    if (key === '--allow-ref-origin') {
      if (!process.argv[index + 1] || process.argv[index + 1].startsWith('--')) throw new Error('Missing value for --allow-ref-origin')
      ;(args[key] ??= []).push(process.argv[++index])
    } else if (key === '--allow-writes') args[key] = true
    else if (
      !key.startsWith('--') ||
      !process.argv[index + 1] ||
      process.argv[index + 1].startsWith('--')
    )
      throw new Error(`Missing value for ${key}`)
    else args[key] = process.argv[++index]
  }
  if (!args['--base-url'] || !args['--bundle'] && (!args['--scenario'] || !args['--document']))
    throw new Error(
      'Usage: node tools/necto-run.mjs --bundle necto-ci.json --base-url URL [--junit report.xml] OR --scenario scenario.json --document openapi.yaml --base-url https://api.example.com [--mappings mappings.json] [--name scenario-name] [--bearer-env TOKEN_ENV] [--allow-writes] [--allow-ref-origin https://trusted.example] [--report report.json]'
    )
  const bundle = args['--bundle'] ? JSON.parse(await readFile(args['--bundle'], 'utf8')) : undefined
  if (bundle && (bundle.format !== 'necto-ci-bundle' || ![1, 2].includes(bundle.version) || !bundle.scenario || !bundle.document || !Array.isArray(bundle.mappings))) throw new Error('Invalid CI bundle.')
  const saved = bundle?.scenario ?? JSON.parse(await readFile(args['--scenario'], 'utf8'))
  const candidates =
    saved.format === 'necto-workspace'
      ? saved.entries.flatMap((entry) => entry.value.scenarios ?? [])
      : (saved.scenarios ?? [saved])
  const scenario = args['--name']
    ? candidates.find((item) => item.name === args['--name'])
    : candidates.length === 1
      ? candidates[0]
      : undefined
  if (!scenario) throw new Error('Select a scenario with --name.')
  requireWritePermission(scenario, args['--allow-writes'])
  const baseUrl = args['--base-url'],
    parsed = parseDocument(bundle ? JSON.stringify(bundle.document) : await readFile(args['--document'], 'utf8'))
  const document = await resolveCiReferences(parsed, new URL('/openapi.json', baseUrl).href, {
    allowedOrigins: args['--allow-ref-origin'] ?? [],
    timeout: args['--timeout'] ? Number(args['--timeout']) : 30000
  })
  const bearer = args['--bearer-env']
    ? process.env[args['--bearer-env']]
    : undefined
  if (args['--bearer-env'] && !bearer)
    throw new Error('The named bearer environment variable is empty.')
  const report = await runScenario({
    scenario,
    document,
    baseUrl,
    timeout: args['--timeout'] ? Number(args['--timeout']) : 30000,
    bearer,
    allowWrites: args['--allow-writes'],
    mappings: args['--mappings']
      ? JSON.parse(await readFile(args['--mappings'], 'utf8'))
      : bundle?.mappings ?? []
  })
  const text = JSON.stringify(report, null, 2) + '\n'
  if (args['--junit']) await writeFile(args['--junit'], junitReport(report))
  if (args['--report']) await writeFile(args['--report'], text)
  process.stdout.write(text)
  process.exitCode = report.status === 'completed' ? 0 : 1
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
