// Market 资源：Workflow / MCP / Skill / Rule（Agent 标签渲染 AgentGrid 卡片）
// status: 正常 | 待发布 | 已下线
// kind: Workflow / MCP / Skill / Rule（Agent 标签页由 AgentGrid 渲染）
export const resources = [
  {
    id: 'wf-weekly', kind: 'Workflow', name: '市场竞品周报生成', author: '李晴', version: 'v2.1',
    status: '正常', rating: 4.6, reuses: 132, tags: ['周报', '竞品'],
    desc: '聚合竞品动态，清洗分析后生成周度报告并推送。',
    versions: [
      { v: 'v2.1', date: '2026-10-20', note: '分析维度支持自定义' },
      { v: 'v2.0', date: '2026-09-28', note: '接入可视化 Bot' },
      { v: 'v1.4', date: '2026-09-02', note: '初始版本' },
    ],
  },
  {
    id: 'wf-prd', kind: 'Workflow', name: 'PRD 需求评审助手', author: '陈其', version: 'v1.3',
    status: '正常', rating: 4.2, reuses: 87, tags: ['评审', 'PRD'],
    desc: '对 PRD 做结构化预审，输出风险清单与建议。',
    versions: [
      { v: 'v1.3', date: '2026-10-12', note: '技术可行性标注接入架构 Bot' },
      { v: 'v1.2', date: '2026-09-16', note: '输出格式重构' },
    ],
  },
  {
    id: 'wf-content', kind: 'Workflow', name: '多平台内容分发', author: '王牧', version: 'v3.2',
    status: '正常', rating: 4.8, reuses: 256, tags: ['内容', '分发'],
    desc: '一篇源稿适配公众号 / 知乎 / X 三个平台并排期。',
    versions: [
      { v: 'v3.2', date: '2026-10-23', note: 'X 线程支持 hook 开头' },
      { v: 'v3.1', date: '2026-10-09', note: '排期对接日历 MCP' },
    ],
  },
  {
    id: 'wf-release', kind: 'Workflow', name: '版本发布检查单', author: '赵垒', version: 'v1.1',
    status: '待发布', rating: 4.0, reuses: 41, tags: ['发布', 'QA'],
    desc: '发布前自动核对检查单并汇总风险。',
    versions: [
      { v: 'v1.1', date: '2026-10-25', note: '新增缓存策略检查项（待确认）' },
    ],
  },
  {
    id: 'rule-tone', kind: 'Rule', name: '品牌语气规范', author: '王牧', version: 'v1.0',
    status: '正常', rating: 4.9, reuses: 187, tags: ['语气', '规范'],
    desc: '约束所有内容生成节点的语气、称谓与禁用词，作为 Prompt 级约束自动注入。',
    versions: [
      { v: 'v1.0', date: '2026-08-30', note: '初始版本' },
      { v: 'v0.9', date: '2026-08-12', note: '试运行版' },
    ],
  },
  {
    id: 'rule-schema', kind: 'Rule', name: '输出结构校验', author: '平台组', version: 'v1.2',
    status: '正常', rating: 4.5, reuses: 342, tags: ['质量', 'Schema'],
    desc: '节点输出前按声明 Schema 校验，不合格自动重试一次并记录失败原因。',
    versions: [
      { v: 'v1.2', date: '2026-10-17', note: '支持嵌套结构校验' },
      { v: 'v1.1', date: '2026-09-24', note: '重试策略可配置' },
    ],
  },
  {
    id: 'rule-adoption', kind: 'Rule', name: '纠正采纳规范', author: '李晴', version: 'v1.0',
    status: '待发布', rating: 4.2, reuses: 58, tags: ['协作', '复盘'],
    desc: '用户纠正意见必须双写节点执行约束与对话流，复盘面板按节点聚合。',
    versions: [{ v: 'v1.0', date: '2026-10-25', note: '申请发布（待确认）' }],
  },
  {
    id: 'rule-pii', kind: 'Rule', name: '敏感信息脱敏', author: '平台组', version: 'v1.1',
    status: '待发布', rating: 4.6, reuses: 76, tags: ['安全', '合规'],
    desc: '输出包含手机号 / 邮箱 / 证件号时自动打码，规则库可扩展。',
    versions: [{ v: 'v1.1', date: '2026-10-10', note: '证件号识别增强' }],
  },
  {
    id: 'mcp-search', kind: 'MCP', name: '网页搜索 MCP', author: '平台组', version: 'v2.4',
    status: '正常', rating: 4.7, reuses: 512, tags: ['搜索', '通用'],
    desc: '联网搜索与网页正文提取，支持区域与语言参数。',
    versions: [
      { v: 'v2.4', date: '2026-10-19', note: '正文提取支持 PDF' },
      { v: 'v2.3', date: '2026-09-25', note: '超时重试策略' },
    ],
  },
  {
    id: 'mcp-feishu', kind: 'MCP', name: '飞书消息 MCP', author: '平台组', version: 'v1.8',
    status: '正常', rating: 4.5, reuses: 389, tags: ['飞书', '通知'],
    desc: '发送飞书文本 / 卡片消息，支持群机器人与个人会话。',
    versions: [
      { v: 'v1.8', date: '2026-10-14', note: '支持交互式卡片回调' },
      { v: 'v1.7', date: '2026-09-20', note: '速率限制自适应' },
    ],
  },
  {
    id: 'mcp-db', kind: 'MCP', name: '数据仓库查询 MCP', author: '平台组', version: 'v0.6',
    status: '待发布', rating: 4.1, reuses: 23, tags: ['数据', 'SQL'],
    desc: '对数仓执行只读 SQL，自动加行数限制与脱敏。',
    versions: [{ v: 'v0.6', date: '2026-10-08', note: '脱敏规则可配置' }],
  },
  {
    id: 'mcp-cal', kind: 'MCP', name: '日历 MCP', author: '李晴', version: 'v1.0',
    status: '待发布', rating: 3.8, reuses: 12, tags: ['日历', '排期'],
    desc: '读写日历日程，用于内容排期与会议提醒。',
    versions: [{ v: 'v1.0', date: '2026-10-24', note: '申请发布（待确认）' }],
  },
  {
    id: 'sk-rewrite', kind: 'Skill', name: '平台风格改写', author: '王牧', version: 'v3.0',
    status: '正常', rating: 4.8, reuses: 274, tags: ['改写', '内容'],
    desc: '按公众号 / 知乎 / X 三套语气模板改写长文，内置敏感词自检。',
    versions: [
      { v: 'v3.0', date: '2026-10-16', note: '新增 X 线程模板' },
      { v: 'v2.8', date: '2026-09-29', note: '语气参数化' },
    ],
  },
  {
    id: 'sk-chart', kind: 'Skill', name: '图表规范选型', author: '王牧', version: 'v1.5',
    status: '正常', rating: 4.6, reuses: 158, tags: ['图表', '设计'],
    desc: '按数据关系（趋势 / 占比 / 关系 / 分布）自动选图表类型并对齐设计令牌。',
    versions: [{ v: 'v1.5', date: '2026-10-06', note: '对齐品牌令牌 v2' }],
  },
  {
    id: 'sk-cluster', kind: 'Skill', name: '反馈语义聚类', author: '李晴', version: 'v2.2',
    status: '正常', rating: 4.4, reuses: 96, tags: ['分析', 'NLP'],
    desc: '对开放文本反馈做语义聚类，输出主题簇与代表性引语。',
    versions: [
      { v: 'v2.2', date: '2026-10-13', note: '簇数量自适应' },
      { v: 'v2.1', date: '2026-09-18', note: '支持中英混合' },
    ],
  },
  {
    id: 'sk-checklist', kind: 'Skill', name: '发布检查单核对', author: '赵垒', version: 'v1.1',
    status: '待发布', rating: 4.0, reuses: 31, tags: ['QA', '清单'],
    desc: '逐项核对发布检查单，P0 项未过自动阻断。',
    versions: [{ v: 'v1.1', date: '2026-10-21', note: '阻断策略可配置' }],
  },
  {
    id: 'sp-analyst', kind: 'SystemPrompt', name: '分析师通用 System Prompt', author: '李晴', version: 'v1.2',
    status: '正常', rating: 4.3, reuses: 0, tags: ['Prompt'],
    desc: '（边界用例：SystemPrompt 类型资源不应在任何标签展示）',
    versions: [{ v: 'v1.2', date: '2026-10-01', note: '增加置信度标注要求' }],
  },
]

export const RESOURCE_TYPES = ['Workflow', 'MCP', 'Skill']

export const attachmentPool = [
  { name: '竞品截图-0930.png', size: '1.2 MB' },
  { name: 'Q3 用户反馈样本.xlsx', size: '356 KB' },
  { name: '品牌配色令牌 v2.json', size: '4 KB' },
  { name: '周报模板-10月.docx', size: '88 KB' },
  { name: 'PRD-会员体系-v3.pdf', size: '2.1 MB' },
]



// ===== 各类型资源详情数据 =====

// Workflow: 只读预览（模型生成 + Agent 串联，不支持画布编排）
export const workflowDetails = {
  "wf-weekly": {
    summary: "聚合竞品动态，清洗分析后生成周度报告并推送。由 3 个 Agent 串联 + 1 个人工审查点。",
    agents: ["数据采集 Bot", "数据清洗 Bot", "分析 Bot", "可视化 Bot", "报告 Bot"],
    nodes: [
      { id: "n1", lane: "input", name: "收集竞品动态", agent: "数据采集 Bot" },
      { id: "n2", lane: "core", name: "竞品数据清洗", agent: "数据清洗 Bot" },
      { id: "n3", lane: "core", name: "多维度对比分析", agent: "分析 Bot" },
      { id: "n3r", lane: "core", name: "人工审查：对比结论", agent: "用户审查" },
      { id: "n4", lane: "core", name: "图表生成", agent: "可视化 Bot" },
      { id: "n5", lane: "output", name: "生成周报并推送", agent: "报告 Bot" }
    ],
    edges: [["n1","n2"],["n2","n3"],["n3","n3r"],["n3r","n4"],["n4","n5"]],
    // 历史版本的内容快照：切换版本时详情按此渲染
    byVersion: {
      "v2.0": {
        summary: "聚合竞品动态，清洗分析后生成周度报告并推送。v2.0 接入可视化 Bot 自动生成图表，尚未引入人工审查点。",
        agents: ["数据采集 Bot", "数据清洗 Bot", "分析 Bot", "可视化 Bot", "报告 Bot"],
        nodes: [
          { id: "n1", lane: "input", name: "收集竞品动态", agent: "数据采集 Bot" },
          { id: "n2", lane: "core", name: "竞品数据清洗", agent: "数据清洗 Bot" },
          { id: "n3", lane: "core", name: "多维度对比分析", agent: "分析 Bot" },
          { id: "n4", lane: "core", name: "图表生成", agent: "可视化 Bot" },
          { id: "n5", lane: "output", name: "生成周报并推送", agent: "报告 Bot" }
        ],
        edges: [["n1","n2"],["n2","n3"],["n3","n4"],["n4","n5"]]
      },
      "v1.4": {
        summary: "初版流程：采集竞品动态后由分析 Bot 直接产出周报。图表生成与人工审查均为后续版本引入。",
        agents: ["数据采集 Bot", "分析 Bot", "报告 Bot"],
        nodes: [
          { id: "n1", lane: "input", name: "收集竞品动态", agent: "数据采集 Bot" },
          { id: "n3", lane: "core", name: "多维度对比分析", agent: "分析 Bot" },
          { id: "n5", lane: "output", name: "生成周报并推送", agent: "报告 Bot" }
        ],
        edges: [["n1","n3"],["n3","n5"]]
      }
    }
  },
  "wf-prd": {
    summary: "对 PRD 做结构化预审，输出风险清单与建议。2 个 Agent + 1 个人工审查点。",
    agents: ["文档解析 Bot", "评审 Bot", "架构 Bot", "报告 Bot"],
    nodes: [
      { id: "n1", lane: "input", name: "解析 PRD 文档", agent: "文档解析 Bot" },
      { id: "n2", lane: "core", name: "逻辑完整性检查", agent: "评审 Bot" },
      { id: "n3", lane: "core", name: "人工审查：技术可行性", agent: "用户审查" },
      { id: "n4", lane: "output", name: "输出评审意见", agent: "报告 Bot" }
    ],
    edges: [["n1","n2"],["n2","n3"],["n3","n4"]]
  },
  "wf-content": {
    summary: "一篇源稿适配公众号/知乎/X 三平台并排期。并行分支：3 个改写节点同时执行。",
    agents: ["内容助理 Bot", "写作 Bot", "发布 Bot"],
    nodes: [
      { id: "n1", lane: "input", name: "接收源稿", agent: "内容助理 Bot" },
      { id: "n2", lane: "core", name: "公众号版改写", agent: "写作 Bot" },
      { id: "n3", lane: "core", name: "知乎版改写", agent: "写作 Bot" },
      { id: "n4", lane: "core", name: "X 短文版改写", agent: "写作 Bot" },
      { id: "n5", lane: "output", name: "排期与发布", agent: "发布 Bot" }
    ],
    edges: [["n1","n2"],["n1","n3"],["n1","n4"],["n2","n5"],["n3","n5"],["n4","n5"]]
  },
  "wf-release": {
    summary: "发布前自动核对检查单并汇总风险。并行核对：回归范围 + 配置差异同时执行。",
    agents: ["文档解析 Bot", "QA Bot", "报告 Bot"],
    nodes: [
      { id: "n1", lane: "input", name: "读取发布单", agent: "文档解析 Bot" },
      { id: "n2", lane: "core", name: "核对回归范围", agent: "QA Bot" },
      { id: "n3", lane: "core", name: "扫描配置差异", agent: "QA Bot" },
      { id: "n4", lane: "output", name: "汇总发布风险", agent: "报告 Bot" }
    ],
    edges: [["n1","n2"],["n1","n3"],["n2","n4"],["n3","n4"]]
  }
}

// Agent: MCP/Skill/Tools/Rule 选择 + System Prompt
export const agentDetails = {
  "ag-01": {
    systemPrompt: "你是数据采集专家。按优先级抓取信息源，遇到反爬策略时降级为 RSS，输出结构化 JSON。",
    mcps: [{ id: "mcp-search", name: "网页搜索 MCP", status: "已接入" }, { id: "mcp-feishu", name: "飞书消息 MCP", status: "已接入" }, { id: "mcp-db", name: "数据仓库查询 MCP", status: "待接入" }],
    skills: [{ id: "sk-cluster", name: "反馈语义聚类", status: "已启用" }, { id: "sk-rewrite", name: "平台风格改写", status: "待启用" }],
    tools: [{ name: "web_search", desc: "执行网页搜索", params: "query, limit, region" }, { name: "fetch_url", desc: "抓取网页正文", params: "url, format" }, { name: "parse_rss", desc: "解析 RSS 订阅", params: "feed_url, max_items" }],
    rules: ["品牌语气规范", "输出结构校验"]
  },
  "ag-02": {
    systemPrompt: "你是资深数据分析师。结论必须附带数据出处，不确定时明确标注置信度。",
    mcps: [{ id: "mcp-db", name: "数据仓库查询 MCP", status: "已接入" }],
    skills: [{ id: "sk-chart", name: "图表规范选型", status: "已启用" }],
    tools: [{ name: "query_db", desc: "执行 SQL 查询", params: "sql, limit" }],
    rules: ["输出结构校验"]
  },
  "ag-03": {
    systemPrompt: "你是内容编辑。改写保持事实不变，风格对齐目标平台，输出前自检敏感词。",
    mcps: [{ id: "mcp-feishu", name: "飞书消息 MCP", status: "已接入" }],
    skills: [{ id: "sk-rewrite", name: "平台风格改写", status: "已启用" }],
    tools: [{ name: "rewrite_text", desc: "按风格模板改写文本", params: "text, platform, tone" }, { name: "check_sensitive", desc: "敏感词检测", params: "text, level" }, { name: "generate_title", desc: "生成标题", params: "content, platform" }],
    rules: ["品牌语气规范", "敏感信息脱敏"]
  },
  "ag-04": {
    systemPrompt: "你是报告编辑。按结论先行组织章节，图表优先于长表格。",
    mcps: [{ id: "mcp-feishu", name: "飞书消息 MCP", status: "已接入" }],
    skills: [],
    tools: [{ name: "generate_report", desc: "生成图文报告", params: "data, template" }],
    rules: ["品牌语气规范"]
  },
  "ag-05": {
    systemPrompt: "你是 QA 关口。任何 P0 检查项未通过时阻断流程并要求人工确认。",
    mcps: [{ id: "mcp-db", name: "数据仓库查询 MCP", status: "已接入" }],
    skills: [{ id: "sk-checklist", name: "发布检查单核对", status: "已启用" }],
    tools: [{ name: "run_check", desc: "执行检查项", params: "checklist_id" }],
    rules: ["输出结构校验"]
  },
  "ag-06": {
    systemPrompt: "你是文档评审员。按缺失/矛盾/不可验证三类输出问题。",
    mcps: [], skills: [], tools: [{ name: "review_doc", desc: "评审文档", params: "doc_type" }],
    rules: ["输出结构校验"]
  },
  "ag-07": {
    systemPrompt: "你是数据可视化工程师。图表类型由数据关系决定。",
    mcps: [], skills: [{ id: "sk-chart", name: "图表规范选型", status: "已启用" }],
    tools: [{ name: "render_chart", desc: "渲染图表", params: "data, type" }],
    rules: ["品牌语气规范"]
  },
  "ag-08": {
    systemPrompt: "你是流程架构师。编译结果必须可回放。",
    mcps: [], skills: [], tools: [{ name: "compile_flow", desc: "编译流程", params: "description" }],
    rules: []
  }
}

export const mcpDetails = {
  "mcp-search": {
    // 核心配置参数
    server_name: "web-search",
    type: "http",
    url: "https://mcp.internal/web-search",
    command: null,
    args: [],
    env: { API_KEY: "***" },
    headers: { Authorization: "Bearer ***" },
    // 权限与安全参数
    allowedTools: ["web_search", "fetch_url", "parse_rss"],
    disabledTools: ["delete_cache"],
    alwaysAllow: ["web_search"],
    credentials: "api-key",
    // 其他可选参数
    timeout: 30000,
    initTimeout: 10000,
    disabled: false,
    instructions: "执行网页搜索和内容抓取。优先使用 web_search，需要全文时用 fetch_url。",
    description: "网页搜索与内容抓取服务",
    tools: [
      { name: "web_search", desc: "执行网页搜索，返回标题+摘要+链接", params: [
        { name: "query", type: "string", required: true, desc: "搜索关键词" },
        { name: "limit", type: "number", required: false, desc: "结果数量上限（默认 10）" },
        { name: "region", type: "string", required: false, desc: "区域代码，如 CN/US" }
      ]},
      { name: "fetch_url", desc: "抓取指定 URL 的正文内容", params: [
        { name: "url", type: "string", required: true, desc: "目标 URL" },
        { name: "format", type: "string", required: false, desc: "输出格式：text/markdown/html" }
      ]},
      { name: "parse_rss", desc: "解析 RSS/Atom 订阅源", params: [
        { name: "feed_url", type: "string", required: true, desc: "RSS 地址" },
        { name: "max_items", type: "number", required: false, desc: "最大条目数（默认 20）" }
      ]}
    ]
  },
  "mcp-feishu": {
    server_name: "feishu",
    type: "stdio",
    command: "npx",
    args: ["-y", "@feishu/mcp-server"],
    env: { FEISHU_APP_ID: "***", FEISHU_APP_SECRET: "***" },
    url: null,
    headers: {},
    allowedTools: ["send_message", "upload_file"],
    disabledTools: ["delete_chat"],
    alwaysAllow: [],
    credentials: "env",
    timeout: 30000,
    initTimeout: 10000,
    disabled: false,
    instructions: "飞书消息和文件操作。send_message 支持富文本卡片。",
    description: "飞书消息推送与文件管理",
    tools: [
      { name: "send_message", desc: "发送飞书消息到群或个人", params: [
        { name: "chat_id", type: "string", required: true, desc: "会话 ID" },
        { name: "content", type: "string", required: true, desc: "消息内容（支持富文本）" }
      ]},
      { name: "upload_file", desc: "上传文件到飞书文件夹", params: [
        { name: "file_path", type: "string", required: true, desc: "本地文件路径" },
        { name: "folder_id", type: "string", required: true, desc: "目标文件夹 ID" }
      ]}
    ]
  },
  "mcp-db": {
    server_name: "dw-query",
    type: "http",
    url: "https://mcp.internal/dw-query",
    command: null,
    args: [],
    env: {},
    headers: { Authorization: "Bearer ***" },
    allowedTools: ["run_query"],
    disabledTools: ["drop_table"],
    alwaysAllow: [],
    credentials: "api-key",
    timeout: 60000,
    initTimeout: 15000,
    disabled: false,
    instructions: "只读 SQL 查询。始终带 LIMIT，输出前自动脱敏手机号与证件号。",
    description: "数据仓库只读查询服务",
    tools: [
      { name: "run_query", desc: "执行只读 SQL，自动加行数限制与脱敏", params: [
        { name: "sql", type: "string", required: true, desc: "只读 SELECT 语句" },
        { name: "limit", type: "number", required: false, desc: "返回行数上限（默认 100）" },
        { name: "mask", type: "boolean", required: false, desc: "是否脱敏敏感列（默认 true）" }
      ]},
      { name: "list_tables", desc: "列出可用数据表与字段", params: [
        { name: "schema", type: "string", required: false, desc: "Schema 名称（默认 default）" }
      ]}
    ]
  },
  "mcp-cal": {
    server_name: "calendar",
    type: "stdio",
    command: "npx",
    args: ["-y", "@tools/calendar-mcp"],
    env: { CAL_TOKEN: "***" },
    url: null,
    headers: {},
    allowedTools: ["list_events", "create_event"],
    disabledTools: ["delete_event"],
    alwaysAllow: ["list_events"],
    credentials: "env",
    timeout: 20000,
    initTimeout: 8000,
    disabled: false,
    instructions: "日历读写。创建日程需带时区，冲突时返回相邻日程。",
    description: "日历日程读写服务",
    tools: [
      { name: "list_events", desc: "查询时间段内的日程", params: [
        { name: "from", type: "string", required: true, desc: "开始时间（ISO 8601）" },
        { name: "to", type: "string", required: true, desc: "结束时间（ISO 8601）" }
      ]},
      { name: "create_event", desc: "创建日程并邀请参与人", params: [
        { name: "title", type: "string", required: true, desc: "日程标题" },
        { name: "from", type: "string", required: true, desc: "开始时间" },
        { name: "to", type: "string", required: true, desc: "结束时间" },
        { name: "attendees", type: "array", required: false, desc: "参与人列表" }
      ]}
    ]
  }
}

export const skillDetails = {
  "sk-rewrite": {
    tree: [
      { type: "dir", name: "prompts", children: [
        { type: "file", name: "wechat.md", content: "# 公众号风格模板\n\n## 语气要求\n- 专业但亲和\n- 避免网络用语\n\n## 结构\n1. 开头钩子（1-2 句）\n2. 核心观点（3-5 段）\n3. 行动号召（CTA）\n\n## 字数\n1500-2500 字" },
        { type: "file", name: "zhihu.md", content: "# 知乎风格模板\n\n## 语气要求\n- 理性、有论据\n- 适当使用数据和案例\n\n## 结构\n1. 问题切入\n2. 分层论证\n3. 总结建议\n\n## 字数\n800-1500 字" },
        { type: "file", name: "x-twitter.md", content: "# X/Twitter 风格模板\n\n## 语气要求\n- 简洁有力\n- Hook 开头\n\n## 格式\n- 线程：每条 ≤280 字\n- 首条含 Hook + 关键数据" }
      ]},
      { type: "dir", name: "rules", children: [
        { type: "file", name: "tone-rules.md", content: "# 语气规则\n\n## 禁止\n- 绝对化用语\n- 未经验证的数据\n- 敏感话题涉及\n\n## 必须\n- 事实准确\n- 出处标注" }
      ]},
      { type: "file", name: "skill.yaml", content: "name: platform-rewrite\nversion: 3.0.0\ndescription: 按平台风格改写长文\nentry: prompts/wechat.md\nparams:\n  - platform: [wechat, zhihu, x]\n  - tone: [formal, casual]\n  - max_words: integer" }
    ],
    // 历史版本的文件树快照（v2.8 尚无 X 线程模板与语气规则）
    byVersion: {
      "v2.8": {
        tree: [
          { type: "dir", name: "prompts", children: [
            { type: "file", name: "wechat.md", content: "# 公众号风格模板（v2.8）\n\n## 语气要求\n- 专业但亲和\n\n## 结构\n1. 开头钩子\n2. 核心观点\n3. 行动号召\n\n## 字数\n1500-2500 字" },
            { type: "file", name: "zhihu.md", content: "# 知乎风格模板（v2.8）\n\n## 语气要求\n- 理性、有论据\n\n## 结构\n1. 问题切入\n2. 分层论证\n3. 总结建议" }
          ]},
          { type: "file", name: "skill.yaml", content: "name: platform-rewrite\nversion: 2.8.0\ndescription: 按平台风格改写长文\nentry: prompts/wechat.md\nparams:\n  - platform: [wechat, zhihu]\n  - tone: [formal, casual]" }
        ]
      }
    }
  },
  "sk-chart": {
    tree: [
      { type: "dir", name: "templates", children: [
        { type: "file", name: "grouped-bar.md", content: "# 分组条形图模板\n\n适用：多维度对比\nX 轴：维度\nY 轴：数值\n分组：竞品/时间" },
        { type: "file", name: "heatmap.md", content: "# 热力图模板\n\n适用：变化幅度矩阵\n色阶：品牌蓝（单色渐变）\n标注：异常值" }
      ]},
      { type: "file", name: "skill.yaml", content: "name: chart-selection\nversion: 1.5.0\ndescription: 按数据关系选图表类型\nrules:\n  - trend -> line\n  - comparison -> grouped-bar" }
    ]
  }
}

// Rule: Markdown 内容
export const ruleDetails = {
  "rule-tone": {
    content: "# 品牌语气规范\n\n## 适用范围\n所有内容生成节点在输出文本前必须遵守本规范。\n\n## 语气定义\n- **专业但亲和**：像一位经验丰富的同事在交流\n- **简洁有力**：一句话能说清的不用两句\n- **数据说话**：结论必须有数据支撑\n\n## 禁用表达\n- 绝对化用语：最好、唯一、绝对、100%\n- 空洞套话：赋能、抓手（除非上下文需要）\n- 未经验证的断言\n\n## 称谓规范\n- 对用户称\"你\"，不用\"您\"\n- 对第三方公司用全称",
    byVersion: {
      "v0.9": {
        content: "# 品牌语气规范（试运行）\n\n## 语气定义\n- 专业但亲和\n- 简洁有力\n\n## 禁用表达\n- 绝对化用语：最好、唯一、100%\n\n> 试运行版：仅覆盖语气与禁用词；称谓规范与出处要求为 v1.0 补充。"
      }
    }
  },
  "rule-schema": {
    content: "# 输出结构校验\n\n## 校验时机\n节点输出前，Agent 必须自检输出是否符合声明的 Schema。\n\n## 校验规则\n1. 必填字段不能缺失\n2. 类型匹配（string/number/boolean/array/object）\n3. 数值范围校验（min/max）\n4. 枚举值校验\n\n## 失败处理\n- 第 1 次失败：自动重试，补充错误上下文到 prompt\n- 第 2 次失败：标记节点为\"待确认\"，转人工"
  },
  "rule-adoption": {
    content: "# 纠正采纳规范\n\n## 双写原则\n每条纠正必须同时写入：\n1. **目标节点**的 corrections 字段（用于复盘聚合）\n2. **对话流**（用于上下文回溯）\n\n## 采纳判定\n- Agent 下次执行到该节点时，自动读取 corrections 并应用\n- 已采纳的纠正在复盘中显示为\"已采纳\"\n- 未采纳的纠正在待办中生成\"复核纠正\"条目"
  },
  "rule-pii": {
    content: "# 敏感信息脱敏\n\n## 脱敏规则\n| 类型 | 规则 | 示例 |\n|------|------|------|\n| 手机号 | 保留前3后4 | 138****1234 |\n| 邮箱 | 保留首字母+域名 | j***@company.com |\n| 证件号 | 保留前6后3 | 110***123 |\n\n## 豁免规则\n- 内部员工工号可不脱敏\n- 已公开信息可不脱敏"
  }
}
