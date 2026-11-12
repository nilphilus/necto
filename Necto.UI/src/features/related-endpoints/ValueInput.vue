<script setup>
import { computed, nextTick, ref, useId } from 'vue'
defineOptions({ inheritAttrs: false })
const props = defineProps({ modelValue: { default: '' }, choices: { type: Array, default: () => [] }, dropdown: Boolean })
const emit = defineEmits(['update:modelValue', 'choose'])
const id = useId()
const input = ref(null)
const open = ref(false)
const query = ref('')
const active = ref(-1)
const optionValue = choice => typeof choice.value === 'object' ? JSON.stringify(choice.value) : String(choice.value)
const options = computed(() => [...new Set(props.choices.map(optionValue))])
const matches = computed(() => options.value.filter(value => value.toLowerCase().includes(query.value.toLowerCase())))
const activeValue = computed(() => matches.value[active.value])
const optionId = index => `${id}-option-${index}`

function update(value) {
  emit('update:modelValue', value)
  const choice = props.choices.find(choice => optionValue(choice) === value)
  if (choice) emit('choose', choice)
}

function search(event) {
  query.value = event.target.value
  active.value = -1
  open.value = true
  update(query.value)
}

function close() {
  open.value = false
  query.value = ''
  active.value = -1
}

function toggle() {
  input.value.focus()
  if (open.value) close()
  else open.value = true
}

function select(value) {
  update(value)
  close()
}

async function navigate(event) {
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    open.value = true
    if (!matches.value.length) return
    const last = matches.value.length - 1
    active.value = event.key === 'ArrowDown'
      ? Math.min(active.value + 1, last)
      : active.value < 0 ? last : Math.max(active.value - 1, 0)
    await nextTick()
    document.getElementById(optionId(active.value))?.scrollIntoView({ block: 'nearest' })
  } else if (event.key === 'Enter' && open.value) {
    event.preventDefault()
    if (activeValue.value !== undefined) select(activeValue.value)
  } else if (event.key === 'Escape' && open.value) {
    event.preventDefault()
    event.stopPropagation()
    close()
  }
}
</script>

<template>
  <div v-if="dropdown" class="dropdown">
    <label :for="id"><slot name="label" /></label>
    <div class="control">
      <span v-for="value in options" :key="value" class="measure" aria-hidden="true">{{ value }}</span>
      <input v-bind="$attrs" :id="id" ref="input" :value="modelValue" role="combobox" autocomplete="off" spellcheck="false"
        aria-autocomplete="list" :aria-expanded="open" :aria-controls="open ? id + '-list' : undefined"
        :aria-activedescendant="open && activeValue !== undefined ? optionId(active) : undefined"
        @input="search" @click="open = true" @blur="close" @keydown="navigate">
      <button type="button" class="toggle" tabindex="-1" :aria-label="open ? 'Hide suggestions' : 'Show suggestions'"
        @pointerdown.prevent @click="toggle"><span aria-hidden="true">▾</span></button>
      <div v-if="open" class="popup">
        <ul :id="id + '-list'" role="listbox" aria-label="Suggested values">
          <li v-for="(value, index) in matches" :id="optionId(index)" :key="value" role="option"
            :aria-selected="active === index" @mousedown.prevent @click="select(value)">{{ value }}</li>
        </ul>
        <p v-if="!matches.length" role="status">No matching suggestions</p>
      </div>
    </div>
  </div>
  <template v-else>
    <input v-bind="$attrs" :value="modelValue" :list="options.length ? id : undefined" autocomplete="off" spellcheck="false"
      @input="update($event.target.value)">
    <datalist v-if="options.length" :id="id">
      <option v-for="value in options" :key="value" :value="value" />
    </datalist>
  </template>
</template>

<style scoped>
.dropdown { display: grid; gap: .25rem; min-width: 0; }
.control { position: relative; display: grid; min-width: 0; }
.control > input, .measure { grid-area: 1 / 1; }
.control > input { width: 0; min-width: 100%; padding-right: 2rem; }
.measure { visibility: hidden; white-space: nowrap; padding-inline: .65rem 2.05rem; overflow: hidden; }
.toggle { position: absolute; inset: 1px 1px 1px auto; width: 1.8rem; color: var(--accent); }
.popup {
  position: absolute;
  z-index: 2;
  inset: calc(100% + .2rem) 0 auto;
  max-height: 14rem;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: .4rem;
  background: var(--surface);
  box-shadow: 0 .3rem .8rem #18242022;
}
.popup ul { margin: 0; padding: 0; list-style: none; }
.popup li, .popup p { padding: .4rem .6rem; margin: 0; overflow-wrap: anywhere; }
.popup li { cursor: pointer; white-space: pre-wrap; }
.popup li:hover, .popup li[aria-selected="true"] { background: var(--accent-soft); }
</style>
