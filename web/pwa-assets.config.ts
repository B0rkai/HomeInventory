import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Regenerate the icons in public/ after changing icon.svg: npx pwa-assets-generator
const background = { resizeOptions: { background: '#2f6b4f' } }

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, ...background },
    apple: { ...minimal2023Preset.apple, ...background },
  },
  images: ['public/icon.svg'],
})
