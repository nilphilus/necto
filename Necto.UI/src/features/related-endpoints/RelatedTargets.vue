<script setup>
import { computed } from 'vue'

const props = defineProps({
  targets: { type: Array, required: true },
  canSend: { type: Function, required: true },
})
defineEmits(['follow'])

const rows = computed(() => props.targets.map(({ operation, candidates }) => ({
  operation,
  candidates,
  choice: candidates.length === 1 ? candidates[0] : null,
  quickChoices: candidates.filter(choice => props.canSend(operation, choice)).slice(0, 3),
})))
</script>

<template>
  <section v-if="targets.length" class="related-targets" aria-label="Continue from this response">
    <h4>Continue from this response</h4>
    <ul>
      <li v-for="target in rows" :key="target.operation.key">
        <div class="destination">
          <div class="destination-title">
            <span class="method" :data-method="target.operation.method">{{ target.operation.method }}</span>
            <strong>{{ target.operation.name }}</strong>
          </div>
          <code v-if="target.choice" :title="JSON.stringify(target.choice.value)">
            {{ target.choice.name ?? 'body' }} = {{ JSON.stringify(target.choice.value) }}
          </code>
          <small v-else-if="target.candidates.length">
            {{ target.candidates.length }} values for {{ target.candidates[0].name ?? 'body' }}
          </small>
          <small v-else>Choose values in the request</small>
        </div>
        <div class="actions">
          <button
            type="button"
            :class="target.quickChoices.length ? 'quiet' : 'secondary'"
            :aria-label="(target.choice ? 'Edit ' : 'Open ') + target.operation.name"
            @click="$emit('follow', target.operation, target.choice, false)"
          >{{ target.choice ? 'Edit' : 'Open' }}</button>
          <button
            v-for="choice in target.quickChoices"
            :key="JSON.stringify(choice.value)"
            type="button"
            class="secondary run-next"
            :aria-label="'Send ' + target.operation.name + ' with ' + choice.name + ' = ' + JSON.stringify(choice.value)"
            @click="$emit('follow', target.operation, choice, true)"
          >
            Send <code v-if="!target.choice">{{ JSON.stringify(choice.value) }}</code>
            <span aria-hidden="true">↗</span>
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.related-targets { padding: .75rem; border: 1px solid var(--line); border-radius: .65rem; background: var(--surface); }
h4 { margin: 0 0 .45rem; color: var(--muted); font-size: .72rem; letter-spacing: .05em; text-transform: uppercase; }
ul { list-style: none; padding: 0; margin: 0; }
li { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .45rem .75rem; padding: .5rem 0; }
li + li { border-top: 1px solid var(--line); }
li:last-child { padding-bottom: 0; }
.destination { min-width: 0; flex: 1 1 11rem; }
.destination-title { display: flex; align-items: center; gap: .4rem; font-size: .87rem; }
.destination code, .destination small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: .18rem;
  color: var(--muted);
  font-size: .76rem;
}
.actions { display: flex; flex-wrap: wrap; align-items: center; gap: .25rem; min-width: 0; }
.actions button { padding: .3rem .5rem; font-size: .8rem; font-weight: 650; white-space: nowrap; }
.quiet, .run-next { color: var(--accent); }
.run-next code { display: inline-block; max-width: 7rem; overflow: hidden; text-overflow: ellipsis; vertical-align: bottom; }
</style>
