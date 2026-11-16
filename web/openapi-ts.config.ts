import { defineConfig } from '@hey-api/openapi-ts'

// Generates src/api from openapi.json, which `npm run generate-api` exports from the server.
export default defineConfig({
  input: 'openapi.json',
  output: 'src/api',
  plugins: ['@hey-api/client-fetch'],
})
