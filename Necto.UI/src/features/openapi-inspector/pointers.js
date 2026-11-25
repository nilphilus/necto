export function pointerFor(path) {
  return path.map(part => '/' + String(part).replaceAll('~', '~0').replaceAll('/', '~1')).join('')
}
