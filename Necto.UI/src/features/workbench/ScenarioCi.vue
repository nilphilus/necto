<script setup>
import { computed, ref } from 'vue';
import { createCiBundle, ciCommand, ciSetup } from './ciBundle.js';
const props = defineProps({
  scenario: Object,
  document: Object,
  mappings: Array,
  configuration: Object
});
const dialog = ref(null),
  bodies = ref(false),
  bearer = ref(false),
  writes = ref(false),
  base = ref(''),
  error = ref(''), shell = ref('bash');
const runnerVersion = typeof __NECTO_VERSION__ === 'undefined' ? '0.3.0' : __NECTO_VERSION__
const setup = ciSetup(runnerVersion)
const crossApi = computed(() =>
  props.scenario.steps.some((step) => step.apiId !== 'local')
);
const uploads = computed(() =>
  props.scenario.steps.some(
    (step) =>
      step.binaryAttachmentRequired ||
      step.formFields?.some((row) => row.kind === 'file' && row.enabled)
  )
);
const mutating = computed(() =>
  props.scenario.steps.some(
    (step) => !['GET', 'HEAD', 'OPTIONS'].includes(step.method)
  )
);
const command = computed(() => {
  try {
    return ciCommand(base.value, {
      bearer: bearer.value,
      writes: writes.value, shell: shell.value
    });
  } catch {
    return '';
  }
});
function open() {
  base.value = new URL(
    props.configuration?.apiBaseUrl ?? '/',
    props.configuration?.openApiUrl ?? location.href
  ).href;
  error.value = '';
  dialog.value.showModal();
}
function download() {
  try {
    const bundle = createCiBundle(
      props.scenario,
      props.document,
      props.mappings ?? [],
      bodies.value
    );
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'necto-ci.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (cause) {
    error.value = cause.message;
  }
}
</script>
<template>
  <button type="button" @click="open">Run in CI</button>
  <dialog ref="dialog" aria-label="Run scenario in CI">
    <header>
      <h3>{{ scenario.name }} · CI</h3>
      <button
        type="button"
        aria-label="Close CI instructions"
        @click="dialog.close()"
      >
        ✕
      </button>
    </header>
    <p>
      Download this scenario with its API contract and mappings, then run the
      command from the Necto repository after installing Necto.UI dependencies.
      Nothing runs from this dialog.
    </p>
    <p v-if="crossApi" class="error">
      The current runner supports one local API per run. Split cross-API
      scenarios before exporting.
    </p>
    <p v-if="uploads" class="error">
      This runner cannot attach files. Export a file-free scenario for CI.
    </p>
    <details class="ci-setup"><summary>First run? Get the runner</summary><p>The embedded NuGet UI does not install the CLI. Install Node 22.12+ and Git, enable Corepack, then run this one-time setup. Repository access is required. Runner version {{ runnerVersion }} matches this UI.</p><pre tabindex="0">{{ setup }}</pre><p>Run subsequent commands from the repository root. Place the downloaded necto-ci.json there. Existing checkout? Fetch tags and check out v{{ runnerVersion }} instead of cloning again.</p></details>
    <label>Shell<select v-model="shell" aria-label="Shell"><option value="bash">Bash / zsh</option><option value="powershell">PowerShell</option></select></label>
    <label>API base URL<input v-model="base" type="url" /></label
    ><label
      ><input v-model="bodies" type="checkbox" /> Include request bodies and
      form values</label
    >
    <p>
      Authentication and uploaded files are excluded. The bundle includes API
      descriptions and examples; review it before sharing.
    </p>
    <label
      ><input v-model="bearer" type="checkbox" /> Read Bearer token from
      NECTO_CI_TOKEN</label
    ><label v-if="mutating"
      ><input v-model="writes" type="checkbox" /> Allow this scenario’s write
      requests</label
    >
    <p v-if="mutating && !writes">
      This scenario contains writes; the runner requires explicit
      --allow-writes.
    </p>
    <button
      type="button"
      :disabled="
        crossApi || uploads || (mutating && !writes) || !command || !document
      "
      @click="download"
    >
      Download CI bundle
    </button>
    <pre v-if="command" tabindex="0">{{ command }}</pre>
    <p v-else class="error">
      Enter a valid HTTP(S) base URL without credentials or query parameters.
    </p>
    <p>
      Reports: necto-report.json and necto-report.xml (JUnit). Supply omitted
      bodies before running. File uploads are not supported by this runner.
      Current browser presets and login are not reproduced.
    </p>
    <p v-if="error" role="alert">{{ error }}</p>
  </dialog>
</template>
<style scoped>
dialog {
  width: min(46rem, 94vw);
  max-height: 85dvh;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 0.6rem;
  padding: 1rem;
  background: var(--surface);
  color: var(--text);
}
dialog::backdrop {
  background: #0006;
}
header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
}
label {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
  margin: 0.6rem 0;
}
input[type='url'] {
  width: 100%;
}
p {
  font-size: 0.85rem;
  color: var(--muted);
}
pre {
  padding: 0.7rem;
  background: var(--subtle);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 0.8rem;
}
</style>
