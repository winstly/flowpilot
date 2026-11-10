// 事故雕复：从 flowpilot.db 空闲页里抢救被删的 app_records（任务/市场快照）
// 只读原始字节，括号配对 + JSON.parse 校验，落盘到 %TEMP%/flowpilot-carved-*.json
const fs = require('node:fs')
const path = require('node:path')

const dbPath = process.argv[2] || path.join(process.env.APPDATA, 'FlowPilot', 'flowpilot.db')
const outDir = process.argv[3] || process.env.TEMP
const s = fs.readFileSync(dbPath).toString('latin1')

function carve(marker, accept) {
  const out = []
  let idx = -1
  let coveredUntil = -1
  while ((idx = s.indexOf(marker, idx + 1)) !== -1) {
    if (idx < coveredUntil) continue // 已提取区间内的残余命中
    // 碎片起点可能被覆盖：从命中点向前逐个 { 尝试，配对出的整串能 parse 且通过校验就算数
    let probe = idx
    for (let attempt = 0; attempt < 8 && probe !== -1; attempt++) {
      const start = s.lastIndexOf('{', probe)
      if (start === -1) break
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
      if (end !== -1) {
        try {
          const obj = JSON.parse(s.slice(start, end + 1))
          if (accept(obj)) {
            out.push(obj)
            idx = end
            coveredUntil = end
            break
          }
        } catch { /* 换更早的 { 再试 */ }
      }
      probe = start - 1
    }
  }
  return out
}

// 任务记录：{ id: "T-<n>", board: [...] } —— 同 id 多版本存世，取 updatedAt 最新（缺省取 board 最全）
const taskVersions = carve('"id":"T-', (o) => /^T-\d+$/.test(o.id || '') && Array.isArray(o.board))
const byId = new Map()
for (const t of taskVersions) {
  const prev = byId.get(t.id)
  const better = !prev
    || (t.updatedAt || 0) > (prev.updatedAt || 0)
    || ((t.updatedAt || 0) === (prev.updatedAt || 0) && (t.board || []).length + (t.messages || []).length > (prev.board || []).length + (prev.messages || []).length)
  if (better) byId.set(t.id, t)
}
const tasks = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id))
console.log('carved task versions:', taskVersions.length, '| unique:', tasks.length)
console.log('tasks:', tasks.map((t) => `${t.id}(${t.status},${t.board.length}nodes,msgs:${(t.messages || []).length})`).join(' '))
fs.writeFileSync(path.join(outDir, 'flowpilot-carved-tasks.json'), JSON.stringify(tasks, null, 1))

// 市场快照：kind='market', id='extras' 的 record —— { list:[...], seedOverrides, ... }
const markets = carve('"seedOverrides"', (o) => Array.isArray(o.list))
console.log('carved market snapshots:', markets.length, markets.map((m) => `list:${m.list.length},overrides:${Object.keys(m.seedOverrides || {}).length}`).join(' | '))
fs.writeFileSync(path.join(outDir, 'flowpilot-carved-market.json'), JSON.stringify(markets, null, 1))
console.log('written to', outDir)
