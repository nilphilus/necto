import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  define: { __NECTO_VERSION__: JSON.stringify(readFileSync(new URL('../Necto/Necto.csproj', import.meta.url), 'utf8').match(/<Version>([^<]+)<\/Version>/)[1]) },
  base: './',
  plugins: [vue()],
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
})
