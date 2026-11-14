const xml = (value) =>
  String(value ?? '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
export function junitReport(report) {
  const failures = report.steps.filter(
    (step) =>
      step.status === 'failed' || step.checks.some((check) => !check.passed)
  ).length;
  const skipped = report.steps.filter((step) =>
    ['skipped', 'waiting', 'cancelled'].includes(step.status)
  ).length;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="${xml(report.scenario)}" tests="${report.steps.length}" failures="${failures}" skipped="${skipped}">\n${report.steps.map((step) => `<testcase name="${xml(step.operation)}" time="${Math.max(0, (step.elapsed ?? 0) / 1000)}">${step.status === 'failed' || step.checks.some((check) => !check.passed) ? '<failure message="Scenario step failed"/>' : ['skipped', 'waiting', 'cancelled'].includes(step.status) ? '<skipped/>' : ''}</testcase>`).join('\n')}\n</testsuite>\n`;
}
