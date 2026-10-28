// 团队知识库（Insights）mock 数据
// category: 需求拆解 | 执行编排 | 复盘沉淀 | 协作规范
export const seedInsights = [
  {
    id: 'in-1', title: '竞品周报的"结论先行"结构模板',
    body: '周报第一屏只放三件事：本周最重要的一个变化、它对我们指标的影响、建议的动作。数据明细全部折叠到附录。按这个结构改写后，周报打开率从 41% 升到 78%。',
    category: '复盘沉淀', updatedAt: '2026-10-24', fromRetro: true,
  },
  {
    id: 'in-2', title: '多 Bot 并行节点的输入隔离原则',
    body: '并行 Bot 共享上游原始输出会导致相互污染。规范：每个并行节点只接收自己 Schema 声明的字段，公共上下文由编排层注入只读副本。该原则上线后纠正率下降 62%。',
    category: '执行编排', updatedAt: '2026-10-22', fromRetro: true,
  },
  {
    id: 'in-3', title: 'PRD 预审用"缺失 / 矛盾 / 不可验证"三分类',
    body: '评审意见不做分类时，研发只看"矛盾"。统一按三类输出并各限 5 条，迫使评审 Bot 排序而非堆砌，平均处理时长从 40 分钟降到 12 分钟。',
    category: '需求拆解', updatedAt: '2026-10-19', fromRetro: false,
  },
  {
    id: 'in-4', title: '敏感内容的"生成前自检"优先于"生成后拦截"',
    body: '内容类节点在 Prompt 尾部追加自检指令（输出前逐条核对敏感词表），比下游拦截返工少一轮。仅对 open-ended 生成节点启用，结构化节点不需要。',
    category: '执行编排', updatedAt: '2026-10-16', fromRetro: false,
  },
  {
    id: 'in-5', title: '纠正消息必须回写节点而不是只进对话',
    body: '早期纠正只记录在对话流里，复盘时无法定位到节点。规范：用户纠正在对话确认的同时双写到目标节点的 corrections 字段，复盘面板按节点聚合。',
    category: '协作规范', updatedAt: '2026-10-11', fromRetro: true,
  },
  {
    id: 'in-6', title: '方法论条目的最小可复用单元',
    body: '沉淀粒度对齐"可被一个 Prompt 改动吸收"的大小。超过一屏的方法论要拆成"原则 + 检查项"两段，检查项可直接进 QA 清单。',
    category: '协作规范', updatedAt: '2026-10-05', fromRetro: false,
  },
]

export const INSIGHT_CATEGORIES = ['需求拆解', '执行编排', '复盘沉淀', '协作规范']
