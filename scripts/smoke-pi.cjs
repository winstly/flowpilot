// pi 链路贯通实测：读本机真实配置（不外泄 Token），验证两层接法
// 层1 provider：pi-ai streamSimple 真实对话   层2 循环：pi-agent-core agentLoop 一个完整 turn
const { DatabaseSync } = require('node:sqlite')
const path = require('node:path')

async function collect(stream, dump) {
  const events = []
  if (typeof stream[Symbol.asyncIterator] === 'function') {
    for await (const ev of stream) {
      events.push(ev)
      if (dump) console.log('  ev:', JSON.stringify(ev).slice(0, 140))
    }
  }
  const result = typeof stream.result === 'function' ? await stream.result() : events.at(-1)
  return { events, result }
}

async function main() {
  const dbPath = path.join(process.env.APPDATA, 'FlowPilot', 'flowpilot.db')
  const db = new DatabaseSync(dbPath, { readOnly: true })
  const row = db.prepare('SELECT base_url, api_key, models FROM app_config WHERE id = 1').get()
  const models = JSON.parse(row.models || '{}')
  const modelId = models.main || Object.values(models).find(Boolean)
  if (!row.base_url || !row.api_key || !modelId) throw new Error('配置不完整：需要 Base URL / API Token / 至少一个模型')
  console.log('配置加载：base=%s  model=%s  token=***%s(len %d)', row.base_url, modelId, row.api_key.slice(-3), row.api_key.length)

  const openaiMod = await import('@earendil-works/pi-ai/api/openai-completions')
  const anthropicMod = await import('@earendil-works/pi-ai/api/anthropic-messages')
  const mkModel = (api, baseUrl) => ({
    id: modelId, name: modelId, api,
    provider: api === 'anthropic-messages' ? 'anthropic' : 'openai',
    baseUrl, input: ['text'], reasoning: false,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  })
  const bases = [...new Set([row.base_url.replace(/\/+$/, ''), row.base_url.replace(/\/+$/, '').endsWith('/v1') ? row.base_url.replace(/\/+$/, '').slice(0, -3) : row.base_url.replace(/\/+$/, '') + '/v1'])]
  const combos = []
  for (const b of bases) { combos.push(['openai-completions', openaiMod, b]); combos.push(['anthropic-messages', anthropicMod, b]) }

  // ---------- 层1：provider 直连 ----------
  let win = null
  for (const [apiName, api, base] of combos) {
    const t0 = Date.now()
    try {
      const model = mkModel(apiName, base)
      const stream = api.streamSimple(
        model,
        { messages: [{ role: 'user', content: '只回复两个字：正常', timestamp: Date.now() }] },
        { apiKey: row.api_key, maxTokens: 16 },
      )
      const { result } = await collect(stream, true)
      if (result?.stopReason === 'error' || result?.errorMessage) {
        console.log('✗ %s @ %s 流内错误 (%dms)：%s', apiName, base, Date.now() - t0, String(result.errorMessage || result.error || '').slice(0, 300))
        continue
      }
      const text = (result?.content || []).map((c) => c.text || '').join('')
      console.log('✓ 层1 provider 直连成功：%s @ %s (%dms)：%s', apiName, base, Date.now() - t0, text || JSON.stringify(result).slice(0, 160))
      win = { apiName, api, base }
      break
    } catch (e) {
      console.log('✗ %s @ %s → %s', apiName, base, String(e.message || e).slice(0, 100))
    }
  }
  if (!win) throw new Error('所有 (api, baseUrl) 组合均失败')

  // ---------- 层2：agentLoop 完整 turn ----------
  const { agentLoop } = await import('@earendil-works/pi-agent-core')
  const model = mkModel(win.apiName, win.base)
  const streamFn = (m, ctx, opts) => win.api.streamSimple(m, ctx, opts)
  const t1 = Date.now()
  const stream = agentLoop(
    [{ role: 'user', content: '你是一个任务子代理。只回复四个字：链路贯通', timestamp: Date.now() }],
    { messages: [], tools: [] },
    { model, apiKey: row.api_key, maxTokens: 16, convertToLlm: (messages) => messages },
    undefined,
    streamFn,
  )
  const { result } = await collect(stream)
  const assistant = (Array.isArray(result) ? result : []).find((m) => m.role === 'assistant')
  if (!assistant || assistant.stopReason === 'error' || assistant.errorMessage) {
    console.log('✗ 层2 流内错误：%s', String(assistant?.errorMessage || '').slice(0, 300))
    process.exit(1)
  }
  console.log('✓ 层2 agentLoop turn 成功 (%dms)：%s', Date.now() - t1, (assistant.content || []).map((c) => c.text || '').join(''))
  console.log('SMOKE_OK %s @ %s', win.apiName, win.base)
}

main().then(() => process.exit(0)).catch((e) => { console.error('SMOKE_FAIL', e.message); process.exit(1) })
