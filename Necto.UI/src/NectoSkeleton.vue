<script setup>
import { onMounted, onUnmounted, ref } from 'vue'

const skeleton = ref(null)
const patrolDuration = ref(null)
const emit = defineEmits(['finish'])
let trackObserver

onMounted(() => {
  const sprite = skeleton.value
  const stamp = sprite.parentElement
  const track = stamp.parentElement

  trackObserver = new ResizeObserver(() => {
    const styles = getComputedStyle(sprite)
    const stepDuration = Number.parseFloat(styles.getPropertyValue('--step-cycle'))
    const endGap = Number.parseFloat(styles.getPropertyValue('--end-gap'))
    const startOverlap = Number.parseFloat(styles.getPropertyValue('--start-overlap'))
    const distance = track.clientWidth - stamp.offsetLeft - stamp.offsetWidth - sprite.offsetWidth - endGap + startOverlap
    // The foot travels about 10px per step. Each direction uses half the cycle.
    const steps = Math.max(1, Math.round(distance / 10))
    patrolDuration.value = (2 * steps * stepDuration) + 's'
  })
  trackObserver.observe(track)
  trackObserver.observe(stamp)
})

onUnmounted(() => trackObserver?.disconnect())
</script>

<template>
  <span ref="skeleton" class="skeleton" :style="{ '--cycle': patrolDuration }" aria-hidden="true" @animationend.self="emit('finish')">
    <span class="skull"><span class="jaw"></span></span>
    <span class="spine"></span>
    <span class="ribs"></span>
    <span class="hips"></span>
    <span class="arm bracing-arm"><span class="forearm"></span></span>
    <span class="arm free-arm"><span class="forearm"></span></span>
    <span class="leg near-leg"><span class="shin"></span></span>
    <span class="leg far-leg"><span class="shin"></span></span>
  </span>
</template>

<style scoped>
.skeleton {
  --ink: #405e54;
  --bone: #f5f1df;
  --bone-shadow: #d9d9bd;
  --cycle: 60s;
  --step-cycle: .46s;
  --sprite-width: 28px;
  --start-overlap: 31px;
  --end-gap: 8px;
  --far-edge: calc(100cqw - var(--stamp-inset) - var(--sprite-width) - var(--end-gap));
  position: absolute;
  bottom: 0;
  left: calc(100% - var(--start-overlap));
  width: var(--sprite-width);
  height: 39px;
  color: var(--ink);
  pointer-events: none;
  transform: rotate(-8deg);
  transform-origin: 50% 95%;
  animation: patrol var(--cycle) linear both, turn var(--cycle) linear infinite;
}
.skeleton > span { position: absolute; }
.skull {
  z-index: 2;
  top: 0;
  left: 6px;
  width: 17px;
  height: 14px;
  border: 1px solid currentColor;
  border-radius: 8px 8px 5px 5px;
  background: var(--bone);
  box-shadow: inset -2px -2px var(--bone-shadow);
  transform: rotate(6deg);
  transform-origin: 50% 90%;
  animation: glance var(--cycle) ease-in-out infinite;
}
.skull::before {
  position: absolute;
  top: 5px;
  left: 3px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 6px 0 currentColor;
  content: '';
  animation: blink var(--cycle) linear infinite;
}
.skull::after {
  position: absolute;
  top: 9px;
  left: 7px;
  width: 2px;
  height: 2px;
  border-radius: 50%;
  background: currentColor;
  content: '';
}
.jaw {
  position: absolute;
  top: 10px;
  left: 3px;
  width: 9px;
  height: 5px;
  border: 1px solid currentColor;
  border-radius: 1px 1px 3px 3px;
  background: repeating-linear-gradient(90deg, var(--bone) 0 2px, var(--bone-shadow) 2px 3px);
}
.spine {
  top: 13px;
  left: 13px;
  width: 3px;
  height: 10px;
  border-radius: 2px;
  background: currentColor;
}
.ribs {
  z-index: 1;
  top: 15px;
  left: 9px;
  width: 11px;
  height: 8px;
  border: 1px solid currentColor;
  border-radius: 4px 4px 5px 5px;
  background: repeating-linear-gradient(var(--bone) 0 1px, var(--ink) 1px 2px);
}
.hips {
  z-index: 1;
  top: 24px;
  left: 10px;
  width: 9px;
  height: 4px;
  border: 1px solid currentColor;
  border-radius: 2px 2px 4px 4px;
  background: var(--bone-shadow);
}
.arm, .leg { width: 3px; transform: rotate(var(--rest)); transform-origin: 50% 1px; }
.arm::before, .leg::before, .forearm, .shin {
  position: absolute;
  width: 3px;
  height: 5px;
  border: 1px solid currentColor;
  border-radius: 2px;
  background: var(--bone);
}
.arm::before, .leg::before { content: ''; }
.arm { top: 15px; height: 12px; }
.bracing-arm {
  z-index: 1;
  left: 9px;
  --rest: 80deg;
  --elbow: 24deg;
  --stride: 24deg;
  animation: stride var(--step-cycle) ease-in-out infinite alternate,
    reach var(--cycle) ease-in-out infinite;
}
.free-arm {
  left: 18px;
  --rest: -13deg;
  --elbow: 36deg;
  --stride: -24deg;
  animation: stride var(--step-cycle) ease-in-out infinite alternate;
}
.forearm, .shin { top: 7px; left: 0; transform-origin: 50% -1px; }
.forearm { transform: rotate(var(--elbow)); }
.leg {
  top: 29px;
  height: 12px;
  animation: stride var(--step-cycle) ease-in-out infinite alternate;
}
.near-leg { left: 11px; --rest: 10deg; --stride: 29deg; }
.far-leg {
  left: 15px;
  --rest: -19deg;
  --stride: -29deg;
  --bone: var(--bone-shadow);
}
.shin { animation: bend-knee var(--step-cycle) ease-in-out infinite alternate; }
.far-leg .shin { animation-direction: alternate-reverse; }
.shin::after {
  position: absolute;
  bottom: -1px;
  left: -1px;
  width: 5px;
  height: 3px;
  border: 1px solid currentColor;
  border-radius: 2px;
  background: var(--bone);
  content: '';
}

@keyframes patrol {
  0%, 100% {
    left: calc(100% - var(--start-overlap));
    clip-path: inset(0 0 calc(100% - 6px));
    translate: 0 1px;
  }
  0.7% { translate: 0 -3px; }
  2%, 98% { clip-path: inset(-4px -4px -4px); translate: 0 0; }
  50% { left: var(--far-edge); }
}
@keyframes turn {
  0% { transform: rotate(-8deg) scaleX(1); }
  .5%, 49.75% { transform: rotate(0deg) scaleX(1); }
  50.25%, 99.5% { transform: rotate(0deg) scaleX(-1); }
  100% { transform: rotate(-8deg) scaleX(1); }
}
@keyframes reach {
  0%, 100% { rotate: calc(var(--rest) - var(--stride)); }
  .5%, 99.5% { rotate: 0deg; }
}
@keyframes stride {
  from { transform: rotate(var(--stride)); }
  to { transform: rotate(calc(-1 * var(--stride))); }
}
@keyframes bend-knee {
  0%, 100% { transform: rotate(0deg); }
  65% { transform: rotate(36deg); }
}
@keyframes glance {
  0%, 36%, 47%, 70%, 100% { transform: rotate(6deg); }
  40%, 43% { transform: rotate(13deg); }
  73%, 92% { transform: rotate(0deg); }
}
@keyframes blink {
  0%, 16%, 17%, 45%, 46%, 85%, 86%, 100% { transform: scaleY(1); }
  16.5%, 45.5%, 85.5% { transform: scaleY(.2); }
}
@media (prefers-reduced-motion: reduce) {
  .skeleton, .skeleton span, .skull::before { animation: none; }
  .skeleton { left: calc(100% - 1px); animation: still 3s; }
}
@keyframes still { from, to { opacity: 1; } }
</style>
