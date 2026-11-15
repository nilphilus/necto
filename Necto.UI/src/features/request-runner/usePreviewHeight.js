import { getCurrentInstance, onMounted, onScopeDispose } from 'vue'

export function availablePreviewHeight({ top, panelTop = 0, panelBottom, viewportHeight, toolbarHeight }) {
  const bottom = Math.min(viewportHeight, panelBottom ?? viewportHeight) - 12
  const start = Math.max(0, panelTop)
  const naturalTop = start + Math.max(0, toolbarHeight ?? top - start)
  const surfaceTop = top >= start && top < bottom ? Math.min(top, naturalTop) : naturalTop
  return Math.max(80, Math.floor(bottom - surfaceTop))
}

export function usePreviewHeight() {
  const instance = getCurrentInstance()
  const rootElement = () => instance?.proxy?.$el
  let frame, observer, panel
  function measure() {
    frame = undefined
    const element = rootElement()
    if (!element) return
    const surface = [...element.querySelectorAll('.json-preview, .xml-tree, .raw-preview pre, .table-scroll')].find(node => node.getClientRects().length)
    if (!surface) return
    const rect = surface.getBoundingClientRect(), bounds = panel?.getBoundingClientRect()
    const height = availablePreviewHeight({ top: rect.top, panelTop: bounds?.top, panelBottom: bounds?.bottom,
      viewportHeight: window.visualViewport?.height ?? window.innerHeight,
      toolbarHeight: Math.max(0, rect.top - (element.closest('.response-pane') ?? element).getBoundingClientRect().top) })
    const value = `${height}px`
    if (element.style.getPropertyValue('--preview-height') !== value) element.style.setProperty('--preview-height', value)
  }
  function schedule() { if (frame === undefined) frame = requestAnimationFrame(measure) }
  onMounted(() => {
    const root = rootElement()
    if (!root) return
    panel = root.closest('.work-area')
    observer = new ResizeObserver(schedule)
    for (const node of [root, panel, root.closest('article')]) if (node) observer.observe(node)
    panel?.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    window.visualViewport?.addEventListener('resize', schedule)
    schedule()
  })
  onScopeDispose(() => {
    observer?.disconnect(); if (frame !== undefined) cancelAnimationFrame(frame)
    panel?.removeEventListener('scroll', schedule)
    window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule)
    window.visualViewport?.removeEventListener('resize', schedule)
  })
  return schedule
}
