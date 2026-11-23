<script setup>
defineProps({ message: String, canLocate: Boolean, inDialog: Boolean })
defineEmits(['locate', 'dismiss'])
</script>

<template>
  <div class="builder-error-notice" :class="{ 'in-dialog': inDialog }">
    <p role="alert" class="error">{{ message }}</p>
    <div class="notice-actions">
      <button v-if="canLocate" type="button" class="secondary" @click="$emit('locate')">Go to step</button>
      <button type="button" class="secondary" aria-label="Dismiss error" @click="$emit('dismiss')">Dismiss</button>
    </div>
  </div>
</template>

<style scoped>
.builder-error-notice {
  position: fixed;
  z-index: 12;
  inset: auto 1rem 1rem auto;
  box-sizing: border-box;
  width: min(28rem, calc(100vw - 2rem));
  padding: .65rem .8rem;
  border: 1px solid var(--line);
  border-radius: .5rem;
  background: var(--surface);
  box-shadow: 0 5px 18px #203b2830;
  font-size: .8rem;
}
.builder-error-notice.in-dialog {
  position: absolute;
  inset: auto .75rem 4.5rem auto;
  max-width: calc(100% - 1.5rem);
}
.builder-error-notice p {
  margin: 0 0 .4rem;
  max-height: min(8rem, 25dvh);
  overflow: auto;
  overflow-wrap: anywhere;
}
.notice-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: .35rem;
}
</style>
