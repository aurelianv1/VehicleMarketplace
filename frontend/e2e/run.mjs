// Rulează toate suitele pe rând și afișează un rezumat. Folosire: npm run e2e [-- auth home]
import { spawnSync } from 'node:child_process'

const all = ['auth', 'home', 'detail', 'crud', 'messages', 'admin']
const suites = process.argv.slice(2).length ? process.argv.slice(2) : all
const here = new URL('.', import.meta.url).pathname
const results = []

// Testele fac sute de cereri pe minut de pe același IP; cu limita din aplicație (100/min)
// ar fi blocate. Backend-ul pentru teste se pornește cu o limită mare (vezi e2e/README.md).
const { API } = await import('./config.mjs')
const probe = await fetch(`${API}/listings?per_page=1`).catch(() => null)
const limit = Number(probe?.headers.get('x-ratelimit-limit') ?? 0)
if (!probe) {
  console.error(`Backend-ul nu răspunde la ${API}. Pornește-l înainte de teste.`)
  process.exit(1)
}
if (limit < 10000) {
  console.error(
    `Backend-ul rulează cu limita de ${limit} cereri/minut, prea mică pentru teste.\n` +
      'Repornește-l pentru teste cu:\n' +
      '  cd backend && RATE_LIMIT_PER_MINUTE=100000 uvicorn app.main:app --reload',
  )
  process.exit(1)
}

for (const suite of suites) {
  console.log(`\n=== ${suite} ===`)
  const r = spawnSync('node', [`${here}${suite}.mjs`], { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' })
  process.stdout.write(r.stdout)
  const ok = (r.stdout.match(/^OK /gm) ?? []).length
  const fail = (r.stdout.match(/^FAIL /gm) ?? []).length
  results.push({ suite, ok, fail, crashed: r.status !== 0 && fail === 0 })
}

console.log('\n=== Rezumat ===')
for (const { suite, ok, fail, crashed } of results) {
  console.log(`${suite.padEnd(8)} ${String(ok).padStart(3)} trecute  ${fail ? `${fail} eșuate` : ''}${crashed ? 'S-A OPRIT CU EROARE' : ''}`)
}
const total = results.reduce((s, r) => s + r.ok, 0)
const failed = results.some((r) => r.fail || r.crashed)
console.log(failed ? '\nUnele verificări au eșuat.' : `\nToate cele ${total} de verificări au trecut.`)
process.exit(failed ? 1 : 0)
