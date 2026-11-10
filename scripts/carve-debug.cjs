// 解剖单条命中：给定偏移，从最近 { 括号配对并试 parse，暴露失败原因
const fs = require('node:fs')
const s = fs.readFileSync(process.argv[2]).toString('latin1')
const probe = Number(process.argv[3])
const start = s.lastIndexOf('{', probe)
let depth = 0, end = -1, inStr = false, esc = false
for (let i = start; i < Math.min(start + 120000, s.length); i++) {
  const ch = s[i]
  if (esc) { esc = false; continue }
  if (ch === '\\') { esc = true; continue }
  if (ch === '"') inStr = !inStr
  else if (!inStr) {
    if (ch === '{') depth++
    else if (ch === '}') { depth--; if (depth === 0) { end = i; break } }
  }
}
console.log('start:', start, 'end:', end, 'len:', end - start, 'inStr@EOF:', inStr)
if (end === -1) process.exit(0)
const raw = s.slice(start, end + 1)
try {
  const o = JSON.parse(raw)
  console.log('PARSE OK id=', o.id, 'board=', (o.board || []).length, 'msgs=', (o.messages || []).length)
} catch (e) {
  console.log('PARSE FAIL:', e.message)
  const m = e.message.match(/position (\d+)/)
  if (m) {
    const p = Number(m[1])
    console.log('around fail pos:', JSON.stringify(raw.slice(Math.max(0, p - 80), p + 20)))
    console.log('char codes:', [...raw.slice(p - 3, p + 3)].map((c) => c.charCodeAt(0)).join(','))
  }
  console.log('tail of raw:', JSON.stringify(raw.slice(-60)))
}
