// 纯逻辑冒烟（无模型调用）：
// 1) function-tool 入参流式抽取 —— {"text":"…"} 只上屏字符串值，转义正确，不漏 JSON 骨架
// 2) 流程图增量比对 —— lane 漂移不重置、变更节点连带下游重置、同图重绘零重跑
const assert = require('node:assert')
const { jsonFieldExtractor } = require('../electron/agent-host.cjs')

async function main() {
  // —— 1. jsonFieldExtractor（respond 工具入参 {"text":"…"} 的增量抽取）——
  {
    const out = []
    const feed = jsonFieldExtractor('text', (d) => out.push(d))
    const full = '{"text":"你好\\n**世界**"}'
    for (const ch of full) feed(ch) // 逐字符模拟 toolcall_delta 分片
    assert.strictEqual(out.join(''), '你好\n**世界**', `应只抽出 text 值，实际：${JSON.stringify(out.join(''))}`)
    console.log('✅ 工具入参流式抽取：只上屏 text 值，转义正确')
  }
  {
    const out = []
    const feed = jsonFieldExtractor('text', (d) => out.push(d))
    const full = '{"text":"说 \\"你好\\" 收到"}'
    for (const ch of full) feed(ch)
    assert.strictEqual(out.join(''), '说 "你好" 收到', `转义引号应还原，实际：${JSON.stringify(out.join(''))}`)
    console.log('✅ 工具入参流式抽取：转义引号还原')
  }
  {
    const out = []
    const feed = jsonFieldExtractor('text', (d) => out.push(d))
    '{"name":"不相关","text":"正文"}'.split('').forEach(feed) // 首键不是 text 也能定位
    assert.strictEqual(out.join(''), '正文', '应按字段名定位，不受前序键干扰')
    console.log('✅ 工具入参流式抽取：按字段名定位')
  }

  // —— 2. mergeBoard 增量比对 ——
  const { mergeBoard } = await import('../src/lib/graphDiff.js')
  const baseNodes = [
    { id: 'n1', name: '理解任务目标', agent: '理解 Bot', lane: 'input' },
    { id: 'n2', name: '执行核心工作', agent: '执行 Bot', lane: 'core' },
    { id: 'n3', name: '汇总结论产出', agent: '汇总 Bot', lane: 'output' },
  ]
  const baseEdges = [['n1', 'n2'], ['n2', 'n3']]
  // 跑完一轮的板子
  const doneBoard = baseNodes.map((n) => ({ ...n, status: 'done', output: `${n.name}产出`, duration: '1s', corrections: 0 }))

  // 2a. 同图重绘：全部复用，零重置（此前 doneAll 全量重跑的根因场景）
  {
    const { board, reuseIds } = mergeBoard(doneBoard, baseNodes, baseEdges, baseEdges)
    assert.strictEqual(reuseIds.length, 3, '同图重绘应 3 个全复用')
    assert.ok(board.every((n) => n.status === 'done' && n.output), '复用节点运行结果必须原样保留')
    console.log('✅ 增量比对：同图重绘零重置（不再全量重执行）')
  }
  // 2b. lane 漂移（normalizePlan 每轮强制 input/output）：仍全复用，只跟新图 lane
  {
    const drifted = [
      { ...baseNodes[0], lane: 'core' },
      { ...baseNodes[1], lane: 'input' },
      { ...baseNodes[2], lane: 'output' },
    ]
    const { board, reuseIds } = mergeBoard(doneBoard, drifted, baseEdges, baseEdges)
    assert.strictEqual(reuseIds.length, 3, `lane 漂移不应重置节点，实际重置 ${3 - reuseIds.length} 个`)
    assert.strictEqual(board[1].lane, 'input', '复用节点 layout lane 应跟新图')
    console.log('✅ 增量比对：lane 漂移不误判变更（签名剔除展示字段）')
  }
  // 2c. 改 n2 名称：n2 + 下游 n3 重置，n1 复用
  {
    const changed = [baseNodes[0], { ...baseNodes[1], name: '执行核心工作（改）' }, baseNodes[2]]
    const { board, reuseIds } = mergeBoard(doneBoard, changed, baseEdges, baseEdges)
    assert.deepStrictEqual(reuseIds, ['n1'], '仅 n1 复用')
    assert.ok(board.find((n) => n.id === 'n2').status === 'idle', '变更节点重置')
    assert.ok(board.find((n) => n.id === 'n3').status === 'idle', '下游连带重置')
    console.log('✅ 增量比对：变更节点 + 下游重置，无关分支复用')
  }
  // 2d. 纯改连线（加 n1→n3 直连）：输入变了的节点必须重跑，输入没变的照常复用
  {
    const rewired = [['n1', 'n2'], ['n1', 'n3'], ['n2', 'n3']]
    const { board, reuseIds } = mergeBoard(doneBoard, baseNodes, rewired, baseEdges)
    assert.deepStrictEqual(reuseIds, ['n1', 'n2'], '只有 n3 的上游集合变了，n1/n2 复用')
    assert.ok(board.find((n) => n.id === 'n3').status === 'idle', '输入变化的节点重置')
    console.log('✅ 增量比对：纯改连线时输入变化节点重跑')
  }
  console.log('ALL PASS')
}

main().catch((e) => { console.error('FAIL:', e.message); process.exit(1) })
