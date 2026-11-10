import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: './',
  plugins: [vue()],
  server: {
    proxy: {
      '/configuration': {
        target: 'http://localhost:5087',
        rewrite: path => '/necto' + path,
      },
      '/openapi': {
        target: 'http://localhost:5087',
        // ASP.NET Core uses the request host for the generated OpenAPI server URL.
        changeOrigin: false,
      },
      '/necto/endpoint-mappings': 'http://localhost:5087',
      '/invoices': 'http://localhost:5087',
      '/customers': 'http://localhost:5087',
      '/weatherforecast': 'http://localhost:5087',
    },
  },
})
