// MCP 全链路实测：client 连接 → listTools → callTool → 配置入库（真实 stdio 往返）
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const store = require('../electron/store.cjs')
const McpManager = require('../electron/mcp.cjs')

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowpilot-mcp-'))
  store.init(dir)
  const mcp = new McpManager()
  const cfg = {
    name: 'test-mcp', type: 'stdio',
    command: process.execPath, args: [path.join(__dirname, 'mcp-test-server.cjs')], env: {},
  }

  const tools = await mcp.sync(cfg)
  console.log('TOOLS', tools.map((t) => `${t.name}(${Object.keys(t.inputSchema?.properties || {}).length} 参数)`).join(', '))

  const r = await mcp.callTool('test-mcp', 'web_search', { query: '竞品 定价', topK: 2 })
  console.log('CALL', JSON.stringify(r).slice(0, 160))

  const id = store.saveMcpServer({ ...cfg, tools })
  const row = store.getMcpServer(id)
  console.log('SAVED', row.name, 'type=' + row.type, 'tools=' + JSON.parse(row.tools).length)

  await mcp.disconnect('test-mcp')
  const pass = tools.length === 2
    && tools.some((t) => t.name === 'web_search')
    && JSON.stringify(r).includes('竞品')
    && JSON.parse(row.tools).length === 2
  console.log(pass ? 'MCP_SMOKE_OK' : 'MCP_SMOKE_FAIL')
  process.exit(pass ? 0 : 1)
}
main().catch((e) => { console.error('MCP_SMOKE_FAIL', e.message); process.exit(1) })
