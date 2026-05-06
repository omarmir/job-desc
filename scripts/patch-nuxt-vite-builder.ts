import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const viteBuilderPath = resolve(
  process.cwd(),
  'node_modules/@nuxt/vite-builder/dist/index.mjs',
)
const viteNodePath = resolve(
  process.cwd(),
  'node_modules/@nuxt/vite-builder/dist/vite-node.mjs',
)

const originalLinuxBranch = `\tif (process.platform === "linux") {\n\t\tif (Number.parseInt(process.versions.node.split(".")[0], 10) >= 20 && provider !== "stackblitz") {\n\t\t\tlet isDocker = false;\n\t\t\ttry {\n\t\t\t\tisDocker = fs.existsSync("/.dockerenv") || fs.existsSync("/proc/1/cgroup") && fs.readFileSync("/proc/1/cgroup", "utf8").includes("docker");\n\t\t\t} catch {}\n\t\t\tif (!isDocker) return \`\\0\${socketName}.sock\`;\n\t\t}\n\t}\n`

const patchedLinuxBranch = `\tif (process.platform === "linux") {\n\t\treturn join(os.tmpdir(), \`\${socketName}.sock\`);\n\t}\n`
const originalViteBuilderEnvBlock = `\tconst vfs = {\n\t\t"server.mjs": \`export { default } from \${JSON.stringify(pathToFileURL(serverResolvedPath).href)}\`,\n\t\t"runner.mjs": \`export { default } from \${JSON.stringify(pathToFileURL(runnerResolvedPath).href)}\`,\n\t\t"client.manifest.mjs": \`import { viteNodeFetch } from \${JSON.stringify(pathToFileURL(fetchResolvedPath))};export default () => viteNodeFetch.getManifest()\`,\n\t\t"client.precomputed.mjs": "export default undefined"\n\t};\n`
const patchedViteBuilderEnvBlock = `\tconst vfs = {\n\t\t"server.mjs": \`export { default } from \${JSON.stringify(pathToFileURL(serverResolvedPath).href)}\`,\n\t\t"runner.mjs": \`export { default } from \${JSON.stringify(pathToFileURL(runnerResolvedPath).href)}\`,\n\t\t"client.manifest.mjs": \`import { viteNodeFetch } from \${JSON.stringify(pathToFileURL(fetchResolvedPath))};export default () => viteNodeFetch.getManifest()\`,\n\t\t"client.precomputed.mjs": "export default undefined"\n\t};\n\tprocess.env.NUXT_VITE_NODE_OPTIONS = JSON.stringify({\n\t\tsocketPath,\n\t\troot: nuxt.options.srcDir,\n\t\tentryPath: "",\n\t\tbase: "/_nuxt/",\n\t\tbaseURL: nuxt.options.devServer.url\n\t});\n`
const originalResolveServerBranch = `\t\t\tif (nuxt.options.experimental.viteEnvironmentApi) resolveServer(clientServer);\n\t\t\telse nuxt.hook("vite:serverCreated", (ssrServer, ctx) => ctx.isServer ? resolveServer(ssrServer) : void 0);\n`
const patchedResolveServerBranch = `\t\t\tif (nuxt.options.experimental.viteEnvironmentApi || !nuxt.options.ssr) resolveServer(clientServer);\n\t\t\telse nuxt.hook("vite:serverCreated", (ssrServer, ctx) => ctx.isServer ? resolveServer(ssrServer) : void 0);\n`
const originalEntryPathLine = `\t\t\t\t\tentryPath: resolveServerEntry(ssrServer.config),\n`
const patchedEntryPathLine = `\t\t\t\t\tentryPath: nuxt.options.ssr ? resolveServerEntry(ssrServer.config) : resolveClientEntry(clientServer.config),\n`

const originalViteNodePrelude = `const viteNodeOptions = getViteNodeOptionsEnvVar();\nconst pendingRequests = /* @__PURE__ */ new Map();\nlet requestIdCounter = 0;\nlet clientSocket;\nlet currentConnectPromise;\nconst MAX_RETRY_ATTEMPTS = viteNodeOptions.maxRetryAttempts ?? 5;\nconst BASE_RETRY_DELAY_MS = viteNodeOptions.baseRetryDelay ?? 100;\nconst MAX_RETRY_DELAY_MS = viteNodeOptions.maxRetryDelay ?? 2e3;\nconst REQUEST_TIMEOUT_MS = viteNodeOptions.requestTimeout ?? 6e4;\n`
const patchedViteNodePrelude = `function resolveViteNodeOptions() {\n\treturn getViteNodeOptionsEnvVar();\n}\nconst viteNodeOptions = new Proxy({}, {\n\tget(_target, prop) {\n\t\treturn resolveViteNodeOptions()[prop];\n\t}\n});\nconst pendingRequests = /* @__PURE__ */ new Map();\nlet requestIdCounter = 0;\nlet clientSocket;\nlet currentConnectPromise;\nfunction getMaxRetryAttempts() {\n\treturn resolveViteNodeOptions().maxRetryAttempts ?? 5;\n}\nfunction getBaseRetryDelayMs() {\n\treturn resolveViteNodeOptions().baseRetryDelay ?? 100;\n}\nfunction getMaxRetryDelayMs() {\n\treturn resolveViteNodeOptions().maxRetryDelay ?? 2e3;\n}\nfunction getRequestTimeoutMs() {\n\treturn resolveViteNodeOptions().requestTimeout ?? 6e4;\n}\n`

const originalRetryDelayBody = `function calculateRetryDelay(attempt) {\n\tconst exponentialDelay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);\n\tconst jitter = Math.random() * .1 * exponentialDelay;\n\treturn Math.min(exponentialDelay + jitter, MAX_RETRY_DELAY_MS);\n}\n`
const patchedRetryDelayBody = `function calculateRetryDelay(attempt) {\n\tconst exponentialDelay = getBaseRetryDelayMs() * Math.pow(2, attempt);\n\tconst jitter = Math.random() * .1 * exponentialDelay;\n\treturn Math.min(exponentialDelay + jitter, getMaxRetryDelayMs());\n}\n`

const originalTimeoutLine = `\t\t\tconst timeoutId = setTimeout(() => {\n\t\t\t\tpendingRequests.delete(requestId);\n\t\t\t\treject(/* @__PURE__ */ new Error(\`Request timeout after \${REQUEST_TIMEOUT_MS}ms for type: \${type}\`));\n\t\t\t}, REQUEST_TIMEOUT_MS);\n`
const patchedTimeoutLine = `\t\t\tconst requestTimeoutMs = getRequestTimeoutMs();\n\t\t\tconst timeoutId = setTimeout(() => {\n\t\t\t\tpendingRequests.delete(requestId);\n\t\t\t\treject(/* @__PURE__ */ new Error(\`Request timeout after \${requestTimeoutMs}ms for type: \${type}\`));\n\t\t\t}, requestTimeoutMs);\n`

function patchFile(path: string, replacements: Array<[string, string]>) {
  return readFile(path, 'utf8').then(async (source) => {
    let patchedSource = source
    let changed = false

    for (const [original, replacement] of replacements) {
      if (patchedSource.includes(replacement)) {
        continue
      }

      if (!patchedSource.includes(original)) {
        throw new Error(`Expected patch target not found in ${path}`)
      }

      patchedSource = patchedSource.replace(original, replacement)
      changed = true
    }

    if (!changed) {
      return false
    }

    await writeFile(path, patchedSource, 'utf8')
    return true
  })
}

const viteBuilderPatched = await patchFile(viteBuilderPath, [
  [originalLinuxBranch, patchedLinuxBranch],
  [originalViteBuilderEnvBlock, patchedViteBuilderEnvBlock],
  [originalResolveServerBranch, patchedResolveServerBranch],
  [originalEntryPathLine, patchedEntryPathLine],
])
const viteNodePatched = await patchFile(viteNodePath, [
  [originalViteNodePrelude, patchedViteNodePrelude],
  [originalRetryDelayBody, patchedRetryDelayBody],
  [originalTimeoutLine, patchedTimeoutLine],
  ['if (attempt < MAX_RETRY_ATTEMPTS) {', 'if (attempt < getMaxRetryAttempts()) {'],
  ['for (let requestAttempt = 0; requestAttempt <= MAX_RETRY_ATTEMPTS; requestAttempt++) try {', 'for (let requestAttempt = 0; requestAttempt <= getMaxRetryAttempts(); requestAttempt++) try {'],
  ['if (requestAttempt < MAX_RETRY_ATTEMPTS) {', 'if (requestAttempt < getMaxRetryAttempts()) {'],
])

if (!viteBuilderPatched && !viteNodePatched) {
  console.log('Nuxt vite-builder patches already applied.')
} else {
  console.log('Patched @nuxt/vite-builder for Bun/Nuxt dev compatibility on Linux.')
}
