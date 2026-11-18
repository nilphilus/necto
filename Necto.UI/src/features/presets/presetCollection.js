export function validatePresetCollection(value) {
  if (
    ![1, 2, undefined].includes(value.version) ||
    !Array.isArray(value.presets ?? value.environments)
  )
    throw new Error('Invalid presets.')
  for (const pair of value.presets ?? value.environments)
    if (
      !Array.isArray(pair) ||
      pair.length !== 2 ||
      typeof pair[0] !== 'string' ||
      !Array.isArray(pair[1]) ||
      pair[1].some(
        (item) => !Array.isArray(item) || item.length !== 2 || typeof item[0] !== 'string'
      )
    )
      throw new Error('Invalid preset values.')
}
