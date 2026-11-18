export function stepIssue(cause, step, input) {
  if (!step?.id) return cause
  const issue = new Error(cause.message, { cause })
  issue.stepId = step.id
  if (input && ['path', 'query', 'header', 'body'].includes(input.location)) {
    issue.target = {
      location: input.location,
      name: input.location === 'body' ? input.pointer : input.name,
    }
  }
  return issue
}
