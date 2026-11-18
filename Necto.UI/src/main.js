import { createApp } from 'vue'
import App from './App.vue'

if (import.meta.env.MODE === 'live-demo') {
  import('./demo/install.js').then(({ installDemo }) => installDemo())
    .then(() => createApp(App).mount('#app'))
    .catch(() => {
      const app = document.querySelector('#app')
      app.setAttribute('role', 'alert')
      app.textContent = 'The live demo could not load. Refresh to try again.'
    })
} else if (location.pathname === new URL('./oauth-callback', document.baseURI).pathname) {
  const query = new URLSearchParams(location.search)
  const message = { source: 'necto-oauth', code: query.get('code'), state: query.get('state'), error: query.get('error') }
  history.replaceState(null, '', location.pathname)
  document.body.textContent = 'Sign-in received. You can close this window and return to Necto.'
  window.opener?.postMessage(message, location.origin)
} else createApp(App).mount('#app')
