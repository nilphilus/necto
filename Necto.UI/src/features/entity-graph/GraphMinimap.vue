<script setup>
import { ref } from 'vue'
const props=defineProps({width:Number,height:Number,nodes:Array,edges:Array,view:Object,selectedId:String})
const emit=defineEmits(['navigate'])
const map=ref(null),dragging=ref(null)
function move(event){
 const svg=map.value,point=new DOMPoint(event.clientX,event.clientY).matrixTransform(svg.getScreenCTM().inverse())
 emit('navigate',{x:Math.max(0,Math.min(props.width,point.x)),y:Math.max(0,Math.min(props.height,point.y))})
}
function start(event){if(event.button!==0)return;dragging.value=event.pointerId;map.value.setPointerCapture(event.pointerId);move(event)}
function finish(){dragging.value=null}
</script>
<template>
 <div class="graph-minimap" role="group" aria-label="Entity graph minimap">
  <span>Overview</span>
  <svg ref="map" :viewBox="`0 0 ${width} ${height}`" preserveAspectRatio="none" role="img" aria-label="Click or drag to navigate the entity graph" @pointerdown.prevent="start" @pointermove="dragging===$event.pointerId&&move($event)" @pointerup="finish" @pointercancel="finish" @lostpointercapture="finish">
   <line v-for="edge in edges" :key="edge.id" :x1="edge.from.x+110" :y1="edge.from.y+38" :x2="edge.to.x+110" :y2="edge.to.y+38" class="map-edge" />
   <rect v-for="node in nodes" :key="node.id" :x="node.x" :y="node.y" width="220" height="76" :class="node.id===selectedId?'map-selected':'map-node'" />
   <rect :x="view.x" :y="view.y" :width="view.width" :height="view.height" class="map-viewport" />
  </svg>
 </div>
</template>
<style scoped>
.graph-minimap { position:absolute; right:.65rem; bottom:.65rem; width:clamp(110px,22%,190px); padding:.35rem; border:1px solid var(--line); border-radius:.45rem; background:var(--surface); box-shadow:0 2px 10px #17342620; }.graph-minimap span { display:block; font-size:.6rem; color:var(--muted); margin-bottom:.25rem; }.graph-minimap svg { width:100%; height:100px; display:block; cursor:crosshair; touch-action:none; }.map-edge { stroke:#99b1a3; stroke-width:1; vector-effect:non-scaling-stroke; }.map-node { fill:#a5bdae; }.map-selected { fill:var(--accent); }.map-viewport { fill:#26745220; stroke:var(--accent); stroke-width:1.5; vector-effect:non-scaling-stroke; pointer-events:none; }
</style>
