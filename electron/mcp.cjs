// MCP 客户端管理：@modelcontextprotocol/client —— 连真服务器、拉真工具、调工具
// 传输：stdio（command/args/env）· http（StreamableHTTP）· sse；连接池常驻供后续子 Agent 挂工具
class McpManager {
  constructor() {
    this.pool = new Map() // serverName → { client, transport, tools }
  }

  #transportFor(cfg) {
    const type = cfg.type || 'stdio'
    if (type === 'stdio') {
      const { StdioClientTransport } = require('@modelcontextprotocol/client/stdio')
      return new StdioClientTransport({
        command: cfg.command,
        args: cfg.args || [],
        env: { ...process.env, ...(cfg.env || {}) },
        stderr: 'ignore',
      })
    }
    const common = { requestInit: { headers: cfg.headers || {} } }
    const url = new URL(cfg.url)
    if (type === 'sse') {
      const { SSEClientTransport } = require('@modelcontextprotocol/client')
      return new SSEClientTransport(url, common)
    }
    const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/client')
    return new StreamableHTTPClientTransport(url, common)
  }

  /** 连接并 listTools；同名连接先关旧的。返回工具清单 */
  async sync(cfg) {
    await this.disconnect(cfg.name)
    const { Client } = require('@modelcontextprotocol/client')
    const client = new Client({ name: 'flowpilot', version: '1.0.0' })
    const transport = this.#transportFor(cfg)
    await client.connect(transport)
    const { tools } = await client.listTools()
    const list = (tools || []).map((t) => ({
      name: t.name,
      description: t.description || '',
      inputSchema: t.inputSchema || { type: 'object', properties: {} },
    }))
    this.pool.set(cfg.name, { client, transport, tools: list })
    return list
  }

  /** 调用工具（连接必须先 sync 建立） */
  async callTool(serverName, toolName, args = {}) {
    const conn = this.pool.get(serverName)
    if (!conn) throw new Error(`MCP 服务器「${serverName}」未连接，请先同步工具`)
    if (!conn.tools.some((t) => t.name === toolName)) throw new Error(`工具「${toolName}」不在「${serverName}」的清单里`)
    return await conn.client.callTool({ name: toolName, arguments: args })
  }

  async disconnect(name) {
    const conn = this.pool.get(name)
    if (!conn) return false
    this.pool.delete(name)
    try { await conn.client.close() } catch { /* 进程可能已退出 */ }
    return true
  }
}

module.exports = McpManager
