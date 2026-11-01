// 验证台 MCP 服务器（@modelcontextprotocol/server + stdio）：两个真实工具
const { McpServer } = require('@modelcontextprotocol/server')
const { StdioServerTransport } = require('@modelcontextprotocol/server/stdio')
const { z } = require('zod')

const server = new McpServer({ name: 'flowpilot-test', version: '1.0.0' })

server.registerTool('web_search', {
  title: '网页搜索',
  description: '按关键词搜索网页，返回结果摘要',
  inputSchema: z.object({ query: z.string().describe('搜索关键词'), topK: z.number().optional().describe('返回条数') }),
}, async ({ query, topK }) => ({
  content: [{ type: 'text', text: `「${query}」共 ${topK || 3} 条结果：1) 竞品 A 定价下调 12% 2) 竞品 B 新增分销渠道 3) 竞品 C 无变化` }],
}))

server.registerTool('read_page', {
  title: '读取网页',
  description: '按 URL 读取网页正文摘要',
  inputSchema: z.object({ url: z.string().describe('网页地址') }),
}, async ({ url }) => ({
  content: [{ type: 'text', text: `${url} 的正文摘要：该页为竞品定价页，记录了三档套餐与近 30 天价格变动。` }],
}))

server.connect(new StdioServerTransport()).catch((e) => { console.error(e); process.exit(1) })
