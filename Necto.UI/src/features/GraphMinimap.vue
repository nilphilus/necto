<script setup>
import { ref } from 'vue'
const props=defineProps({width:Number,height:Number,nodes:Array,edges:Array,view:Object,selectedId:String,label:{type:String,default:'Entity graph minimap'},nodeSize:{type:Object,default:()=>({width:220,height:76})}})
const emit=defineEmits(['navigate'])
const map=ref(null),dragging=ref(null)
function move(event){
 const svg=map.value,point=new DOMPoint(event.clientX,event.clientY).matrixTransform(svg.getScreenCTM().inverse())
 emit('navigate',{x:Math.max(0,Math.min(props.width,point.x)),y:Math.max(0,Math.min(props.height,point.y))})
}
function start(event){if(event.button!==0)return;dragging.value=event.pointerId;map.value.setPointerCapture(event.pointerId);move(event)}
function finish(){dragging.value=null}
function keyboard(event){
 const shifts={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}
 if(!shifts[event.key]&&!['Home','End'].includes(event.key))return
 event.preventDefault()
 const shift=shifts[event.key]
 emit('navigate',event.key==='Home'?{x:0,y:0}:event.key==='End'?{x:props.width,y:props.height}:{x:props.view.x+props.view.width/2+shift[0]*props.view.width/4,y:props.view.y+props.view.height/2+shift[1]*props.view.height/4})
}
</script>
<template>
 <div class="graph-minimap" role="group" :aria-label="label">
  <span>Overview</span>
  <svg ref="map" :viewBox="`0 0 ${width} ${height}`" preserveAspectRatio="none" role="group" tabindex="0" :aria-label="label+' navigation. Click, drag, or use arrow keys; Home and End reach the edges.'" @keydown="keyboard" @pointerdown.prevent="start" @pointermove="dragging===$event.pointerId&&move($event)" @pointerup="finish" @pointercancel="finish" @lostpointercapture="finish">
   <line v-for="edge in edges" :key="edge.id" :x1="edge.from.x+nodeSize.width/2" :y1="edge.from.y+nodeSize.height/2" :x2="edge.to.x+nodeSize.width/2" :y2="edge.to.y+nodeSize.height/2" class="map-edge" />
   <rect v-for="node in nodes" :key="node.id" :x="node.x" :y="node.y" :width="nodeSize.width" :height="nodeSize.height" :class="node.id===selectedId?'map-selected':'map-node'" />
   <rect :x="view.x" :y="view.y" :width="view.width" :height="view.height" class="map-viewport" />
  </svg>
 </div>
</template>
<style scoped>
.graph-minimap { position:absolute; right:.65rem; bottom:.65rem; width:clamp(110px,22%,190px); padding:.35rem; border:1px solid var(--line); border-radius:.45rem; background:var(--surface); box-shadow:0 2px 10px #17342620; }.graph-minimap span { display:block; font-size:.6rem; color:var(--muted); margin-bottom:.25rem; }.graph-minimap svg { width:100%; height:100px; display:block; cursor:crosshair; touch-action:none; }.graph-minimap svg:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }.map-edge { stroke:#99b1a3; stroke-width:1; vector-effect:non-scaling-stroke; }.map-node { fill:#a5bdae; }.map-selected { fill:var(--accent); }.map-viewport { fill:#26745220; stroke:var(--accent); stroke-width:1.5; vector-effect:non-scaling-stroke; pointer-events:none; }
</style>
