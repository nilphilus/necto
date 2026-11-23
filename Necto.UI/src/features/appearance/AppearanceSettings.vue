<script setup>
defineProps({ appearance: { type: Object, required: true } })
</script>

<template>
  <section class="appearance-settings" aria-labelledby="appearance-title">
    <h3 id="appearance-title">Appearance</h3>
    <fieldset>
      <legend>Theme</legend>
      <label>Color theme
        <select v-model="appearance.theme">
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="system">System</option>
        </select>
      </label>
    </fieldset>
    <fieldset>
      <legend>API workspace</legend>
      <label><input v-model="appearance.pinNextRequests" type="checkbox"> Pin Next request by default</label>
      <label><input v-model="appearance.hideDeprecated" type="checkbox"> Hide deprecated endpoints</label>
      <label><input v-model="appearance.showPaths" type="checkbox"> Show endpoint paths instead of names</label>
      <label><input v-model="appearance.compactCatalog" type="checkbox"> Compact endpoint list</label>
      <label>Default response view
        <select v-model="appearance.responseView">
          <option value="auto">Automatic</option>
          <option value="preview">Formatted preview</option>
          <option value="raw">Raw</option>
        </select>
      </label>
    </fieldset>
    <fieldset>
      <legend>Panel widths on desktop</legend>
      <label for="appearance-catalog-width">Endpoint catalog <output>{{ appearance.catalogWidth }} px</output></label>
      <input id="appearance-catalog-width" v-model.number="appearance.catalogWidth" type="range" min="180" max="360">
      <label for="appearance-next-request-width">Pinned Next request <output>{{ appearance.nextRequestWidth }} px</output></label>
      <input id="appearance-next-request-width" v-model.number="appearance.nextRequestWidth" type="range" min="192" max="384">
    </fieldset>
  </section>
</template>

<style scoped>
.appearance-settings { display: grid; gap: .75rem; }
h3 { margin: 0; font-size: 1rem; }
fieldset { display: grid; gap: .55rem; margin: 0; padding: .65rem; border: 1px solid var(--line); border-radius: .45rem; }
input[type="range"] { width: min(100%, 16rem); margin: 0; }
output { color: var(--muted); }
legend, label { font-size: .83rem; }
label { display: flex; align-items: center; flex-wrap: wrap; gap: .45rem; }
</style>
