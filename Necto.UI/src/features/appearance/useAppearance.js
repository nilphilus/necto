import { reactive, watch } from 'vue'

const storageKey = 'necto:appearance'
const themes = ['light', 'dark', 'system']
const responseViews = ['auto', 'preview', 'raw']
const defaults = { theme: 'light', pinNextRequests: true, nextRequestWidth: 272 }

function readWidth(value, min, max, fallback) {
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback
}

export function useAppearance() {
  let saved, legacyCatalogWidth
  try {
    saved = JSON.parse(localStorage.getItem(storageKey))
    legacyCatalogWidth = Number(localStorage.getItem('necto:catalog-width'))
  } catch { /* Settings remain usable without storage. */ }
  const appearance = reactive({
    theme: themes.includes(saved?.theme) ? saved.theme : defaults.theme,
    pinNextRequests: typeof saved?.pinNextRequests === 'boolean' ? saved.pinNextRequests : defaults.pinNextRequests,
    hideDeprecated: saved?.hideDeprecated === true,
    showPaths: saved?.showPaths === true,
    compactCatalog: saved?.compactCatalog === true,
    responseView: responseViews.includes(saved?.responseView) ? saved.responseView : 'auto',
    catalogWidth: readWidth(saved?.catalogWidth, 180, 360, readWidth(legacyCatalogWidth, 180, 360, 240)),
    nextRequestWidth: readWidth(saved?.nextRequestWidth, 192, 384, defaults.nextRequestWidth),
  })

  watch(() => appearance.theme, theme => {
    window.document.documentElement.dataset.nectoTheme = theme
  }, { immediate: true })
  watch(appearance, value => {
    try { localStorage.setItem(storageKey, JSON.stringify(value)) } catch { /* Apply for this session. */ }
  })

  return appearance
}
