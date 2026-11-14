// Transport URLs and logical workspace identity have different lifetimes.
export const workspaceIdentity = configuration => configuration?.workspaceId ?? configuration?.openApiUrl
export function importedWorkspaceId(configuration, name) {
  const label = name.trim()
  if (!label || label.length > 200) throw new Error('Choose a workspace name of 1–200 characters.')
  const base = new URL(configuration.openApiUrl)
  base.hash = 'necto-workspace=' + encodeURIComponent(label)
  return base.href
}
