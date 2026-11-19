<script setup>
import { computed, nextTick, ref, useId, watch } from 'vue'
defineOptions({ inheritAttrs: false })
const props = defineProps({ modelValue: { default: '' }, choices: { type: Array, default: () => [] }, dropdown: Boolean, searchableResponse: Boolean })
const emit = defineEmits(['update:modelValue', 'choose', 'search-response'])
const id = useId()
const input = ref(null)
const popup = ref(null)
const open = ref(false)
const query = ref('')
const active = ref(-1)
const optionValue = choice => typeof choice.value === 'object' ? JSON.stringify(choice.value) : String(choice.value)
const options = computed(() => [...new Set(props.choices.map(optionValue))])
const matches = computed(() => options.value.filter(value => value.toLowerCase().includes(query.value.toLowerCase())))
const activeValue = computed(() => matches.value[active.value])
const optionId = index => `${id}-option-${index}`

watch(popup, element => {
  if (element && getComputedStyle(element).position === 'static') {
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }
}, { flush: 'post' })

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
    <div class="value-label">
      <label :for="id"><slot name="label" /></label>
      <slot name="label-actions" />
    </div>
    <div class="control">
      <div class="picker">
        <span class="search-icon" aria-hidden="true"></span>
        <span v-for="value in options" :key="value" class="measure" aria-hidden="true">{{ value }}</span>
        <input v-bind="$attrs" :id="id" ref="input" :value="modelValue" role="combobox" autocomplete="off" spellcheck="false"
          aria-autocomplete="list" :aria-expanded="open" :aria-controls="open ? id + '-list' : undefined"
          :aria-activedescendant="open && activeValue !== undefined ? optionId(active) : undefined"
          @input="search" @click="open = true" @blur="close" @keydown="navigate">
        <button type="button" class="toggle" tabindex="-1" :aria-label="open ? 'Hide suggestions' : 'Show suggestions'"
          @pointerdown.prevent @click="toggle"><span aria-hidden="true">▾</span></button>
      </div>
      <slot name="trailing" />
    </div>
    <div v-if="open" ref="popup" class="popup">
      <ul :id="id + '-list'" role="listbox" aria-label="Suggested values">
        <li v-for="(value, index) in matches" :id="optionId(index)" :key="value" role="option"
          :aria-selected="active === index" @mousedown.prevent @click="select(value)">
          <span>{{ value }}</span>
          <span v-if="value === modelValue" class="check" aria-hidden="true">✓</span>
        </li>
      </ul>
      <p v-if="!matches.length" role="status">No matching suggestions</p>
      <button v-if="!matches.length && query.trim() && searchableResponse" type="button" class="search-response" @pointerdown.prevent @click="emit('search-response', query); close()">Search whole response</button>
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
.value-label { display: flex; align-items: center; gap: .3rem; }
.dropdown { position: relative; display: grid; gap: .25rem; min-width: 0; }
.control { display: flex; min-width: 0; border: 1px solid #a2b2a9; border-radius: .5rem; background: var(--surface); }
.control:focus-within { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
.picker { position: relative; display: grid; flex: 1 1 auto; min-width: 0; }
.picker > input, .measure { grid-area: 1 / 1; padding-inline: 1.9rem 2rem; }
.picker > input { width: 0; min-width: 100%; border: 0; background: transparent; outline: none; }
.measure { visibility: hidden; white-space: nowrap; overflow: hidden; }
.search-icon {
  position: absolute;
  inset: 50% auto auto .7rem;
  width: .6rem;
  height: .6rem;
  transform: translateY(-60%);
  border: 1.5px solid var(--muted);
  border-radius: 50%;
  pointer-events: none;
}
.search-icon::after {
  content: '';
  position: absolute;
  inset: 100% auto auto 100%;
  width: .28rem;
  border-top: 1.5px solid var(--muted);
  transform: rotate(45deg);
  transform-origin: left;
}
.toggle { position: absolute; inset: 1px 1px 1px auto; width: 1.8rem; color: var(--accent); }
.toggle[aria-expanded="true"] span { display: inline-block; transform: rotate(180deg); }
.popup {
  position: var(--value-suggestions-position, absolute);
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
.popup li { display: flex; justify-content: space-between; gap: .5rem; cursor: pointer; white-space: pre-wrap; }
.popup li + li { border-top: 1px solid var(--line); }
.check { color: var(--accent); }
.popup li:hover, .popup li[aria-selected="true"] { background: var(--accent-soft); }
</style>
