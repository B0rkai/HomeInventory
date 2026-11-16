import { defineConfig } from '@hey-api/openapi-ts'

// Generates src/api from openapi.json, which `npm run generate-api` exports from the server.
export default defineConfig({
  input: 'openapi.json',
  output: 'src/api',
  plugins: [
    // Requests go to the page's own origin (/api/v1/...). Without this the generator
    // takes the input file's name as the base URL: /openapi.json/api/v1/...
    { name: '@hey-api/client-fetch', baseUrl: false },
  ],
})
