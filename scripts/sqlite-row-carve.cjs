// SQLite 行级雕复：扫描所有页（含空闲页），按表叶子页解析单元格，沿溢出链拼回大行
// 目标：恢复 app_records 被删的任务/市场记录（大 JSON 行 = 溢出存储，字节不连续）
const fs = require('node:fs')
const path = require('node:path')

const dbPath = process.argv[2]
const outPath = process.argv[3] || path.join(process.env.TEMP, 'flowpilot-carved-rows.json')
const buf = fs.readFileSync(dbPath)

// —— 页参数（DB 文件头：16-17 字节大端页大小，1=65536）——
const rawPageSize = buf.readUInt16BE(16)
const pageSize = rawPageSize === 1 ? 65536 : rawPageSize
const pageCount = Math.floor(buf.length / pageSize)
const usable = pageSize // 无 reserved 空间（文件头 20 字节 = 0）
const maxLocal = Math.floor(((usable - 12) * 32) / 255) - 23
const minLocal = Math.floor(((usable - 12) * 128) / 255) - 23
console.log('pageSize:', pageSize, 'pages:', pageCount, 'maxLocal:', maxLocal, 'reserved:', buf[20])

const pageBuf = (n) => buf.subarray((n - 1) * pageSize, n * pageSize)

// —— 变长整数 ——
function varint(b, off) {
  let v = 0
  for (let i = 0; i < 9; i++) {
    const byte = b[off + i]
    if (i === 8) { v = v * 256 + byte; return { value: v, len: 9 } }
    v = v * 128 + (byte & 0x7f)
    if (!(byte & 0x80)) return { value: v, len: i + 1 }
  }
}

// —— 记录解析：header 串行类型 → 各列值 ——
function parseRecord(payload) {
  const h = varint(payload, 0)
  const headerLen = h.value
  const types = []
  let off = h.len
  while (off < headerLen) {
    const t = varint(payload, off)
    types.push(t.value)
    off += t.len
  }
  let body = headerLen
  const cols = []
  for (const st of types) {
    if (st === 0) { cols.push(null); continue }
    if (st === 1) { cols.push(payload.readInt8(body)); body += 1; continue }
    if (st === 2) { cols.push(payload.readUInt16BE(body)); body += 2; continue }
    if (st === 3) { cols.push(payload.readUIntBE(body, 3)); body += 3; continue }
    if (st === 4) { cols.push(payload.readUInt32BE(body)); body += 4; continue }
    if (st === 5) { cols.push(Number(payload.readBigUInt64BE(body))); body += 6; continue }
    if (st === 6) { cols.push(Number(payload.readBigInt64BE(body))); body += 8; continue }
    if (st === 7) { cols.push(payload.readDoubleBE(body)); body += 8; continue }
    if (st === 8) { cols.push(0); continue }
    if (st === 9) { cols.push(1); continue }
    if (st >= 12) {
      const len = st % 2 === 0 ? (st - 12) / 2 : (st - 13) / 2
      if (st % 2 === 0) cols.push(buf2hex(payload.subarray(body, body + len))) // BLOB
      else cols.push(payload.subarray(body, body + len).toString('utf8'))
      body += len
      continue
    }
    cols.push(null) // 10/11 保留
  }
  return cols
}

const buf2hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('')

// —— 溢出链拼接 ——
function readOverflow(firstChunk, pageN, payloadLen) {
  const parts = [firstChunk]
  let got = firstChunk.length
  let cur = pageN
  const seen = new Set()
  while (cur >= 1 && cur <= pageCount && !seen.has(cur) && got < payloadLen) {
    seen.add(cur)
    const pg = pageBuf(cur)
    const next = pg.readUInt32BE(0)
    const room = Math.min(usable - 4, payloadLen - got)
    parts.push(pg.subarray(4, 4 + room))
    got += room
    cur = next
    if (next === 0) break
  }
  return Buffer.concat(parts)
}

// —— 单元格解析（表叶子页 0x0D；空闲页头字节可能被 freelist 覆盖，类型不符时按单元格指针数组照样试）——
function parseLeafCells(pg, isPage1, tag) {
  const base = isPage1 ? 100 : 0
  const strict = pg[base] === 0x0d
  if (!strict && pg[base] !== 0x00 && pg[base] !== 0x0d) {
    // 非叶子页（索引/溢出/freelist 头）不硬猜单元格，避免误报
    if (pg[base] !== 0x0a && pg[base] !== 0x02 && pg[base] !== 0x05 && pg[base] !== 0x08) return []
  }
  const cellCount = pg.readUInt16BE(base + 3)
  if (cellCount === 0 || cellCount > 200) return []
  const out = []
  for (let i = 0; i < cellCount; i++) {
    const ptr = pg.readUInt16BE(base + 8 + i * 2)
    if (ptr < base + 8 || ptr >= usable) continue
    try {
      const pl = varint(pg, ptr)
      const rk = varint(pg, ptr + pl.len)
      let pOff = ptr + pl.len + rk.len
      const pLen = pl.value
      if (pLen <= 0 || pLen > 2000000) continue
      let payload
      if (pLen <= maxLocal) {
        payload = pg.subarray(pOff, pOff + pLen)
      } else {
        const k = Math.min(maxLocal, minLocal + ((pLen - minLocal) % (usable - 4)))
        const first = pg.subarray(pOff, pOff + k)
        const ovN = pg.readUInt32BE(pOff + k)
        payload = readOverflow(first, ovN, pLen)
      }
      const partial = payload.length !== pLen
      out.push({ tag, rowid: rk.value, partial, cols: parseRecord(payload) })
    } catch { /* 空闲页结构残缺，跳过 */ }
  }
  return out
}

const rows = []
for (let n = 1; n <= pageCount; n++) {
  const pg = pageBuf(n)
  for (const r of parseLeafCells(pg, n === 1, `p${n}`)) rows.push(r)
}

// —— 过滤出 app_records 形状的行：[kind, id, record, updated_at]，record 是 JSON ——
const hits = []
const frags = []
for (const r of rows) {
  const [kind, id, record, updatedAt] = r.cols
  if (typeof kind !== 'string' || typeof id !== 'string' || typeof record !== 'string') continue
  if (!record.startsWith('{')) continue
  try {
    const obj = JSON.parse(record)
    hits.push({ tag: r.tag, partial: r.partial, rowid: r.rowid, kind, id, updatedAt, obj })
  } catch {
    frags.push({ tag: r.tag, partial: r.partial, kind, id, updatedAt, recordLen: record.length, head: record.slice(0, 300), tail: record.slice(-200) })
  }
}
console.log('recovered app_records rows:', hits.length)
for (const h of hits) {
  const desc = h.obj.board ? `${h.obj.board.length}nodes,msgs:${(h.obj.messages || []).length},status:${h.obj.status}` : `keys:${Object.keys(h.obj).slice(0, 4).join(',')}`
  console.log(` [${h.kind}/${h.id}] ${h.updatedAt} ${h.partial ? '(PARTIAL)' : ''} ${desc}`)
}
console.log('broken/fragment rows:', frags.length)
for (const f of frags) console.log(` [${f.kind}/${f.id}] ${f.updatedAt} len:${f.recordLen} ${f.partial ? '(chain broken)' : ''} head:${f.head.slice(0, 80)}`)
fs.writeFileSync(outPath, JSON.stringify(hits, null, 1))
fs.writeFileSync(outPath.replace(/\.json$/, '-frags.json'), JSON.stringify(frags, null, 1))
console.log('written:', outPath)
