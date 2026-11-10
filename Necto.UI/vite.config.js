import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
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
