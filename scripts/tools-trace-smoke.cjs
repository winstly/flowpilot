// 全链路实测：文件工具真实落盘 + 执行记录(思考/工具调用) + 菱形并行时间戳 + 主 Agent 对话
// 真实模型调用，读本机真实配置（不外泄 Token）。
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const { DatabaseSync } = require('node:sqlite')
const store = require('../electron/store.cjs')
const AgentHost = require('../electron/agent-host.cjs')

// 临时库目录（含真实凭据副本）：结束/失败都要清掉，不留在 %TEMP%
// Windows 偶发句柄占用 EPERM：清理失败不掩盖冒烟结论（下次手动清即可）
let tmpDir = null
const cleanup = () => {
  if (!tmpDir) return
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch { console.log('CLEANUP SKIP（句柄占用）:', tmpDir) }
  tmpDir = null
}

async function main() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowpilot-tools-smoke-'))
  const dir = tmpDir
  const workdir = path.join(dir, 'work')
  store.init(dir)
  const realDb = new DatabaseSync(path.join(process.env.APPDATA, 'FlowPilot', 'flowpilot.db'), { readOnly: true })
  const cfg = realDb.prepare('SELECT * FROM app_config WHERE id = 1').get()
  store.save({ base_url: cfg.base_url, api_key: cfg.api_key, models: JSON.parse(cfg.models) })

  const t0 = Date.now()
  const ts = () => `[${((Date.now() - t0) / 1000).toFixed(1)}s]`
  const timeline = []
  const host = new AgentHost(store, (ev) => {
    timeline.push({ ...ev, _t: Date.now() - t0 })
    if (ev.type === 'node_trace') {
      console.log(ts(), 'trace      ', ev.nodeId, ev.item.t, String(ev.item.name || ev.item.text || '').slice(0, 50))
    } else {
      console.log(ts(), ev.type.padEnd(11), ev.nodeId || '', ev.status || '', (ev.output || '').slice(0, 40))
    }
  })

  // 菱形图：a 落交付文件 → b/c 并行 → d 汇合
  const nodes = [
    { id: 'a', name: '生成 index.html 交付物', agent: '交付 Bot', lane: 'input' },
    { id: 'b', name: '校验页面结构', agent: '校验 Bot', lane: 'core' },
    { id: 'c', name: '提炼三个卖点', agent: '分析 Bot', lane: 'core' },
    { id: 'd', name: '汇合输出交付总结', agent: '汇总 Bot', lane: 'output' },
  ]
  const edges = [['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd']]
  const goal = '在工作目录生成一份 FlowPilot 产品介绍页 index.html（含标题与三个核心卖点）'

  const r = host.start({ title: goal, goal, dir: workdir, nodes, edges })
  if (!r.ok) throw new Error(r.message)
  const result = await r.done
  console.log(ts(), 'RUN_RESULT', JSON.stringify(result))

  // ---------- 断言 ----------
  // 1) 交付物真实落盘
  const filesOnDisk = fs.existsSync(workdir)
    ? fs.readdirSync(workdir).filter((f) => fs.statSync(path.join(workdir, f)).isFile())
    : []
  console.log('WORKDIR', workdir, '→', filesOnDisk.join(', ') || '(空)')

  // 2) 执行记录：工具调用 + 思考/文本 至少各一类
  const nodeEnds = timeline.filter((e) => e.type === 'node_end')
  const aEnd = nodeEnds.find((e) => e.nodeId === 'a')
  const traceItems = nodeEnds.flatMap((e) => e.trace || [])
  const kinds = [...new Set(traceItems.map((x) => x.t))]
  console.log('TRACE kinds =', kinds.join(','), '| items =', traceItems.length, '| a.files =', JSON.stringify(aEnd?.files || []))

  // 3) 并行：b/c 在任一者结束前都已启动
  const idx = (pred) => timeline.findIndex(pred)
  const bStart = idx((e) => e.type === 'node_start' && e.nodeId === 'b')
  const cStart = idx((e) => e.type === 'node_start' && e.nodeId === 'c')
  const bEnd = idx((e) => e.type === 'node_end' && e.nodeId === 'b')
  const cEnd = idx((e) => e.type === 'node_end' && e.nodeId === 'c')
  const overlap = bStart < bEnd && cStart < bEnd && bStart < cEnd && cStart < cEnd
  const tB = timeline.find((e) => e.type === 'node_start' && e.nodeId === 'b')?._t
  const tC = timeline.find((e) => e.type === 'node_start' && e.nodeId === 'c')?._t
  const tBE = timeline.find((e) => e.type === 'node_end' && e.nodeId === 'b')?._t
  const tCE = timeline.find((e) => e.type === 'node_end' && e.nodeId === 'c')?._t
  console.log(`PARALLEL b[${tB}→${tBE}ms] c[${tC}→${tCE}ms] overlap=`, overlap)

  // 4) 主 Agent 对话真回应
  const chat = await host.chat({ goal, board: [], message: '页面配色统一用品牌蓝，不要红绿对比' })
  console.log('CHAT', JSON.stringify(chat).slice(0, 300))

  const pass =
    result.status === 'done' && result.failed === 0 &&
    filesOnDisk.length > 0 &&
    (aEnd?.files || []).length > 0 &&
    kinds.includes('tool') &&
    overlap &&
    chat.ok && !!chat.text
  console.log('ASSERT files=', filesOnDisk.length, 'traceKinds=', kinds.join('/'), 'parallel=', overlap, 'chat=', chat.ok)
  cleanup()
  console.log(pass ? 'SMOKE_OK' : 'SMOKE_FAIL')
  process.exit(pass ? 0 : 1)
}

main().catch((e) => { cleanup(); console.error('SMOKE_FAIL', e.message); process.exit(1) })
