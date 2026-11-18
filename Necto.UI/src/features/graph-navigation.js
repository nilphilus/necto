import { nextTick, onMounted, onScopeDispose, reactive, ref, watch } from 'vue'
export const MIN_ZOOM = .02, MAX_ZOOM = 3
export function wheelScale(scale, delta, mode, height) {
  const pixels = delta * (mode === 1 ? 16 : mode === 2 ? height : 1)
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale * Math.exp(-Math.max(-200, Math.min(200, pixels)) * .008)))
}
export function zoomScroll(scroll, cursor, before, after) { return (scroll + cursor) / before * after - cursor }
export function useGraphNavigation(canvas, width, height, zoom, autoFit) {
  const view = reactive({ x:0, y:0, width:0, height:0 })
  const isPanning = ref(false)
  let pan
  let observer, revision = 0
  function sync() {
    const el = canvas.value
    if (!el) return
    Object.assign(view, { x:el.scrollLeft / zoom.value, y:el.scrollTop / zoom.value, width:Math.min(width.value, el.clientWidth / zoom.value), height:Math.min(height.value, el.clientHeight / zoom.value) })
  }
  async function zoomAt(scale, x, y) {
    const el = canvas.value
    if (!el) return
    x ??= el.clientWidth / 2; y ??= el.clientHeight / 2
    const before = zoom.value, left = zoomScroll(el.scrollLeft,x,before,scale), top = zoomScroll(el.scrollTop,y,before,scale), token = ++revision
    autoFit.value = false; zoom.value = scale
    await nextTick()
    if (token !== revision) return
    el.scrollTo(Math.max(0,left),Math.max(0,top)); sync()
  }
  function wheel(event) {
    if (!event.deltaY) return
    event.preventDefault()
    const rect = canvas.value.getBoundingClientRect()
    zoomAt(wheelScale(zoom.value,event.deltaY,event.deltaMode,canvas.value.clientHeight),event.clientX-rect.left-canvas.value.clientLeft,event.clientY-rect.top-canvas.value.clientTop)
  }
  function navigate(point) {
    const el = canvas.value
    autoFit.value = false
    el.scrollTo(Math.max(0,point.x*zoom.value-el.clientWidth/2),Math.max(0,point.y*zoom.value-el.clientHeight/2)); sync()
  }
  function startPan(event) {
    if (event.pointerType !== 'mouse' || event.button !== 0 || event.target.closest('button')) return
    const el = canvas.value
    const rect = el.getBoundingClientRect()
    if (event.clientX >= rect.left + el.clientLeft + el.clientWidth ||
        event.clientY >= rect.top + el.clientTop + el.clientHeight) return
    el.setPointerCapture(event.pointerId)
    pan = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
    isPanning.value = true
  }
  function movePan(event) {
    if (pan?.pointerId !== event.pointerId) return
    const el = canvas.value
    el.scrollBy(pan.x - event.clientX, pan.y - event.clientY)
    pan.x = event.clientX
    pan.y = event.clientY
  }
  function stopPan(event) {
    if (pan?.pointerId !== event.pointerId) return
    pan = undefined
    isPanning.value = false
  }
  watch([zoom,width,height],async()=>{await nextTick();sync()})
  onMounted(()=>{observer=new ResizeObserver(sync);observer.observe(canvas.value);sync()})
  onScopeDispose(()=>observer?.disconnect())
  return { view, sync, zoomAt, wheel, navigate, isPanning, startPan, movePan, stopPan }
}
