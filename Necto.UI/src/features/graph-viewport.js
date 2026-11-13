import { nextTick, onMounted, onScopeDispose, ref, watch } from 'vue'
export function fitGraphScale(viewport, graph) {
  if (!viewport.width || !viewport.height || !graph.width || !graph.height) return 1
  return Math.max(.02, Math.min(1, (viewport.width - 24) / graph.width, (viewport.height - 24) / graph.height))
}
export function useGraphViewport(canvas, width, height, zoom) {
  const autoFit = ref(true)
  let observer
  function fit() {
    if (!canvas.value) return
    autoFit.value = true
    zoom.value = fitGraphScale({ width: canvas.value.clientWidth, height: canvas.value.clientHeight }, { width: width.value, height: height.value })
    canvas.value.scrollTo(0, 0)
  }
  function center(node, size) {
    if (!canvas.value || !node) return
    autoFit.value = false
    canvas.value.scrollTo(Math.max(0, (node.x + size.width / 2) * zoom.value - canvas.value.clientWidth / 2), Math.max(0, (node.y + size.height / 2) * zoom.value - canvas.value.clientHeight / 2))
  }
  watch([width, height], async () => { if (autoFit.value) { await nextTick(); fit() } })
  onMounted(() => { observer = new ResizeObserver(() => { if (autoFit.value) fit() }); observer.observe(canvas.value); fit() })
  onScopeDispose(() => observer?.disconnect())
  return { autoFit, fit, center }
}
