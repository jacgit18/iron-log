#!/usr/bin/env node
// Adds or refreshes an auto-generated table of contents in markdown docs.
// Rule: document-toc.md (global standard). This is a copy of ~/.claude/scripts/doc-toc.mjs so CI can run it; `npm run lint` checks README.md and SETUP.md with it.
//
//   node doc-toc.mjs <dir|file>...            write TOCs (idempotent)
//   node doc-toc.mjs --check <dir|file>...    exit 1 if a doc needs a TOC or has a stale one
//   options: --min-lines=60  --style=wiki|md  --skip=archive,images,node_modules
//
// The TOC sits right after the first H1, between <!-- toc --> and <!-- /toc -->,
// so it lands inside the first 100 lines. Headings inside code fences are ignored.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const flag = (n, d) => (args.find(a => a.startsWith(`--${n}=`)) ?? `--${n}=${d}`).split('=')[1]
const check = args.includes('--check')
const minLines = Number(flag('min-lines', 60))
const style = flag('style', 'wiki')
const skip = new Set(flag('skip', 'archive,images,node_modules,.git').split(','))
const targets = args.filter(a => !a.startsWith('--'))
const OPEN = '<!-- toc -->'
const CLOSE = '<!-- /toc -->'
const MAX_ENTRIES = 40

function walk(p, out) {
  const s = statSync(p)
  if (s.isFile()) { if (p.endsWith('.md')) out.push(p); return }
  for (const e of readdirSync(p)) if (!skip.has(e)) walk(join(p, e), out)
}

const slug = t => t.toLowerCase().replace(/[`*_]/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-')
const clean = t => t.replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*]/g, '').replace(/\s+#+\s*$/, '').trim()

function build(text) {
  const lines = text.split('\n')
  let fm = 0
  if (lines[0] === '---') { const e = lines.indexOf('---', 1); if (e > 0) fm = e + 1 }
  let fence = false, tocBlock = false
  const heads = []
  let h1 = -1
  lines.forEach((l, i) => {
    if (i < fm) return
    if (l.includes(OPEN)) tocBlock = true
    if (tocBlock) { if (l.includes(CLOSE)) tocBlock = false; return }
    if (/^\s*(```|~~~)/.test(l)) { fence = !fence; return }
    if (fence) return
    const m = /^(#{1,3})\s+(.+?)\s*$/.exec(l)
    if (!m) return
    const level = m[1].length
    if (level === 1 && h1 < 0) { h1 = i; return }
    if (/^(contents|table of contents)$/i.test(clean(m[2]))) return
    heads.push({ level, text: clean(m[2]) })
  })
  let list = heads.filter(h => h.level <= 3)
  if (list.length > MAX_ENTRIES) list = list.filter(h => h.level <= 2)
  if (list.length > MAX_ENTRIES) list = list.slice(0, MAX_ENTRIES)
  const seen = new Map()
  const items = list.map(h => {
    const base = slug(h.text); const n = seen.get(base) ?? 0; seen.set(base, n + 1)
    const target = n ? `${base}-${n}` : base
    const link = style === 'md' ? `[${h.text}](#${target})` : `[[#${h.text}]]`
    return `${'  '.repeat(h.level - 2 < 0 ? 0 : h.level - 2)}- ${link}`
  })
  return { lines, fm, h1, items }
}

function render(text) {
  const { lines, fm, h1, items } = build(text)
  if (!items.length) return text
  const block = [OPEN, '## Contents', '', ...items, CLOSE]
  const a = lines.findIndex(l => l.includes(OPEN))
  const b = lines.findIndex(l => l.includes(CLOSE))
  if (a >= 0 && b > a) return [...lines.slice(0, a), ...block, ...lines.slice(b + 1)].join('\n')
  // adopt a hand-written, unmarked Contents list instead of adding a second one
  let ci = -1, fenceC = false
  for (let i = fm; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) fenceC = !fenceC
    if (!fenceC && /^#{2,4}\s+(contents|table of contents)\s*$/i.test(lines[i])) { ci = i; break }
  }
  if (ci >= 0) {
    let end = ci + 1
    while (end < lines.length && (lines[end].trim() === '' || /^\s*([-*+]|\d+\.)\s/.test(lines[end]))) end++
    while (end > ci + 1 && lines[end - 1].trim() === '') end--
    const before = lines.slice(0, ci)
    // a list this far down is moved up under the H1 only when it sits past line 40
    if (ci <= 40) return [...before, ...block, ...lines.slice(end)].join('\n')
    const rest = [...before, ...lines.slice(end)]
    const at2 = h1 >= 0 ? h1 + 1 : fm
    return [...rest.slice(0, at2), '', ...block, ...rest.slice(at2)].join('\n')
  }
  const at = h1 >= 0 ? h1 + 1 : fm
  // keep a one-line italic/blockquote intro directly under the H1 above the TOC
  let pos = at
  while (pos < lines.length && lines[pos].trim() === '') pos++
  if (pos < lines.length && /^(_|>|\*[^*])/.test(lines[pos])) {
    while (pos < lines.length && lines[pos].trim() !== '') pos++
    return [...lines.slice(0, pos), '', ...block, ...lines.slice(pos)].join('\n')
  }
  return [...lines.slice(0, at), '', ...block, ...lines.slice(at)].join('\n')
}

const files = []
for (const t of targets) walk(t, files)
let changed = 0, skipped = 0
for (const f of files) {
  const text = readFileSync(f, 'utf8')
  const n = text.split('\n').length
  const has = text.includes(OPEN)
  if (n <= minLines && !has) { skipped++; continue }
  const next = render(text)
  if (next === text) continue
  changed++
  if (check) console.log(`needs TOC: ${f}`)
  else writeFileSync(f, next)
}
console.log(`${check ? 'checked' : 'wrote'} ${files.length} files, ${changed} ${check ? 'need' : 'changed'}, ${skipped} under ${minLines} lines`)
if (check && changed) process.exit(1)
