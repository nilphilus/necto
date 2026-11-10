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
      '/openapi': 'http://localhost:5087',
    },
  },
})
