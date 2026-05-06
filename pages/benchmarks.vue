<script setup lang="ts">
import benchmarkSummary from '~/resources/model_benchmarks.json'
import generationBenchmarkReport from '~/resources/generation_model_benchmarks.json'
import jesIndex from '~/resources/jes_compact_index.json'

useSeoMeta({
  title: 'How It Works and Benchmarks · Job Classification Assistant',
  description:
    'Explanation of the two-step local inference workflow and benchmark reports for classification retrieval and job description generation.',
})

const selectedRetrievalModel = computed(() =>
  benchmarkSummary.results.find((result) => result.selected) ?? benchmarkSummary.results[0],
)

const retrievalResults = computed(() =>
  [...benchmarkSummary.results].sort((a, b) => b.top1 - a.top1 || b.top3 - a.top3 || b.mrr - a.mrr),
)

const generationResults = computed(() =>
  [...generationBenchmarkReport.results].sort((a, b) => b.totalScore - a.totalScore),
)

const defaultGenerationModel = computed(() =>
  generationBenchmarkReport.results.find(
    (result) => result.id === generationBenchmarkReport.selectedModel,
  ) ?? generationBenchmarkReport.results.find((result) => result.selected),
)

const benchmarkedGenerationResults = computed(() =>
  generationBenchmarkReport.results.filter((result) => result.benchmarked),
)

const smartestGenerationModelId = computed(() =>
  [...benchmarkedGenerationResults.value].sort((a, b) => b.totalScore - a.totalScore)[0]?.id,
)

const fastestGenerationModelId = computed(() =>
  [...benchmarkedGenerationResults.value]
    .filter((result) => result.avgDurationMs > 0)
    .sort((a, b) => a.avgDurationMs - b.avgDurationMs)[0]?.id,
)

const largestGenerationModelId = computed(() =>
  [...generationBenchmarkReport.results].sort((a, b) => b.approxDownloadMB - a.approxDownloadMB)[0]?.id,
)

function confidence(score: number) {
  return `${Math.round(score * 100)}%`
}

function benchmarkScoreLabel(score: number, benchmarked: boolean) {
  return benchmarked ? confidence(score) : 'Pending'
}

function formatDuration(value: number) {
  if (!value) return 'n/a'
  if (value < 1000) return `${value} ms`
  return `${(value / 1000).toFixed(1)} s`
}

function metricLabel(score: number | undefined, benchmarked: boolean) {
  return benchmarkScoreLabel(score ?? 0, benchmarked)
}

function generationModelBlurb(id: string) {
  switch (id) {
    case 'onnx-community/gemma-3-1b-it-ONNX':
      return 'Best raw rewrite score in the 100-case run. It preserved source material most consistently and kept formatting clean, but it is much slower than the smaller options and still added enough unsupported content that validation remains necessary.'
    case 'HuggingFaceTB/SmolLM2-360M-Instruct':
      return 'Best practical default from this run. It landed very close to Gemma 1B while using about half the download size and less than half the CPU generation time, with the strongest balance of conservative wording, usable formatting, and unsupported-claim control.'
    case 'onnx-community/Qwen2.5-0.5B-Instruct':
      return 'Strong at carrying source terms forward, but poor for this workflow because formatting almost always failed and unsupported content remained common. It is larger and slower than SmolLM2 without producing a more usable rewrite.'
    case 'onnx-community/gemma-3-270m-it-ONNX':
      return 'Fastest and smallest option, but the rewrite quality is not dependable. It kept formatting clean, yet it lost too much grounded content and performed worst at avoiding unsupported additions, so it is mainly useful as a speed baseline.'
    default:
      return 'No qualitative benchmark interpretation is available for this model yet.'
  }
}
</script>

<template>
  <div class="min-h-screen bg-slate-100 text-slate-900">
    <header class="border-t-[14px] border-blue-800 bg-white">
      <div class="border-b border-slate-300">
        <div class="mx-auto max-w-6xl px-4 py-7 sm:px-6 lg:px-8">
          <NuxtLink
            to="/"
            class="inline-flex text-sm font-semibold text-blue-800 underline underline-offset-2"
          >
            Back to app
          </NuxtLink>
          <p class="mt-6 text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">
            Methodology
          </p>
          <h1 class="mt-2 text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
            How The App Works
          </h1>
          <p class="mt-4 max-w-4xl text-base leading-7 text-slate-700">
            This prototype runs two local browser inference steps. Step 1 screens the user’s role
            against a curated JES retrieval index. Step 2 drafts a job description only after the
            user selects one classification candidate.
          </p>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <section id="workflow" class="border border-slate-400 bg-white">
        <div class="border-b border-slate-300 bg-slate-50 px-6 py-5">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Workflow
          </p>
          <h2 class="mt-1 text-2xl font-semibold text-slate-950">
            What Happens When You Analyze A Role
          </h2>
        </div>
        <div class="grid gap-0 divide-y divide-slate-300 md:grid-cols-3 md:divide-x md:divide-y-0">
          <div class="px-6 py-6 text-sm leading-6 text-slate-700">
            <p class="font-semibold text-slate-950">1. Build a query</p>
            <p class="mt-2">
              The app combines the job title and duties into one search query. The query stays in
              the browser and is embedded locally by the selected retrieval model. The static JES
              embeddings are loaded from browser cache when available.
            </p>
          </div>
          <div class="px-6 py-6 text-sm leading-6 text-slate-700">
            <p class="font-semibold text-slate-950">2. Rank JES groups and levels</p>
            <p class="mt-2">
              Group allocation documents are ranked first. Level profiles are then ranked only
              inside the most plausible groups, using JES-derived evidence rather than a generic
              complexity ladder.
            </p>
          </div>
          <div class="px-6 py-6 text-sm leading-6 text-slate-700">
            <p class="font-semibold text-slate-950">3. Draft from the selected candidate</p>
            <p class="mt-2">
              The app builds each job description section from deterministic, grounded text first.
              The selected generation model can then rewrite one section at a time. A validator
              accepts only conservative rewrites and falls back to the grounded section when the
              model adds facts, leaks prompt labels, drifts from the source, or breaks formatting.
            </p>
          </div>
        </div>
      </section>

      <section class="grid gap-8 lg:grid-cols-2">
        <div class="border border-slate-400 bg-white">
          <div class="border-b border-slate-300 bg-slate-50 px-6 py-5">
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Data
            </p>
            <h2 class="mt-1 text-2xl font-semibold text-slate-950">
              JES Retrieval Index
            </h2>
          </div>
          <div class="space-y-4 px-6 py-6 text-sm leading-6 text-slate-700">
            <p>
              The app does not scan PDFs at runtime. It imports a compact JSON index with
              {{ jesIndex.entries.length }} current groups. Each group has clean allocation text,
              aliases, inclusions, exclusions, routing tags, near-miss groups, and level profiles.
            </p>
            <p>
              The first run embeds the curated group documents and level profiles in the browser.
              Those embeddings are stored in IndexedDB and reused on refreshes unless the retrieval
              model or JES index signature changes.
            </p>
            <p>
              The index deliberately avoids raw OCR fragments, point tables as embedding text,
              table headers, and generic JES boilerplate. A validation script fails the build if
              noisy retrieval artifacts return.
            </p>
          </div>
        </div>

        <div class="border border-slate-400 bg-white">
          <div class="border-b border-slate-300 bg-slate-50 px-6 py-5">
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Guardrails
            </p>
            <h2 class="mt-1 text-2xl font-semibold text-slate-950">
              What The Result Means
            </h2>
          </div>
          <div class="space-y-4 px-6 py-6 text-sm leading-6 text-slate-700">
            <p>
              A recommendation is screening evidence, not a formal classification decision. Formal
              classification still requires the applicable JES, organizational relativity, job
              evaluation rationale, and accredited classification authority.
            </p>
            <p>
              If the group evidence is plausible but the role text does not support a defensible
              level, the app returns the group with “level to be confirmed” instead of inventing a
              classification level.
            </p>
          </div>
        </div>
      </section>

      <section id="step-1" class="border border-slate-400 bg-white">
        <div class="border-b border-slate-300 bg-slate-50 px-6 py-5">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Step 1 Benchmark
          </p>
          <h2 class="mt-1 text-2xl font-semibold text-slate-950">
            Classification Retrieval
          </h2>
        </div>
        <div class="space-y-5 px-6 py-6 text-sm leading-6 text-slate-700">
          <p>
            The retrieval benchmark uses {{ benchmarkSummary.corpusSize }} local test cases. Each
            case has a title, duties, and expected group. Models are compared by whether the
            expected group is ranked first, appears in the top three, and by mean reciprocal rank.
          </p>
          <p>
            The timing shown here is the original benchmark embedding run over the static JES
            corpus. In the app, the JES embeddings are persisted in IndexedDB after the first run;
            later visits only load the retrieval model and embed the user’s query unless the JES
            index or selected retrieval model changes.
          </p>
          <div class="grid gap-3 sm:grid-cols-3">
            <div class="border border-slate-300 bg-slate-50 px-4 py-4">
              <p class="text-xs uppercase tracking-[0.14em] text-slate-600">Selected model</p>
              <p class="mt-1 text-sm font-semibold text-slate-950">
                {{ selectedRetrievalModel?.label }}
              </p>
            </div>
            <div class="border border-slate-300 bg-slate-50 px-4 py-4">
              <p class="text-xs uppercase tracking-[0.14em] text-slate-600">Top 1</p>
              <p class="mt-1 text-lg font-semibold text-slate-950">
                {{ confidence(selectedRetrievalModel?.top1 || 0) }}
              </p>
            </div>
            <div class="border border-slate-300 bg-slate-50 px-4 py-4">
              <p class="text-xs uppercase tracking-[0.14em] text-slate-600">Top 3</p>
              <p class="mt-1 text-lg font-semibold text-slate-950">
                {{ confidence(selectedRetrievalModel?.top3 || 0) }}
              </p>
            </div>
          </div>
          <div class="overflow-x-auto border border-slate-300">
            <table class="min-w-full divide-y divide-slate-300 text-left text-xs">
              <thead class="bg-slate-50 text-slate-700">
                <tr>
                  <th class="px-3 py-2 font-semibold">Model</th>
                  <th class="px-3 py-2 font-semibold">Top 1</th>
                  <th class="px-3 py-2 font-semibold">Top 3</th>
                  <th class="px-3 py-2 font-semibold">MRR</th>
                  <th class="px-3 py-2 font-semibold">Size</th>
                  <th class="px-3 py-2 font-semibold">First index time</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-300">
                <tr
                  v-for="result in retrievalResults"
                  :key="result.id"
                  :class="result.selected ? 'bg-blue-50' : 'bg-white'"
                >
                  <td class="px-3 py-2 font-semibold text-slate-950">{{ result.label }}</td>
                  <td class="px-3 py-2">{{ confidence(result.top1) }}</td>
                  <td class="px-3 py-2">{{ confidence(result.top3) }}</td>
                  <td class="px-3 py-2">{{ confidence(result.mrr) }}</td>
                  <td class="px-3 py-2">{{ result.sizeMB }} MB</td>
                  <td class="px-3 py-2">{{ formatDuration(result.durationMs) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section id="step-2" class="border border-slate-400 bg-white">
        <div class="border-b border-slate-300 bg-slate-50 px-6 py-5">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Step 2 Benchmark
          </p>
          <h2 class="mt-1 text-2xl font-semibold text-slate-950">
            Job Description Generation
          </h2>
        </div>
        <div class="space-y-5 px-6 py-6 text-sm leading-6 text-slate-700">
          <p>
            The generation benchmark uses {{ generationBenchmarkReport.corpusSize }} handcrafted
            conservative rewrite cases. Each case starts with the same deterministic draft section
            built from the selected classification, JES-derived evidence, duties, and user-entered
            context. The model does not receive permission to invent missing details; it is only
            asked to make the grounded section read better.
          </p>
          <div class="border border-slate-300 bg-slate-50 px-4 py-4">
            <p class="font-semibold text-slate-950">How Step 2 Uses The Model</p>
            <ol class="mt-3 grid gap-3 pl-5 text-xs leading-5 text-slate-700 md:grid-cols-4">
              <li class="list-decimal">
                The app writes a plain grounded section using known facts and explicit “To be
                confirmed” placeholders where facts are missing.
              </li>
              <li class="list-decimal">
                The selected local model receives only that section, the selected classification,
                and the relevant user facts for a conservative rewrite.
              </li>
              <li class="list-decimal">
                The validator checks the rewrite for unsupported claims, prompt/input labels,
                headings, markdown tables, suspicious entities, and source drift.
              </li>
              <li class="list-decimal">
                The accepted rewrite is shown in the HTML preview. If validation fails, the original
                grounded section is kept instead.
              </li>
            </ol>
          </div>
          <p>
            Scores reflect that production workflow: preserving grounded content, avoiding
            unsupported claims, improving wording, and keeping usable plain-text formatting. A model
            can score well only if it improves the draft without becoming the source of new facts.
          </p>
          <p>
            Size is the approximate browser download for the app's selected ONNX dtype and required
            tokenizer/config files, not the full Hugging Face repository size.
          </p>
          <div v-if="defaultGenerationModel" class="grid gap-3 sm:grid-cols-4">
            <div class="border border-blue-300 bg-blue-50 px-4 py-4">
              <p class="text-xs uppercase tracking-[0.14em] text-blue-800">Current default</p>
              <p class="mt-1 text-base font-semibold text-slate-950">
                {{ defaultGenerationModel.label }}
              </p>
            </div>
            <div class="border border-slate-300 bg-slate-50 px-4 py-4">
              <p class="text-xs uppercase tracking-[0.14em] text-slate-600">Browser download</p>
              <p class="mt-1 text-base font-semibold text-slate-950">
                ~{{ defaultGenerationModel.approxDownloadMB }} MB
              </p>
            </div>
            <div class="border border-slate-300 bg-slate-50 px-4 py-4">
              <p class="text-xs uppercase tracking-[0.14em] text-slate-600">ONNX dtype</p>
              <p class="mt-1 text-base font-semibold text-slate-950">
                {{ defaultGenerationModel.dtype }}
              </p>
            </div>
            <div class="border border-slate-300 bg-slate-50 px-4 py-4">
              <p class="text-xs uppercase tracking-[0.14em] text-slate-600">Fallback</p>
              <p class="mt-1 text-base font-semibold text-slate-950">
                Grounded draft
              </p>
            </div>
          </div>
          <div class="grid gap-3 md:grid-cols-4">
            <div class="border border-slate-300 bg-white px-4 py-4">
              <p class="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Faithful</p>
              <p class="mt-2 text-xs leading-5 text-slate-700">
                Keeps the grounded source duties and context.
              </p>
            </div>
            <div class="border border-slate-300 bg-white px-4 py-4">
              <p class="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">No extras</p>
              <p class="mt-2 text-xs leading-5 text-slate-700">
                Avoids unsupported facts, labels, prompt leakage, and invented entities.
              </p>
            </div>
            <div class="border border-slate-300 bg-white px-4 py-4">
              <p class="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Wording</p>
              <p class="mt-2 text-xs leading-5 text-slate-700">
                Improves readability without over-expanding the section.
              </p>
            </div>
            <div class="border border-slate-300 bg-white px-4 py-4">
              <p class="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Format</p>
              <p class="mt-2 text-xs leading-5 text-slate-700">
                Returns plain section text or bullets, not markdown headings or tables.
              </p>
            </div>
          </div>
          <div class="overflow-x-auto border border-slate-300">
            <table class="min-w-full divide-y divide-slate-300 text-left text-xs">
              <thead class="bg-slate-50 text-slate-700">
                <tr>
                  <th class="px-3 py-2 font-semibold">Model</th>
                  <th class="px-3 py-2 font-semibold">Score</th>
                  <th class="px-3 py-2 font-semibold">Faithful</th>
                  <th class="px-3 py-2 font-semibold">No extras</th>
                  <th class="px-3 py-2 font-semibold">Wording</th>
                  <th class="px-3 py-2 font-semibold">Format</th>
                  <th class="px-3 py-2 font-semibold">Avg</th>
                  <th class="px-3 py-2 font-semibold">P95</th>
                  <th class="px-3 py-2 font-semibold">Dtype</th>
                  <th class="px-3 py-2 font-semibold">Browser size</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-300">
                <tr
                  v-for="result in generationResults"
                  :key="result.id"
                  :class="result.selected ? 'bg-blue-50' : 'bg-white'"
                >
                  <td class="px-3 py-2">
                    <div class="font-semibold text-slate-950">{{ result.label }}</div>
                    <div class="text-slate-600">
                      {{ result.params }} · {{ result.family }}
                    </div>
                  </td>
                  <td class="px-3 py-2">{{ benchmarkScoreLabel(result.totalScore, result.benchmarked) }}</td>
                  <td class="px-3 py-2">{{ metricLabel(result.faithfulnessScore ?? result.groundingScore, result.benchmarked) }}</td>
                  <td class="px-3 py-2">{{ metricLabel(result.unsupportedClaimScore ?? result.coverageScore, result.benchmarked) }}</td>
                  <td class="px-3 py-2">{{ metricLabel(result.rewriteQualityScore ?? result.sectionCompleteness, result.benchmarked) }}</td>
                  <td class="px-3 py-2">{{ metricLabel(result.formattingScore ?? result.sectionCompleteness, result.benchmarked) }}</td>
                  <td class="px-3 py-2">{{ formatDuration(result.avgDurationMs) }}</td>
                  <td class="px-3 py-2">{{ formatDuration(result.p95DurationMs) }}</td>
                  <td class="px-3 py-2">{{ result.dtype }}</td>
                  <td class="px-3 py-2">~{{ result.approxDownloadMB }} MB</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="grid gap-4 lg:grid-cols-2">
            <div
              v-for="result in generationResults"
              :key="`${result.id}-detail`"
              class="border border-slate-300 bg-slate-50 px-4 py-4"
            >
              <div class="flex flex-wrap items-center gap-2">
                <p class="font-semibold text-slate-950">{{ result.label }}</p>
                <UBadge v-if="result.selected" color="primary" variant="subtle">
                  Default
                </UBadge>
                <UBadge v-if="smartestGenerationModelId === result.id" color="success" variant="subtle">
                  Best rewrite
                </UBadge>
                <UBadge v-if="fastestGenerationModelId && fastestGenerationModelId === result.id" color="warning" variant="subtle">
                  Fastest
                </UBadge>
                <UBadge v-if="largestGenerationModelId === result.id" color="neutral" variant="subtle">
                  Biggest
                </UBadge>
              </div>
              <p class="mt-2">
                {{ generationModelBlurb(result.id) }}
              </p>
              <div class="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                <span class="border border-slate-300 bg-white px-2 py-1">
                  {{ result.dtype }}
                </span>
                <span class="border border-slate-300 bg-white px-2 py-1">
                  ~{{ result.approxDownloadMB }} MB browser download
                </span>
                <span class="border border-slate-300 bg-white px-2 py-1">
                  {{ benchmarkScoreLabel(result.totalScore, result.benchmarked) }} score
                </span>
                <span
                  v-if="result.benchmarked"
                  class="border border-slate-300 bg-white px-2 py-1"
                >
                  validator fallback required
                </span>
              </div>
              <p v-if="result.benchmarkNotes" class="mt-2 text-xs text-slate-600">
                {{ result.benchmarkNotes }}
              </p>
            </div>
          </div>
          <div class="border border-slate-300 bg-slate-50 px-4 py-4 text-xs leading-5 text-slate-700">
            <p class="font-semibold text-slate-950">Current interpretation</p>
            <p class="mt-2">
              SmolLM2 remains the selected recommendation because it is close to Gemma 1B on the
              conservative rewrite score while being materially smaller and faster. Gemma 1B has the
              strongest raw score in this CPU benchmark. Gemma 270M is fastest but weak on
              unsupported-claim avoidance, and Qwen2.5 0.5B preserves more source terms but often
              returns unusable formatting. The production path therefore treats every model as
              optional polish over a grounded draft and rejects unsafe rewrites.
            </p>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>
