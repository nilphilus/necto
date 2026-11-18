<script setup>
import { latestScenarioSkill, scenarioSkillDestination, scenarioSkillRelease } from './scenarioSkillLink.js'

const props = defineProps({ version: String })
async function openSkill(event) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey ||
      event.ctrlKey || event.shiftKey || event.altKey) return
  const release = scenarioSkillRelease(props.version)
  if (!release) return

  const tab = window.open('about:blank', '_blank')
  if (!tab) return
  event.preventDefault()
  tab.opener = null
  const referrer = tab.document.createElement('meta')
  referrer.name = 'referrer'
  referrer.content = 'no-referrer'
  tab.document.head.append(referrer)
  const destination = await scenarioSkillDestination(release)
  if (!tab.closed) tab.location.replace(destination)
}
</script>

<template>
  <a :href="latestScenarioSkill" target="_blank" rel="noopener noreferrer" @click="openSkill">Get the Necto skill</a>
</template>
