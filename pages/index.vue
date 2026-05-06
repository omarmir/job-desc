<script setup lang="ts">
import { detectBrowserInferenceCapabilities } from '~/lib/browser-capabilities'
import benchmarkSummary from '~/resources/model_benchmarks.json'
import { DEFAULT_GENERATION_MODEL_ID, GENERATION_MODEL_CANDIDATES } from '~/lib/generation-model-candidates'
import { buildJobDescriptionDocx } from '~/lib/docx-template'
import { createEmptySections } from '~/lib/job-description-template'
import type { RankedMatch } from '~/lib/types'

type ReadonlyRankedMatch = Omit<Readonly<RankedMatch>, 'why' | 'levels'> & {
  readonly why: readonly string[]
  readonly levels: readonly string[]
}

useSeoMeta({
  title: 'Job Classification Assistant',
  description:
    'Static two-step job classification and job description prototype for GitHub Pages using Nuxt, Nuxt UI, and local Transformers.js inference.',
})

const runtimeConfig = useRuntimeConfig()
const { state, preloadModel, analyzeRole } = useJobMatcher()
const {
  selectedModel,
  state: generationState,
  setSelectedModel,
  preloadModel: preloadGenerationModel,
  generateDraft,
} = useJobDescriptionGenerator()

const SAMPLE_ROLE = {
  jobTitle: 'Economic Analyst',
  duties:
    'Conducts economic and statistical analysis to support grants, tax, and regulatory policy. Builds datasets and dashboards, prepares briefing notes and deck material, models costs and benefits of policy options, reviews stakeholder submissions, and drafts recommendations for senior management. No direct reports.',
  generationContext:
    'Branch supports labour-market and affordability policy. Position contributes to Treasury Board and cabinet-style briefing material and provides analytical advice to directors and executives.',
} as const
const LEGACY_DEFAULT_GENERATION_MODEL_ID = 'onnx-community/Qwen2.5-0.5B-Instruct'

const formState = reactive({
  jobTitle: SAMPLE_ROLE.jobTitle,
  duties: SAMPLE_ROLE.duties,
  generationContext: SAMPLE_ROLE.generationContext,
})

const validationError = ref('')
const selectedMatch = ref<RankedMatch | null>(null)
const browserInferenceNote = ref('')
const webGpuReady = ref(false)
const downloadError = ref('')

const selectedBenchmark = computed(() =>
  benchmarkSummary.results.find((result) => result.selected) ?? benchmarkSummary.results[0],
)

const retrievalBadge = computed(() => {
  if (state.progress.stage === 'ready') {
    return { color: 'success' as const, label: 'Ready' }
  }

  if (state.progress.stage === 'error') {
    return { color: 'error' as const, label: 'Error' }
  }

  if (state.progress.stage === 'indexing') {
    return { color: 'warning' as const, label: 'Indexing' }
  }

  if (state.progress.stage === 'loading') {
    return { color: 'warning' as const, label: 'Loading' }
  }

  return { color: 'warning' as const, label: 'Pending' }
})

const selectedGenerationModelConfig = computed(() =>
  GENERATION_MODEL_CANDIDATES.find((candidate) => candidate.id === selectedModel.value),
)

const selectedGenerationModelSupported = computed(() => {
  const candidate = selectedGenerationModelConfig.value
  if (!candidate) {
    return false
  }

  return candidate.browserSupport === 'either' || webGpuReady.value
})

function confidence(score: number) {
  return `${Math.round(score * 100)}%`
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 MB'
  const mb = bytes / (1024 * 1024)
  if (mb < 1024) {
    return `${mb.toFixed(1)} MB`
  }

  return `${(mb / 1024).toFixed(2)} GB`
}

function onGenerationModelChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  setSelectedModel(value)
}

function formatDuration(value: number) {
  if (!value) return 'n/a'
  if (value < 1000) return `${value} ms`
  return `${(value / 1000).toFixed(1)} s`
}

function canUseGenerationModel(modelId: string) {
  const candidate = GENERATION_MODEL_CANDIDATES.find((item) => item.id === modelId)
  if (!candidate) {
    return false
  }

  return candidate.browserSupport === 'either' || webGpuReady.value
}

async function onSubmit() {
  validationError.value = ''

  if (!formState.jobTitle.trim()) {
    validationError.value = 'Job title is required.'
    return
  }

  await analyzeRole(formState.jobTitle, formState.duties)
  selectedMatch.value = null
}

function chooseMatch(match: ReadonlyRankedMatch) {
  selectedMatch.value = {
    ...match,
    why: [...match.why],
    levels: [...match.levels],
  }
}

function loadSample() {
  formState.jobTitle = SAMPLE_ROLE.jobTitle
  formState.duties = SAMPLE_ROLE.duties
  formState.generationContext = SAMPLE_ROLE.generationContext
  validationError.value = ''
  selectedMatch.value = null
}

async function onGenerateDraft() {
  if (!selectedMatch.value) {
    return
  }

  await generateDraft({
    jobTitle: formState.jobTitle,
    duties: formState.duties,
    selectedCode: selectedMatch.value.code,
    selectedTitle: selectedMatch.value.title,
    selectedLevel: selectedMatch.value.selectedLevel,
    fullClassification: selectedMatch.value.fullClassification,
    levelEvidence: selectedMatch.value.levelEvidence,
    levels: selectedMatch.value.levels,
    plan: selectedMatch.value.plan,
    source: selectedMatch.value.source,
    context: formState.generationContext,
  })
}

async function onDownloadDocx() {
  if (!selectedMatch.value || !generationState.html) {
    return
  }

  downloadError.value = ''

  try {
    const blob = await buildJobDescriptionDocx(
      {
        jobTitle: formState.jobTitle,
        duties: formState.duties,
        selectedCode: selectedMatch.value.code,
        selectedTitle: selectedMatch.value.title,
        selectedLevel: selectedMatch.value.selectedLevel,
        fullClassification: selectedMatch.value.fullClassification,
        levelEvidence: selectedMatch.value.levelEvidence,
        levels: selectedMatch.value.levels,
        plan: selectedMatch.value.plan,
        source: selectedMatch.value.source,
        context: formState.generationContext,
      },
      { ...createEmptySections(), ...generationState.sections },
    )
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${formState.jobTitle.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'job-description'}.docx`
    link.click()
    URL.revokeObjectURL(url)
  } catch (error) {
    downloadError.value = error instanceof Error ? error.message : 'Unable to create Word document'
  }
}

onMounted(async () => {
  preloadModel()

  const stored = window.localStorage.getItem('job-desc:generation-model')
  if (
    stored &&
    stored !== LEGACY_DEFAULT_GENERATION_MODEL_ID &&
    GENERATION_MODEL_CANDIDATES.some((candidate) => candidate.id === stored)
  ) {
    setSelectedModel(stored)
  } else {
    setSelectedModel(runtimeConfig.public.generationModel || DEFAULT_GENERATION_MODEL_ID)
  }

  const capabilities = await detectBrowserInferenceCapabilities()
  webGpuReady.value = capabilities.webGpuSupported
  browserInferenceNote.value = capabilities.note || ''
  preloadGenerationModel()
})

watch(selectedModel, (value) => {
  if (import.meta.client) {
    window.localStorage.setItem('job-desc:generation-model', value)
    preloadGenerationModel()
  }
})
</script>

<template>
  <div class="min-h-screen bg-slate-100 text-slate-900">
    <header class="border-t-[14px] border-blue-800 bg-white">
      <div class="border-b border-slate-300">
        <div class="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-7 sm:px-6 lg:px-8">
          <div class="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div class="max-w-3xl">
              <p class="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">
                Prototype · Local Inference
              </p>
              <h1 class="mt-2 text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
                {{ runtimeConfig.public.appName }}
              </h1>
              <p class="mt-4 max-w-3xl text-base leading-7 text-slate-700">
                Screen a job title and optional duties against the JES index, then draft a
                template-aligned job description using a browser-based local model.
              </p>
              <div class="mt-5 flex flex-wrap gap-3">
                <NuxtLink
                  to="/benchmarks"
                  class="inline-flex items-center border border-blue-800 bg-white px-4 py-2 text-sm font-semibold text-blue-900 hover:bg-blue-50"
                >
                  How it works and benchmarks
                </NuxtLink>
              </div>
            </div>
            <div class="max-w-sm border-l-4 border-blue-800 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-700">
              <p class="font-semibold text-slate-950">Hosting target</p>
              <p>Static Nuxt SPA for GitHub Pages</p>
              <p class="mt-3 font-semibold text-slate-950">Operating mode</p>
              <p>Step 1 ranks classifications. Step 2 generates a draft after the user selects one match.</p>
            </div>
          </div>
        </div>
      </div>
      <div class="border-b border-slate-300 bg-slate-50">
        <div class="mx-auto grid max-w-6xl gap-4 px-4 py-4 sm:px-6 md:grid-cols-3 lg:px-8">
          <div class="border-l-4 border-blue-800 bg-white px-4 py-3">
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Step 1</p>
            <p class="mt-1 text-sm font-semibold text-slate-950">Classification screening</p>
          </div>
          <div class="border-l-4 border-slate-400 bg-white px-4 py-3">
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Step 2</p>
            <p class="mt-1 text-sm font-semibold text-slate-950">Job description drafting</p>
          </div>
          <div class="border-l-4 border-amber-500 bg-white px-4 py-3">
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Execution</p>
            <p class="mt-1 text-sm font-semibold text-slate-950">Browser models with visible download progress</p>
          </div>
        </div>
      </div>
    </header>

    <main class="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,2fr)_minmax(370px,1fr)] lg:px-8">
      <section class="space-y-8">
        <div class="border border-slate-400 bg-white">
          <div class="border-b border-slate-300 bg-slate-50 px-6 py-5">
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Step 1
                </p>
                <h2 class="mt-1 text-2xl font-semibold text-slate-950">
                  Assess The Role
                </h2>
              </div>
              <UBadge color="primary" variant="subtle" size="lg">
                Local model
              </UBadge>
            </div>
          </div>

          <div class="px-6 py-6">
            <UForm :state="formState" class="space-y-6" @submit.prevent="onSubmit">
              <UFormField label="Job title" required>
                <UInput
                  v-model="formState.jobTitle"
                  size="xl"
                  variant="outline"
                  placeholder="Economic Analyst"
                  :ui="{
                    base: 'bg-white text-slate-950 placeholder:text-slate-500 ring-slate-400 focus:ring-blue-800',
                  }"
                />
              </UFormField>

              <UFormField label="Optional duties" class="w-full">
                <UTextarea
                  v-model="formState.duties"
                  class="w-full"
                  :rows="10"
                  autoresize
                  variant="outline"
                  placeholder="Summarize the main duties, domain, programs, regulatory scope, advisory work, supervision, or deliverables."
                  :ui="{
                    base: 'min-h-56 w-full bg-white text-slate-950 placeholder:text-slate-500 ring-slate-400 focus:ring-blue-800',
                  }"
                />
              </UFormField>

              <div
                v-if="validationError || state.error"
                class="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
              >
                {{ validationError || state.error }}
              </div>

              <div class="flex flex-wrap items-center gap-3">
                <UButton
                  type="submit"
                  color="primary"
                  size="xl"
                  :loading="state.loading"
                >
                  Analyze role
                </UButton>
                <UButton
                  type="button"
                  color="neutral"
                  variant="outline"
                  size="xl"
                  @click="loadSample"
                >
                  Load sample
                </UButton>
                <p class="text-sm text-slate-600">
                  A sample is preloaded. You can change it or just hit analyze.
                </p>
              </div>

              <div
                v-if="browserInferenceNote"
                class="border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950"
              >
                {{ browserInferenceNote }} Step 1 will still run, but without WebGPU it may take longer. Step 2 browser generation models are WebGPU-only.
              </div>
            </UForm>
          </div>
        </div>

        <div class="border border-slate-400 bg-white">
          <div class="border-b border-slate-300 bg-slate-50 px-6 py-5">
            <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Output
                </p>
                <h2 class="mt-1 text-2xl font-semibold text-slate-950">
                  Candidate Matches
                </h2>
              </div>
              <p v-if="state.lastDurationMs" class="text-sm text-slate-600">
                Last run: {{ state.lastDurationMs }} ms
              </p>
            </div>
          </div>

          <div v-if="!state.matches.length" class="bg-white px-6 py-8 text-sm leading-6 text-slate-700">
            The ranked classification list will appear here after analysis.
          </div>

          <div v-else class="divide-y divide-slate-300">
            <article
              v-for="(match, index) in state.matches"
              :key="match.code"
              class="px-6 py-6"
            >
              <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div class="space-y-2">
                  <div class="flex flex-wrap items-center gap-2">
                    <UBadge :color="index === 0 ? 'primary' : 'neutral'" variant="subtle">
                      {{ index === 0 ? 'Recommended' : `Option ${index + 1}` }}
                    </UBadge>
                    <span class="text-sm font-semibold text-slate-500">
                      {{ match.code }}
                    </span>
                  </div>
                  <h3 class="text-lg font-semibold text-slate-950">
                    {{ match.fullClassification }}
                  </h3>
                  <p class="max-w-3xl text-sm leading-6 text-slate-700">
                    {{ match.why.join(' · ') || 'Semantic similarity from the local embedding model.' }}
                  </p>
                  <p class="max-w-3xl text-sm leading-6 text-slate-700">
                    {{ match.evidenceLabel }}: {{ match.levelEvidence }}
                  </p>
                  <div class="flex flex-wrap gap-2 text-xs text-slate-600">
                    <span class="border border-slate-300 bg-slate-50 px-2 py-1">
                      {{ match.plan || 'plan not tagged' }}
                    </span>
                    <span class="border border-slate-300 bg-slate-50 px-2 py-1">
                      {{ match.source }}
                    </span>
                    <span
                      :key="match.selectedLevel"
                      class="border border-slate-300 bg-slate-50 px-2 py-1"
                    >
                      Level: {{ match.selectedLevel }}
                    </span>
                  </div>
                  <div class="pt-2">
                    <UButton
                      size="sm"
                      variant="outline"
                      :color="selectedMatch?.code === match.code ? 'primary' : 'neutral'"
                      @click="chooseMatch(match)"
                    >
                      {{ selectedMatch?.code === match.code ? 'Selected for draft' : 'Use for phase 2' }}
                    </UButton>
                  </div>
                </div>

                <div class="min-w-44 border border-slate-300 bg-slate-50 px-4 py-4 text-right">
                  <p class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                    Confidence
                  </p>
                  <p class="mt-1 text-2xl font-bold text-slate-950">
                    {{ confidence(match.score) }}
                  </p>
                  <p class="mt-2 text-xs text-slate-600">
                    group {{ confidence(match.groupConfidence) }} · level
                    {{ match.levelConfidence ? confidence(match.levelConfidence) : 'TBC' }}
                  </p>
                </div>
              </div>
            </article>
          </div>
        </div>

        <div class="border border-slate-400 bg-white">
          <div class="border-b border-slate-300 bg-slate-50 px-6 py-5">
            <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Step 2
                </p>
                <h2 class="mt-1 text-2xl font-semibold text-slate-950">
                  Generate Job Description Draft
                </h2>
              </div>
              <UBadge color="warning" variant="subtle">
                Model download visible
              </UBadge>
            </div>
          </div>

          <div class="space-y-5 px-6 py-6">
            <div v-if="!selectedMatch" class="text-sm leading-6 text-slate-700">
              Select one candidate match above to start phase two.
            </div>

            <template v-else>
              <div class="border border-slate-300 bg-slate-50 px-5 py-5">
                <p class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                  Selected classification
                </p>
                <p class="mt-1 text-lg font-semibold text-slate-950">
                  {{ selectedMatch.fullClassification }}
                </p>
                <p class="mt-2 text-sm text-slate-700">
                  The generator uses the selected JES entry, selected level evidence, and
                  the fixed template sections as grounding context.
                </p>
              </div>

              <UFormField
                label="Optional extra context for the draft"
                description="Use this to add organization-specific details, reporting context, or constraints."
                class="w-full"
              >
                <UTextarea
                  v-model="formState.generationContext"
                  class="w-full"
                  :rows="6"
                  autoresize
                  variant="outline"
                  placeholder="Example: Internal economics team supporting grants policy. No direct reports. Frequent briefing notes."
                  :ui="{
                    base: 'min-h-40 w-full bg-white text-slate-950 placeholder:text-slate-500 ring-slate-400 focus:ring-blue-800',
                  }"
                />
              </UFormField>

              <div class="border border-slate-300 bg-slate-50 px-5 py-5">
                <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p class="text-sm font-semibold text-slate-950">
                      {{ generationState.progress.label }}
                    </p>
                    <p class="text-xs text-slate-600">
                      {{ generationState.progress.stage }}<span v-if="generationState.progress.currentFile">
                        · {{ generationState.progress.currentFile }}
                      </span>
                    </p>
                  </div>
                  <p class="text-sm font-semibold text-slate-950">
                    {{ generationState.progress.percent }}%
                  </p>
                </div>
                <div class="mt-3 h-3 w-full border border-slate-300 bg-white">
                  <div
                    class="h-full bg-blue-800 transition-all"
                    :style="{ width: `${generationState.progress.percent}%` }"
                  />
                </div>
                <div class="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-600">
                  <span>
                    {{ formatBytes(generationState.progress.loadedBytes) }} /
                    {{ formatBytes(generationState.progress.totalBytes) }}
                  </span>
                  <span v-if="generationState.lastDurationMs">
                    Last run: {{ formatDuration(generationState.lastDurationMs) }}
                  </span>
                </div>
              </div>

              <div
                class="border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950"
              >
                Large browser models still have a heavy first run. Use the benchmarks page
                to compare quality, speed, and first-download size before changing models.
              </div>

              <div
                v-if="!selectedGenerationModelSupported"
                class="border border-red-300 bg-red-50 px-4 py-3 text-sm leading-6 text-red-900"
              >
                The selected generation model requires WebGPU. {{ browserInferenceNote || 'Use localhost on this machine or serve the app over HTTPS in a WebGPU-capable Chromium browser.' }}
              </div>

              <div class="flex flex-wrap items-center gap-3">
                <UButton
                  color="primary"
                  size="lg"
                  :loading="generationState.loading"
                  :disabled="!selectedGenerationModelSupported"
                  @click="onGenerateDraft"
                >
                  {{ selectedGenerationModelSupported ? 'Generate draft' : 'WebGPU required' }}
                </UButton>
              </div>

              <div
                v-if="generationState.error"
                class="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
              >
                {{ generationState.error }}
              </div>

              <div
                v-if="generationState.streamText && generationState.loading"
                class="border border-slate-300 bg-slate-50 px-5 py-5"
              >
                <div class="mb-3 flex items-center justify-between gap-3">
                  <p class="text-sm font-semibold text-slate-950">Generated sections</p>
                  <UBadge color="warning" variant="subtle">Live</UBadge>
                </div>
                <pre class="overflow-x-auto whitespace-pre-wrap text-sm leading-6 text-slate-800">{{ generationState.streamText }}</pre>
              </div>

              <div
                v-if="generationState.html"
                class="border border-slate-300 bg-slate-50 px-5 py-5"
              >
                <div class="mb-3 flex items-center justify-between gap-3">
                  <p class="text-sm font-semibold text-slate-950">Template-aligned draft</p>
                  <div class="flex flex-wrap items-center gap-2">
                    <UBadge color="neutral" variant="subtle">HTML preview</UBadge>
                    <UButton size="sm" variant="outline" color="primary" @click="onDownloadDocx">
                      Download Word doc
                    </UButton>
                  </div>
                </div>
                <div class="jd-preview-content" v-html="generationState.html" />
                <p v-if="downloadError" class="mt-3 text-sm text-red-800">
                  {{ downloadError }}
                </p>
              </div>
            </template>
          </div>
        </div>
      </section>

      <aside class="space-y-8 lg:sticky lg:top-6 lg:self-start">
        <div class="border border-slate-400 bg-white">
          <div class="border-b border-slate-300 bg-slate-50 px-5 py-4">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Inference
                </p>
                <h2 class="mt-1 text-lg font-semibold text-slate-950">
                  Step 1 Retrieval Model
                </h2>
              </div>
              <UBadge :color="retrievalBadge.color" variant="subtle">
                {{ retrievalBadge.label }}
              </UBadge>
            </div>
          </div>
          <div class="space-y-4 px-5 py-5 text-sm leading-6 text-slate-700">
            <div>
              <p class="font-semibold text-slate-950">{{ selectedBenchmark?.label }}</p>
              <p>{{ runtimeConfig.public.selectedModel }}</p>
            </div>
            <div class="border border-slate-300 bg-slate-50 px-4 py-4">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="font-semibold text-slate-950">
                    {{ state.progress.label }}
                  </p>
                  <p class="text-xs text-slate-600">
                    {{ state.progress.stage }}<span v-if="state.progress.currentFile">
                      · {{ state.progress.currentFile }}
                    </span>
                  </p>
                </div>
                <p class="text-sm font-semibold text-slate-950">
                  {{ state.progress.percent }}%
                </p>
              </div>
              <div class="mt-3 h-3 w-full border border-slate-300 bg-white">
                <div
                  class="h-full bg-blue-800 transition-all"
                  :style="{ width: `${state.progress.percent}%` }"
                />
              </div>
              <div class="mt-2 text-xs text-slate-600">
                {{ formatBytes(state.progress.loadedBytes) }} /
                {{ formatBytes(state.progress.totalBytes) }}
              </div>
            </div>
            <div class="grid grid-cols-3 gap-3">
              <div class="border border-slate-300 bg-slate-50 px-3 py-3">
                <p class="text-xs uppercase tracking-[0.14em] text-slate-600">Top 1</p>
                <p class="text-lg font-semibold text-slate-950">
                  {{ confidence(selectedBenchmark?.top1 || 0) }}
                </p>
              </div>
              <div class="border border-slate-300 bg-slate-50 px-3 py-3">
                <p class="text-xs uppercase tracking-[0.14em] text-slate-600">Top 3</p>
                <p class="text-lg font-semibold text-slate-950">
                  {{ confidence(selectedBenchmark?.top3 || 0) }}
                </p>
              </div>
              <div class="border border-slate-300 bg-slate-50 px-3 py-3">
                <p class="text-xs uppercase tracking-[0.14em] text-slate-600">Corpus</p>
                <p class="text-lg font-semibold text-slate-950">
                  {{ benchmarkSummary.corpusSize }}
                </p>
              </div>
            </div>
            <NuxtLink
              to="/benchmarks#step-1"
              class="inline-flex text-sm font-semibold text-blue-800 underline underline-offset-2"
            >
              View retrieval benchmark details
            </NuxtLink>
          </div>
        </div>

        <div class="border border-slate-400 bg-white">
          <div class="border-b border-slate-300 bg-slate-50 px-5 py-4">
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Step 2
            </p>
            <h2 class="mt-1 text-lg font-semibold text-slate-950">
              Draft Model
            </h2>
          </div>
          <div class="space-y-4 px-5 py-5 text-sm leading-6 text-slate-700">
            <div>
              <p class="font-semibold text-slate-950">
                {{ selectedGenerationModelConfig?.label || 'No model selected' }}
              </p>
              <p v-if="selectedGenerationModelConfig">
                {{ selectedGenerationModelConfig.rationale }}
              </p>
            </div>
            <div class="border border-slate-300 bg-slate-50 px-4 py-4">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="font-semibold text-slate-950">
                    {{ generationState.progress.label }}
                  </p>
                  <p class="text-xs text-slate-600">
                    {{ generationState.progress.stage }}<span v-if="generationState.progress.currentFile">
                      · {{ generationState.progress.currentFile }}
                    </span>
                  </p>
                </div>
                <p class="text-sm font-semibold text-slate-950">
                  {{ generationState.progress.percent }}%
                </p>
              </div>
              <div class="mt-3 h-3 w-full border border-slate-300 bg-white">
                <div
                  class="h-full bg-blue-800 transition-all"
                  :style="{ width: `${generationState.progress.percent}%` }"
                />
              </div>
              <div class="mt-2 text-xs text-slate-600">
                {{ formatBytes(generationState.progress.loadedBytes) }} /
                {{ formatBytes(generationState.progress.totalBytes) }}
              </div>
            </div>
            <label class="block">
              <span class="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
                Select model
              </span>
              <select
                class="mt-2 w-full border border-slate-400 bg-white px-3 py-2 text-sm text-slate-950"
                :value="selectedModel"
                @change="onGenerationModelChange"
              >
                <option
                  v-for="model in GENERATION_MODEL_CANDIDATES"
                  :key="model.id"
                  :value="model.id"
                  :disabled="!model.benchmarkEligible || !canUseGenerationModel(model.id)"
                >
                  {{ model.label }} · {{ model.recommendation }}
                </option>
              </select>
            </label>
            <div v-if="selectedGenerationModelConfig" class="flex flex-wrap gap-2 text-xs text-slate-600">
              <span class="border border-slate-300 bg-slate-50 px-2 py-1">{{ selectedGenerationModelConfig.family }}</span>
              <span class="border border-slate-300 bg-slate-50 px-2 py-1">{{ selectedGenerationModelConfig.params }}</span>
              <span class="border border-slate-300 bg-slate-50 px-2 py-1">~{{ selectedGenerationModelConfig.approxDownloadMB }} MB download</span>
              <span class="border border-slate-300 bg-slate-50 px-2 py-1">{{ selectedGenerationModelConfig.dtype }}</span>
            </div>
            <p
              v-if="selectedGenerationModelConfig && !canUseGenerationModel(selectedGenerationModelConfig.id)"
              class="text-xs text-amber-700"
            >
              {{ browserInferenceNote || 'This browser session does not currently expose WebGPU for local generation.' }}
            </p>
            <NuxtLink
              to="/benchmarks#step-2"
              class="inline-flex text-sm font-semibold text-blue-800 underline underline-offset-2"
            >
              View generation benchmark details
            </NuxtLink>
          </div>
        </div>

        <div class="border border-slate-400 bg-white">
          <div class="border-b border-slate-300 bg-slate-50 px-5 py-4">
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Data
            </p>
            <h2 class="mt-1 text-lg font-semibold text-slate-950">
              JES Index
            </h2>
          </div>
          <div class="space-y-3 px-5 py-5 text-sm leading-6 text-slate-700">
            <p>
              The JES index is curated into separate group-allocation and level-evidence
              retrieval documents.
            </p>
            <NuxtLink
              to="/benchmarks#workflow"
              class="inline-flex text-sm font-semibold text-blue-800 underline underline-offset-2"
            >
              Read the workflow explanation
            </NuxtLink>
          </div>
        </div>
      </aside>
    </main>
  </div>
</template>
