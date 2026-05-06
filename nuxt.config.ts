export default defineNuxtConfig({
  ssr: false,
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  vite: {
    worker: {
      format: 'es',
    },
    server: {
      watch: {
        ignored: [
          '**/.hf-cache/**',
          '**/.venv/**',
          '**/resources/benchmarks/**',
        ],
      },
    },
  },
  colorMode: {
    preference: 'light',
    fallback: 'light',
  },
  devtools: {
    enabled: false,
  },
  app: {
    baseURL: process.env.NUXT_APP_BASE_URL || '/job-desc/',
    head: {
      htmlAttrs: {
        class: 'light',
        'data-color-mode-forced': 'light',
      },
      title: 'Job Classification Assistant',
      meta: [
        {
          name: 'description',
          content:
            'A static two-step job classification prototype using local in-browser Transformers.js inference.',
        },
      ],
    },
  },
  nitro: {
    preset: 'static',
  },
  runtimeConfig: {
    public: {
      appName: 'Job Classification Assistant',
      selectedModel: 'Xenova/bge-small-en-v1.5',
      generationModel: 'onnx-community/gemma-3-270m-it-ONNX',
      allowRemoteModels: true,
      localModelPath: '/models/',
    },
  },
  compatibilityDate: '2026-05-05',
})
