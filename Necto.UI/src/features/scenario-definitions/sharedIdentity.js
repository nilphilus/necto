export function validateSharedIdentity(scenario) {
  if (typeof scenario?.name !== 'string' || scenario.name.length > 200 ||
      typeof scenario?.id !== 'string' || scenario.id.length > 2000) {
    throw new Error('Shared scenarios need a name of up to 200 characters and a bounded ID.')
  }
}
