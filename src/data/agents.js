// Agent mock 数据（版本快照链）
export const agents = [
  {
    id: 'ag-01', name: '数据采集 Bot', category: '研究分析', version: 'v1.8',
    desc: '负责多渠道信息抓取与增量更新，支持站点、API、RSS 三类源。',
    capabilities: ['站点抓取', 'API 接入', 'RSS 订阅', '增量去重'],
    tags: ['采集', '数据源'], tools: 6, skills: 4, rating: 4.8, calls: 1284, owner: '陈其',
    prompt: '你是数据采集专家。按优先级抓取信息源，遇到反爬策略时降级为 RSS，输出结构化 JSON。',
    model: "opus",
    versions: [
      { v: 'v1.8', date: '2026-10-21', note: '新增 RSS 降级策略' },
      { v: 'v1.7', date: '2026-10-08', note: '接入 2 个电商 MCP 工具' },
      { v: 'v1.6', date: '2026-09-19', note: '抓取并发从 4 提到 8' },
    ],
  },
  {
    id: 'ag-02', name: '分析 Bot', category: '研究分析', version: 'v2.3',
    desc: '面向结构化数据做统计、聚类与对比分析，输出带引用的结论。',
    capabilities: ['语义聚类', '对比矩阵', '情感打分'],
    tags: ['分析', '统计'], tools: 4, skills: 5, rating: 4.6, calls: 2310, owner: '李晴',
    prompt: '你是资深数据分析师。结论必须附带数据出处，不确定时明确标注置信度。',
    model: "fable",
    versions: [
      { v: 'v2.3', date: '2026-10-24', note: '情感打分支持中文细分语境' },
      { v: 'v2.2', date: '2026-10-02', note: '聚类数量自适应' },
    ],
  },
  {
    id: 'ag-03', name: '写作 Bot', category: '内容生成', version: 'v3.1',
    desc: '按平台风格改写长文，支持公众号 / 知乎 / X 三套语气模板。',
    capabilities: ['平台改写', '标题生成', '摘要提取', '敏感词过滤'],
    tags: ['内容', '改写'], tools: 2, skills: 6, rating: 4.5, calls: 3120, owner: '王牧',
    prompt: '你是内容编辑。改写保持事实不变，风格对齐目标平台，输出前自检敏感词。',
    model: "sonnet",
    versions: [
      { v: 'v3.1', date: '2026-10-25', note: 'X 线程模板支持 hook 开头' },
      { v: 'v3.0', date: '2026-10-11', note: '新增敏感词三级过滤' },
      { v: 'v2.9', date: '2026-09-27', note: '标题生成接入点击率反馈' },
    ],
  },
  {
    id: 'ag-04', name: '报告 Bot', category: '内容生成', version: 'v1.4',
    desc: '把多路结构化结果汇编为图文报告，支持导出与推送。',
    capabilities: ['图文排版', '多渠道推送'],
    tags: ['报告', '推送'], tools: 3, skills: 3, rating: 4.3, calls: 872, owner: '李晴',
    prompt: '你是报告编辑。按"结论先行"组织章节，图表优先于长表格。',
    model: "sonnet",
    versions: [
      { v: 'v1.4', date: '2026-10-18', note: '支持飞书卡片推送' },
      { v: 'v1.3', date: '2026-09-30', note: '图表配色对齐品牌令牌' },
    ],
  },
  {
    id: 'ag-05', name: 'QA Bot', category: '流程编排', version: 'v2.0',
    desc: '发布检查与回归范围核对，自动关联用例平台。',
    capabilities: ['检查单核对', '用例关联', '配置 Diff'],
    tags: ['质量', '发布'], tools: 5, skills: 2, rating: 4.4, calls: 645, owner: '赵垒',
    prompt: '你是 QA 关口。任何 P0 检查项未通过时阻断流程并要求人工确认。',
    model: "haiku",
    versions: [
      { v: 'v2.0', date: '2026-10-22', note: '新增配置 Diff 扫描' },
      { v: 'v1.9', date: '2026-09-15', note: '用例平台 API 升级' },
    ],
  },
  {
    id: 'ag-06', name: '评审 Bot', category: '研究分析', version: 'v1.2',
    desc: '对 PRD / 方案文档做结构化预审，输出风险与建议清单。',
    capabilities: ['完整性检查', '一致性校验'],
    tags: ['评审', '文档'], tools: 2, skills: 3, rating: 4.1, calls: 402, owner: '陈其',
    prompt: '你是文档评审员。按"缺失 / 矛盾 / 不可验证"三类输出问题，每类不超过 5 条。',
    model: "sonnet",
    versions: [
      { v: 'v1.2', date: '2026-10-05', note: '一致性校验支持术语表' },
    ],
  },
  {
    id: 'ag-07', name: '可视化 Bot', category: '内容生成', version: 'v1.6',
    desc: '根据数据特征自动选型图表，按设计令牌渲染。',
    capabilities: ['图表选型', '品牌配色'],
    tags: ['图表', '设计'], tools: 1, skills: 4, rating: 4.7, calls: 1050, owner: '王牧',
    prompt: '你是数据可视化工程师。图表类型由数据关系决定，配色只用品牌令牌。',
    model: "fable",
    versions: [
      { v: 'v1.6', date: '2026-10-15', note: '支持桑基图' },
      { v: 'v1.5', date: '2026-09-22', note: '接入设计令牌 v2' },
    ],
  },
  {
    id: 'ag-08', name: '流程编排 Bot', category: '流程编排', version: 'v0.9',
    desc: '把自然语言描述的流程编译为可执行工作流草稿。',
    capabilities: ['流程编译', '节点推荐'],
    tags: ['编排', '工作流'], tools: 3, skills: 2, rating: 3.9, calls: 218, owner: '赵垒',
    prompt: '你是流程架构师。编译结果必须可回放，每个节点标注输入输出 Schema。',
    model: "mythos",
    versions: [
      { v: 'v0.9', date: '2026-10-24', note: '节点推荐接入使用频率' },
      { v: 'v0.8', date: '2026-10-03', note: '支持条件分支编译' },
    ],
  },
]

export const AGENT_CATEGORIES = ['研究分析', '内容生成', '流程编排']
