import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

let runnerRevision = ''
try {
  const cwd = new URL('..', import.meta.url)
  const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=normal', '--', 'Necto.UI/src', 'tools', 'Necto.UI/vite.config.js', 'Necto/Necto.csproj'], {cwd, encoding:'utf8'}).trim()
  if (!dirty) runnerRevision = execFileSync('git', ['rev-parse', 'HEAD'], {cwd, encoding:'utf8'}).trim()
} catch { /* Source archives and modified checkouts use their local runner. */ }

export default defineConfig(({ mode }) => ({
  define: { __NECTO_REVISION__: JSON.stringify(runnerRevision), __NECTO_VERSION__: JSON.stringify(readFileSync(new URL('../Necto/Necto.csproj', import.meta.url), 'utf8').match(/<Version>([^<]+)<\/Version>/)[1]) },
  base: './',
  plugins: [
    vue(),
    ...(mode === 'live-demo' ? [{
      name: 'demo-relative-base',
      transformIndexHtml: (html) => html.replace('<base href="/">', '<base href="./">'),
    }] : []),
  ],
  server: {
    proxy: {
      '/configuration': {
        target: 'http://localhost:5000',
        rewrite: path => '/necto' + path,
      },
      '/openapi': {
        target: 'http://localhost:5000',
        // ASP.NET Core uses the request host for the generated OpenAPI server URL.
        changeOrigin: false,
      },
      '/necto/endpoint-mappings': 'http://localhost:5000',
      '/invoices': 'http://localhost:5000',
      '/customers': 'http://localhost:5000',
      '/weatherforecast': 'http://localhost:5000',
    },
  },
}))
