// Keep Faker off the initial page-load path. Only expose a curated, stable API.
export const generators = [
  ['uuid', 'UUID'], ['firstName', 'Person · first name'], ['lastName', 'Person · last name'],
  ['fullName', 'Person · full name'], ['email', 'Internet · email'], ['username', 'Internet · username'],
  ['company', 'Company · name'], ['city', 'Location · city'], ['countryCode', 'Location · country code'],
  ['integer', 'Number · integer (0–1000)'], ['boolean', 'Boolean'], ['date', 'Date · ISO timestamp'],
  ['regex', 'Pattern · bounded regex'],
]
const known = new Set(generators.map(([key]) => key))

// A deliberately small, bounded regex language. Never compile or execute user regex.
// Supports literals, character classes/ranges, \d/\w/\s and bounded quantifiers.
export function patternTokens(pattern) {
  if (typeof pattern !== 'string' || !pattern || pattern.length > 256) throw new Error('Enter a pattern of 1–256 characters.')
  let text = pattern
  if (text.startsWith('^')) text = text.slice(1)
  if (text.endsWith('$') && !text.endsWith('\\$')) text = text.slice(0, -1)
  const tokens = [], digits = '0123456789', words = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz' + digits + '_'
  let index = 0, maxLength = 0
  const escaped = () => {
    if (index >= text.length) throw new Error('Incomplete pattern escape.')
    const char = text[index++]
    if (char === 'd') return digits
    if (char === 'w') return words
    if (char === 's') return ' '
    if ('\\.^$[]{}()*+?|-/'.includes(char)) return char
    throw new Error('Supported escapes: \\d, \\w, \\s or escaped punctuation.')
  }
  while (index < text.length) {
    let choices, char = text[index++]
    if (char === '\\') choices = escaped()
    else if (char === '[') {
      choices = ''
      while (index < text.length && text[index] !== ']') {
        let first = text[index++]
        if (first === '^' || first === '[') throw new Error('Negated or nested classes are not supported.')
        if (first === '\\') { choices += escaped(); continue }
        if (text[index] === '-' && text[index + 1] && text[index + 1] !== ']') {
          index++; const last = text[index++]
          if (first.charCodeAt(0) > last.charCodeAt(0) || last.charCodeAt(0) > 126 || first.charCodeAt(0) < 32) throw new Error('Use ascending printable character ranges.')
          for (let code = first.charCodeAt(0); code <= last.charCodeAt(0); code++) choices += String.fromCharCode(code)
        } else choices += first
      }
      if (text[index++] !== ']' || !choices) throw new Error('Close each non-empty character class with ].')
    } else {
      if ('.^$]{}()*+?|'.includes(char)) throw new Error('Use literals, [A-Z], \\d, \\w and {n} or {min,max}. Unbounded repetition and groups are not supported.')
      choices = char
    }
    let min = 1, max = 1
    if (text[index] === '?') { min = 0; index++ }
    else if (text[index] === '{') {
      const end = text.indexOf('}', index), count = text.slice(index + 1, end)
      if (end < 0 || !/^\d{1,2}(,\d{1,2})?$/.test(count)) throw new Error('Use a bounded count such as {4} or {2,8}.')
      const parts = count.split(',').map(Number); min = parts[0]; max = parts[1] ?? min; index = end + 1
      if (min > max || max > 32) throw new Error('Pattern counts must be ordered and at most 32.')
    }
    maxLength += max
    if (maxLength > 256) throw new Error('Generated patterns are limited to 256 characters.')
    tokens.push({ choices, min, max })
  }
  if (!tokens.length) throw new Error('Pattern needs at least one character token.')
  return tokens
}
export function validateGenerator(input) {
  if (!known.has(input.generator)) throw new Error('Choose a supported data generator.')
  if (input.generator === 'regex') patternTokens(input.pattern)
}
export async function generateValue(input) {
  validateGenerator(input)
  const { fakerEN: faker } = await import('@faker-js/faker')
  if (input.generator === 'regex') return patternTokens(input.pattern).map(({ choices, min, max }) => {
    const length = faker.number.int({ min, max })
    return Array.from({ length }, () => choices[faker.number.int({ min: 0, max: choices.length - 1 })]).join('')
  }).join('')
  const factories = {
    uuid: () => faker.string.uuid(), firstName: () => faker.person.firstName(), lastName: () => faker.person.lastName(),
    fullName: () => faker.person.fullName(), email: () => faker.internet.email(), username: () => faker.internet.username(),
    company: () => faker.company.name(), city: () => faker.location.city(), countryCode: () => faker.location.countryCode(),
    integer: () => faker.number.int({ min: 0, max: 1000 }), boolean: () => faker.datatype.boolean(), date: () => new Date().toISOString(),
  }
  return factories[input.generator]()
}
