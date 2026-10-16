// Rulează toate suitele pe rând și afișează un rezumat. Folosire: npm run e2e [-- auth home]
import { spawnSync } from 'node:child_process'

const all = ['auth', 'home', 'detail', 'crud', 'messages', 'admin']
const suites = process.argv.slice(2).length ? process.argv.slice(2) : all
const here = new URL('.', import.meta.url).pathname
const results = []

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
