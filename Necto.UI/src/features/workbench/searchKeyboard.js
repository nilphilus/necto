export function moveThroughSearchResults(event, input, buttons) {
  if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
  const index = buttons.indexOf(event.target)
  const fromInput = event.target === input
  if (!fromInput && index < 0) return

  let target
  if (event.key === 'Enter' && fromInput && buttons.length === 1) {
    event.preventDefault()
    buttons[0].click()
    return
  }
  if (event.key === 'ArrowDown') target = buttons[index + 1]
  if (event.key === 'ArrowUp') target = fromInput ? buttons.at(-1) : index === 0 ? input : buttons[index - 1]
  if (event.key === 'Escape' && !fromInput) target = input
  if (!target) return
  event.preventDefault()
  event.stopPropagation()
  target.focus()
}
