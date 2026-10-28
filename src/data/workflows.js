// 工作流定义（含节点 mock 运行态 + 连线）
// lane: input 首节点✦ / core 处理 Bot / output 尾节点✓
// edges: [from, to] 显式连线，支持并行分支（Dify 式画布布局）
export const workflows = [
  {
    id: 'wf-weekly',
    name: '市场竞品周报生成',
    category: '流程编排',
    desc: '聚合竞品动态，清洗分析后生成周度报告并推送',
    edges: [['n1', 'n2'], ['n2', 'n3'], ['n3', 'n3r'], ['n3r', 'n4'], ['n4', 'n5']],
    nodes: [
      { id: 'n1', lane: 'input', name: '收集竞品动态', agent: '数据采集 Bot', status: 'done', duration: '2m 14s',
        events: [
          { t: 'think', text: '周报要最新动态，优先抓官网 changelog 与定价页，RSS 作降级补充。' },
          { t: 'tool', kind: 'MCP', name: '网页搜索 MCP', args: 'query="竞品 定价 变更" · 近 7 天', ms: '3.2s', result: '返回 14 条结果，去重后 9 条有效' },
          { t: 'tool', kind: 'MCP', name: '飞书消息 MCP', args: '读取「竞品动态」频道近 7 天消息', ms: '1.1s', result: '拉取 23 条' },
          { t: 'text', text: '共扫描 12 个信息源，抓取 47 条更新，去重后保留 31 条待清洗。' },
        ],
      },
      { id: 'n2', lane: 'core', name: '竞品数据清洗', agent: '数据清洗 Bot', status: 'done', duration: '1m 02s',
        events: [
          { t: 'shell', name: 'clean.py', cmd: 'python clean.py --src raw/ --dedupe --min-confidence 0.8', ms: '2.8s', result: 'exit 0 · 保留 31 条，剔除 4 条低置信' },
          { t: 'think', text: '剔除的 4 条均来自转载源，与一手信息重复，不影响覆盖面。' },
          { t: 'text', text: '清洗完成：31 条规范化记录已写入下游输入。' },
        ],
      },
      { id: 'n3', lane: 'core', name: '多维度对比分析', agent: '分析 Bot', status: 'done', duration: '1m 45s',
        events: [
          { t: 'think', text: '按定价 / 渠道 / 功能三维建矩阵，逐项填充并标注变化幅度。' },
          { t: 'skill', name: '图表规范选型', args: '数据关系=对比 · 品牌=FlowPilot', ms: '0.9s', result: '推荐：分组条形图 + 对比矩阵表' },
          { t: 'tool', kind: 'MCP', name: '数据仓库查询 MCP', args: 'SELECT plan, price FROM competitors', ms: '2.1s', result: '12 行 · 86ms' },
          { t: 'text', text: '关键发现：竞品 A 定价下调 12%，竞品 B 新增 2 个分销渠道，竞品 C 无功能变化。' },
        ],
      },
      { id: 'n3r', lane: 'core', type: 'review', name: '人工审查：对比结论', agent: '用户审查', status: 'pending', duration: '待审查',
        review: {
          report: '对比矩阵已完成：竞品 A 定价下调 12% 并新增年付方案；竞品 B 新增 2 个分销渠道；竞品 C 本期无功能变化。建议图表按"定价 / 渠道 / 功能"三维度呈现。',
          questions: [
            { id: 'q1', q: '对比结论是否采信，可进入图表生成？', options: ['采信，按当前结论继续', '采信，但需补充竞品 D 数据', '不采信，重新抓取分析'], answer: null },
          ],
        },
        log: ['对比矩阵已提交人工审查', '等待审查结论…'],
        events: [
          { t: 'text', text: '对比矩阵已提交人工审查，等待审查结论…' },
        ],
      },
            { id: 'n4', lane: 'core', name: '深度循环分析', agent: '分析 Bot', status: 'done', duration: '4m 32s',
        events: [
        {
                t: "think",
                text: "开始深度分析竞品 A 降价策略。需要从定价、转化、用户行为、竞争格局四个维度展开，每个维度需要多轮数据采集和交叉验证。预计需要 100+ 步操作。"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "数据仓库查询 MCP",
                args: "初始化分析环境 · 加载竞品 A 全维度历史数据",
                ms: "2.3s",
                result: "数据集加载完成 · 1,247 行 × 23 列"
        },
        {
                t: "skill",
                name: "图表规范选型",
                args: "分析类型=深度归因 · 受众=战略决策层",
                ms: "0.6s",
                result: "分析框架：MECE + Porter 五力 + 价值链"
        },
        {
                t: "text",
                text: "分析框架已加载。开始 100 轮深度循环分析……"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "网页搜索 MCP",
                args: "轮次 1 · 转化漏斗 · 采集 27 个数据点 · 时间窗 第 1 周",
                ms: "2.3s",
                result: "采集完成 · 27 条记录 · 异常值 0 条已标记"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "飞书消息 MCP",
                args: "轮次 2 · 用户行为 · 采集 49 个数据点 · 时间窗 第 1 周",
                ms: "2.1s",
                result: "采集完成 · 49 条记录 · 异常值 0 条已标记"
        },
        {
                t: "shell",
                name: "analysis-round-3",
                cmd: "analyze --dimension \"竞争格局\" --round 3 --data-points 35 --method \"bayesian-inference\" --confidence 0.95",
                ms: "3.9s",
                result: "exit 0 · 轮次 3 分析完成 · 置信度 95% · 发现 3 个显著信号"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "网页搜索 MCP",
                args: "轮次 4 · 渠道效率 · 采集 49 个数据点 · 时间窗 第 1 周",
                ms: "2.3s",
                result: "采集完成 · 49 条记录 · 异常值 2 条已标记"
        },
        {
                t: "think",
                text: "第 5 轮 品牌声量 分析发现：价格弹性系数出现结构性变化。需要在第 6 轮调整分析假设。"
        },
        {
                t: "shell",
                name: "analysis-round-6",
                cmd: "analyze --dimension \"财务影响\" --round 6 --data-points 24 --method \"bayesian-inference\" --confidence 0.95",
                ms: "3.9s",
                result: "exit 0 · 轮次 6 分析完成 · 置信度 95% · 发现 3 个显著信号"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "网页搜索 MCP",
                args: "轮次 7 · 风险评估 · 采集 44 个数据点 · 时间窗 第 1 周",
                ms: "2.1s",
                result: "采集完成 · 44 条记录 · 异常值 0 条已标记"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "飞书消息 MCP",
                args: "轮次 8 · 定价分析 · 采集 36 个数据点 · 时间窗 第 1 周",
                ms: "2.4s",
                result: "采集完成 · 36 条记录 · 异常值 1 条已标记"
        },
        {
                t: "shell",
                name: "analysis-round-9",
                cmd: "analyze --dimension \"转化漏斗\" --round 9 --data-points 36 --method \"bayesian-inference\" --confidence 0.95",
                ms: "1.7s",
                result: "exit 0 · 轮次 9 分析完成 · 置信度 95% · 发现 1 个显著信号"
        },
        {
                t: "think",
                text: "第 10 轮 用户行为 分析发现：价格弹性系数出现结构性变化。需要在第 11 轮调整分析假设。"
        },
        {
                t: "text",
                text: "【阶段结论 · 第 10 轮】用户行为维度分析完成。累计处理 150 个数据点，识别出 3 个核心驱动因素。当前分析进度 10%，预计还需 90 轮完成全部维度交叉验证。"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "飞书消息 MCP",
                args: "轮次 11 · 竞争格局 · 采集 28 个数据点 · 时间窗 第 2 周",
                ms: "1.9s",
                result: "采集完成 · 28 条记录 · 异常值 2 条已标记"
        },
        {
                t: "shell",
                name: "analysis-round-12",
                cmd: "analyze --dimension \"渠道效率\" --round 12 --data-points 58 --method \"bayesian-inference\" --confidence 0.95",
                ms: "3.8s",
                result: "exit 0 · 轮次 12 分析完成 · 置信度 95% · 发现 3 个显著信号"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "网页搜索 MCP",
                args: "轮次 13 · 品牌声量 · 采集 51 个数据点 · 时间窗 第 2 周",
                ms: "0.8s",
                result: "采集完成 · 51 条记录 · 异常值 1 条已标记"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "飞书消息 MCP",
                args: "轮次 14 · 财务影响 · 采集 44 个数据点 · 时间窗 第 2 周",
                ms: "1.1s",
                result: "采集完成 · 44 条记录 · 异常值 2 条已标记"
        },
        {
                t: "shell",
                name: "analysis-round-15",
                cmd: "analyze --dimension \"风险评估\" --round 15 --data-points 57 --method \"bayesian-inference\" --confidence 0.95",
                ms: "1.2s",
                result: "exit 0 · 轮次 15 分析完成 · 置信度 95% · 发现 3 个显著信号"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "网页搜索 MCP",
                args: "轮次 16 · 定价分析 · 采集 14 个数据点 · 时间窗 第 2 周",
                ms: "1.6s",
                result: "采集完成 · 14 条记录 · 异常值 1 条已标记"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "飞书消息 MCP",
                args: "轮次 17 · 转化漏斗 · 采集 51 个数据点 · 时间窗 第 2 周",
                ms: "2.1s",
                result: "采集完成 · 51 条记录 · 异常值 2 条已标记"
        },
        {
                t: "shell",
                name: "analysis-round-18",
                cmd: "analyze --dimension \"用户行为\" --round 18 --data-points 13 --method \"bayesian-inference\" --confidence 0.95",
                ms: "2.7s",
                result: "exit 0 · 轮次 18 分析完成 · 置信度 95% · 发现 2 个显著信号"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "网页搜索 MCP",
                args: "轮次 19 · 竞争格局 · 采集 39 个数据点 · 时间窗 第 2 周",
                ms: "2.0s",
                result: "采集完成 · 39 条记录 · 异常值 0 条已标记"
        },
        {
                t: "think",
                text: "第 20 轮 渠道效率 分析发现：价格弹性系数出现结构性变化。需要在第 21 轮调整分析假设。"
        },
        {
                t: "text",
                text: "【阶段结论 · 第 20 轮】渠道效率维度分析完成。累计处理 300 个数据点，识别出 4 个核心驱动因素。当前分析进度 20%，预计还需 80 轮完成全部维度交叉验证。"
        },
        {
                t: "ask",
                text: "第 20 轮阶段性确认",
                questions: [{
                        id: "q-20",
                        q: "已完成 20% 分析。目前识别出的核心驱动因素为渠道效率。是否继续深挖该维度？",
                        options: ["继续深挖，扩大数据范围", "跳过，进入下一维度", "调整分析方向"],
                        answer: null
                }]
        },
        {
                t: "shell",
                name: "analysis-round-21",
                cmd: "analyze --dimension \"品牌声量\" --round 21 --data-points 50 --method \"bayesian-inference\" --confidence 0.95",
                ms: "3.0s",
                result: "exit 0 · 轮次 21 分析完成 · 置信度 95% · 发现 3 个显著信号"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "网页搜索 MCP",
                args: "轮次 22 · 财务影响 · 采集 23 个数据点 · 时间窗 第 3 周",
                ms: "1.3s",
                result: "采集完成 · 23 条记录 · 异常值 2 条已标记"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "飞书消息 MCP",
                args: "轮次 23 · 风险评估 · 采集 24 个数据点 · 时间窗 第 3 周",
                ms: "0.6s",
                result: "采集完成 · 24 条记录 · 异常值 0 条已标记"
        },
        {
                t: "shell",
                name: "analysis-round-24",
                cmd: "analyze --dimension \"定价分析\" --round 24 --data-points 58 --method \"bayesian-inference\" --confidence 0.95",
                ms: "1.6s",
                result: "exit 0 · 轮次 24 分析完成 · 置信度 95% · 发现 1 个显著信号"
        },
        {
                t: "think",
                text: "第 25 轮 转化漏斗 分析发现：价格弹性系数出现结构性变化。需要在第 26 轮调整分析假设。"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "飞书消息 MCP",
                args: "轮次 26 · 用户行为 · 采集 17 个数据点 · 时间窗 第 3 周",
                ms: "2.3s",
                result: "采集完成 · 17 条记录 · 异常值 1 条已标记"
        },
        {
                t: "shell",
                name: "analysis-round-27",
                cmd: "analyze --dimension \"竞争格局\" --round 27 --data-points 59 --method \"bayesian-inference\" --confidence 0.95",
                ms: "2.8s",
                result: "exit 0 · 轮次 27 分析完成 · 置信度 95% · 发现 3 个显著信号"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "网页搜索 MCP",
                args: "轮次 28 · 渠道效率 · 采集 33 个数据点 · 时间窗 第 3 周",
                ms: "1.2s",
                result: "采集完成 · 33 条记录 · 异常值 1 条已标记"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "飞书消息 MCP",
                args: "轮次 29 · 品牌声量 · 采集 12 个数据点 · 时间窗 第 3 周",
                ms: "1.7s",
                result: "采集完成 · 12 条记录 · 异常值 1 条已标记"
        },
        {
                t: "shell",
                name: "analysis-round-30",
                cmd: "analyze --dimension \"财务影响\" --round 30 --data-points 40 --method \"bayesian-inference\" --confidence 0.95",
                ms: "3.3s",
                result: "exit 0 · 轮次 30 分析完成 · 置信度 95% · 发现 3 个显著信号"
        },
        {
                t: "text",
                text: "【阶段结论 · 第 30 轮】财务影响维度分析完成。累计处理 450 个数据点，识别出 5 个核心驱动因素。当前分析进度 30%，预计还需 70 轮完成全部维度交叉验证。"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "网页搜索 MCP",
                args: "轮次 31 · 风险评估 · 采集 43 个数据点 · 时间窗 第 4 周",
                ms: "0.5s",
                result: "采集完成 · 43 条记录 · 异常值 1 条已标记"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "飞书消息 MCP",
                args: "轮次 32 · 定价分析 · 采集 24 个数据点 · 时间窗 第 4 周",
                ms: "1.1s",
                result: "采集完成 · 24 条记录 · 异常值 0 条已标记"
        },
        {
                t: "shell",
                name: "analysis-round-33",
                cmd: "analyze --dimension \"转化漏斗\" --round 33 --data-points 57 --method \"bayesian-inference\" --confidence 0.95",
                ms: "3.6s",
                result: "exit 0 · 轮次 33 分析完成 · 置信度 95% · 发现 3 个显著信号"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "网页搜索 MCP",
                args: "轮次 34 · 用户行为 · 采集 44 个数据点 · 时间窗 第 4 周",
                ms: "0.9s",
                result: "采集完成 · 44 条记录 · 异常值 2 条已标记"
        },
        {
                t: "think",
                text: "第 35 轮 竞争格局 分析发现：价格弹性系数出现结构性变化。需要在第 36 轮调整分析假设。"
        },
        {
                t: "shell",
                name: "analysis-round-36",
                cmd: "analyze --dimension \"渠道效率\" --round 36 --data-points 14 --method \"bayesian-inference\" --confidence 0.95",
                ms: "3.7s",
                result: "exit 0 · 轮次 36 分析完成 · 置信度 95% · 发现 2 个显著信号"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "网页搜索 MCP",
                args: "轮次 37 · 品牌声量 · 采集 52 个数据点 · 时间窗 第 4 周",
                ms: "0.6s",
                result: "采集完成 · 52 条记录 · 异常值 2 条已标记"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "飞书消息 MCP",
                args: "轮次 38 · 财务影响 · 采集 47 个数据点 · 时间窗 第 4 周",
                ms: "1.4s",
                result: "采集完成 · 47 条记录 · 异常值 1 条已标记"
        },
        {
                t: "shell",
                name: "analysis-round-39",
                cmd: "analyze --dimension \"风险评估\" --round 39 --data-points 20 --method \"bayesian-inference\" --confidence 0.95",
                ms: "1.3s",
                result: "exit 0 · 轮次 39 分析完成 · 置信度 95% · 发现 2 个显著信号"
        },
        {
                t: "think",
                text: "第 40 轮 定价分析 分析发现：价格弹性系数出现结构性变化。需要在第 41 轮调整分析假设。"
        },
        {
                t: "text",
                text: "【阶段结论 · 第 40 轮】定价分析维度分析完成。累计处理 600 个数据点，识别出 6 个核心驱动因素。当前分析进度 40%，预计还需 60 轮完成全部维度交叉验证。"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "飞书消息 MCP",
                args: "轮次 41 · 转化漏斗 · 采集 17 个数据点 · 时间窗 第 5 周",
                ms: "1.3s",
                result: "采集完成 · 17 条记录 · 异常值 1 条已标记"
        },
        {
                t: "shell",
                name: "analysis-round-42",
                cmd: "analyze --dimension \"用户行为\" --round 42 --data-points 18 --method \"bayesian-inference\" --confidence 0.95",
                ms: "2.5s",
                result: "exit 0 · 轮次 42 分析完成 · 置信度 95% · 发现 3 个显著信号"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "网页搜索 MCP",
                args: "轮次 43 · 竞争格局 · 采集 30 个数据点 · 时间窗 第 5 周",
                ms: "0.7s",
                result: "采集完成 · 30 条记录 · 异常值 2 条已标记"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "飞书消息 MCP",
                args: "轮次 44 · 渠道效率 · 采集 27 个数据点 · 时间窗 第 5 周",
                ms: "0.7s",
                result: "采集完成 · 27 条记录 · 异常值 1 条已标记"
        },
        {
                t: "shell",
                name: "analysis-round-45",
                cmd: "analyze --dimension \"品牌声量\" --round 45 --data-points 31 --method \"bayesian-inference\" --confidence 0.95",
                ms: "3.8s",
                result: "exit 0 · 轮次 45 分析完成 · 置信度 95% · 发现 2 个显著信号"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "网页搜索 MCP",
                args: "轮次 46 · 财务影响 · 采集 52 个数据点 · 时间窗 第 5 周",
                ms: "0.7s",
                result: "采集完成 · 52 条记录 · 异常值 1 条已标记"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "飞书消息 MCP",
                args: "轮次 47 · 风险评估 · 采集 34 个数据点 · 时间窗 第 5 周",
                ms: "0.5s",
                result: "采集完成 · 34 条记录 · 异常值 1 条已标记"
        },
        {
                t: "shell",
                name: "analysis-round-48",
                cmd: "analyze --dimension \"定价分析\" --round 48 --data-points 22 --method \"bayesian-inference\" --confidence 0.95",
                ms: "1.3s",
                result: "exit 0 · 轮次 48 分析完成 · 置信度 95% · 发现 1 个显著信号"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "网页搜索 MCP",
                args: "轮次 49 · 转化漏斗 · 采集 30 个数据点 · 时间窗 第 5 周",
                ms: "2.4s",
                result: "采集完成 · 30 条记录 · 异常值 2 条已标记"
        },
        {
                t: "think",
                text: "第 50 轮 用户行为 分析发现：价格弹性系数出现结构性变化。需要在第 51 轮调整分析假设。"
        },
        {
                t: "text",
                text: "【阶段结论 · 第 50 轮】用户行为维度分析完成。累计处理 750 个数据点，识别出 7 个核心驱动因素。当前分析进度 50%，预计还需 50 轮完成全部维度交叉验证。"
        },
        {
                t: "shell",
                name: "analysis-round-51",
                cmd: "analyze --dimension \"竞争格局\" --round 51 --data-points 54 --method \"bayesian-inference\" --confidence 0.95",
                ms: "2.1s",
                result: "exit 0 · 轮次 51 分析完成 · 置信度 95% · 发现 1 个显著信号"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "网页搜索 MCP",
                args: "轮次 52 · 渠道效率 · 采集 15 个数据点 · 时间窗 第 6 周",
                ms: "1.5s",
                result: "采集完成 · 15 条记录 · 异常值 1 条已标记"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "飞书消息 MCP",
                args: "轮次 53 · 品牌声量 · 采集 46 个数据点 · 时间窗 第 6 周",
                ms: "1.4s",
                result: "采集完成 · 46 条记录 · 异常值 0 条已标记"
        },
        {
                t: "shell",
                name: "analysis-round-54",
                cmd: "analyze --dimension \"财务影响\" --round 54 --data-points 49 --method \"bayesian-inference\" --confidence 0.95",
                ms: "3.4s",
                result: "exit 0 · 轮次 54 分析完成 · 置信度 95% · 发现 2 个显著信号"
        },
        {
                t: "think",
                text: "第 55 轮 风险评估 分析发现：价格弹性系数出现结构性变化。需要在第 56 轮调整分析假设。"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "飞书消息 MCP",
                args: "轮次 56 · 定价分析 · 采集 29 个数据点 · 时间窗 第 6 周",
                ms: "1.2s",
                result: "采集完成 · 29 条记录 · 异常值 2 条已标记"
        },
        {
                t: "shell",
                name: "analysis-round-57",
                cmd: "analyze --dimension \"转化漏斗\" --round 57 --data-points 32 --method \"bayesian-inference\" --confidence 0.95",
                ms: "1.1s",
                result: "exit 0 · 轮次 57 分析完成 · 置信度 95% · 发现 3 个显著信号"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "网页搜索 MCP",
                args: "轮次 58 · 用户行为 · 采集 11 个数据点 · 时间窗 第 6 周",
                ms: "1.1s",
                result: "采集完成 · 11 条记录 · 异常值 2 条已标记"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "飞书消息 MCP",
                args: "轮次 59 · 竞争格局 · 采集 29 个数据点 · 时间窗 第 6 周",
                ms: "1.5s",
                result: "采集完成 · 29 条记录 · 异常值 0 条已标记"
        },
        {
                t: "shell",
                name: "analysis-round-60",
                cmd: "analyze --dimension \"渠道效率\" --round 60 --data-points 16 --method \"bayesian-inference\" --confidence 0.95",
                ms: "2.6s",
                result: "exit 0 · 轮次 60 分析完成 · 置信度 95% · 发现 2 个显著信号"
        },
        {
                t: "text",
                text: "【阶段结论 · 第 60 轮】渠道效率维度分析完成。累计处理 900 个数据点，识别出 8 个核心驱动因素。当前分析进度 60%，预计还需 40 轮完成全部维度交叉验证。"
        },
        {
                t: "ask",
                text: "第 60 轮方向确认",
                questions: [{
                        id: "q-60",
                        q: "发现竞品 B 的渠道 ROI 在第 55 周出现反转（从 1.8x 降至 0.9x）。是否需要重点分析这个异常？",
                        options: ["重点分析，追查原因", "记录但不深挖", "作为噪声忽略"],
                        answer: null
                }]
        },
        {
                t: "tool",
                kind: "MCP",
                name: "网页搜索 MCP",
                args: "轮次 61 · 品牌声量 · 采集 52 个数据点 · 时间窗 第 7 周",
                ms: "2.2s",
                result: "采集完成 · 52 条记录 · 异常值 2 条已标记"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "飞书消息 MCP",
                args: "轮次 62 · 财务影响 · 采集 10 个数据点 · 时间窗 第 7 周",
                ms: "1.4s",
                result: "采集完成 · 10 条记录 · 异常值 2 条已标记"
        },
        {
                t: "shell",
                name: "analysis-round-63",
                cmd: "analyze --dimension \"风险评估\" --round 63 --data-points 41 --method \"bayesian-inference\" --confidence 0.95",
                ms: "1.7s",
                result: "exit 0 · 轮次 63 分析完成 · 置信度 95% · 发现 3 个显著信号"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "网页搜索 MCP",
                args: "轮次 64 · 定价分析 · 采集 55 个数据点 · 时间窗 第 7 周",
                ms: "2.2s",
                result: "采集完成 · 55 条记录 · 异常值 2 条已标记"
        },
        {
                t: "think",
                text: "第 65 轮 转化漏斗 分析发现：价格弹性系数出现结构性变化。需要在第 66 轮调整分析假设。"
        },
        {
                t: "shell",
                name: "analysis-round-66",
                cmd: "analyze --dimension \"用户行为\" --round 66 --data-points 11 --method \"bayesian-inference\" --confidence 0.95",
                ms: "1.9s",
                result: "exit 0 · 轮次 66 分析完成 · 置信度 95% · 发现 3 个显著信号"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "网页搜索 MCP",
                args: "轮次 67 · 竞争格局 · 采集 59 个数据点 · 时间窗 第 7 周",
                ms: "1.3s",
                result: "采集完成 · 59 条记录 · 异常值 2 条已标记"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "飞书消息 MCP",
                args: "轮次 68 · 渠道效率 · 采集 27 个数据点 · 时间窗 第 7 周",
                ms: "2.2s",
                result: "采集完成 · 27 条记录 · 异常值 1 条已标记"
        },
        {
                t: "shell",
                name: "analysis-round-69",
                cmd: "analyze --dimension \"品牌声量\" --round 69 --data-points 10 --method \"bayesian-inference\" --confidence 0.95",
                ms: "3.6s",
                result: "exit 0 · 轮次 69 分析完成 · 置信度 95% · 发现 3 个显著信号"
        },
        {
                t: "think",
                text: "第 70 轮 财务影响 分析发现：价格弹性系数出现结构性变化。需要在第 71 轮调整分析假设。"
        },
        {
                t: "text",
                text: "【阶段结论 · 第 70 轮】财务影响维度分析完成。累计处理 1050 个数据点，识别出 9 个核心驱动因素。当前分析进度 70%，预计还需 30 轮完成全部维度交叉验证。"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "飞书消息 MCP",
                args: "轮次 71 · 风险评估 · 采集 11 个数据点 · 时间窗 第 8 周",
                ms: "0.7s",
                result: "采集完成 · 11 条记录 · 异常值 0 条已标记"
        },
        {
                t: "shell",
                name: "analysis-round-72",
                cmd: "analyze --dimension \"定价分析\" --round 72 --data-points 34 --method \"bayesian-inference\" --confidence 0.95",
                ms: "3.5s",
                result: "exit 0 · 轮次 72 分析完成 · 置信度 95% · 发现 1 个显著信号"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "网页搜索 MCP",
                args: "轮次 73 · 转化漏斗 · 采集 13 个数据点 · 时间窗 第 8 周",
                ms: "1.2s",
                result: "采集完成 · 13 条记录 · 异常值 0 条已标记"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "飞书消息 MCP",
                args: "轮次 74 · 用户行为 · 采集 17 个数据点 · 时间窗 第 8 周",
                ms: "2.3s",
                result: "采集完成 · 17 条记录 · 异常值 2 条已标记"
        },
        {
                t: "shell",
                name: "analysis-round-75",
                cmd: "analyze --dimension \"竞争格局\" --round 75 --data-points 25 --method \"bayesian-inference\" --confidence 0.95",
                ms: "3.5s",
                result: "exit 0 · 轮次 75 分析完成 · 置信度 95% · 发现 2 个显著信号"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "网页搜索 MCP",
                args: "轮次 76 · 渠道效率 · 采集 40 个数据点 · 时间窗 第 8 周",
                ms: "2.5s",
                result: "采集完成 · 40 条记录 · 异常值 0 条已标记"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "飞书消息 MCP",
                args: "轮次 77 · 品牌声量 · 采集 35 个数据点 · 时间窗 第 8 周",
                ms: "1.7s",
                result: "采集完成 · 35 条记录 · 异常值 0 条已标记"
        },
        {
                t: "shell",
                name: "analysis-round-78",
                cmd: "analyze --dimension \"财务影响\" --round 78 --data-points 32 --method \"bayesian-inference\" --confidence 0.95",
                ms: "3.7s",
                result: "exit 0 · 轮次 78 分析完成 · 置信度 95% · 发现 1 个显著信号"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "网页搜索 MCP",
                args: "轮次 79 · 风险评估 · 采集 33 个数据点 · 时间窗 第 8 周",
                ms: "1.9s",
                result: "采集完成 · 33 条记录 · 异常值 1 条已标记"
        },
        {
                t: "think",
                text: "第 80 轮 定价分析 分析发现：价格弹性系数出现结构性变化。需要在第 81 轮调整分析假设。"
        },
        {
                t: "text",
                text: "【阶段结论 · 第 80 轮】定价分析维度分析完成。累计处理 1200 个数据点，识别出 10 个核心驱动因素。当前分析进度 80%，预计还需 20 轮完成全部维度交叉验证。"
        },
        {
                t: "shell",
                name: "analysis-round-81",
                cmd: "analyze --dimension \"转化漏斗\" --round 81 --data-points 34 --method \"bayesian-inference\" --confidence 0.95",
                ms: "1.2s",
                result: "exit 0 · 轮次 81 分析完成 · 置信度 95% · 发现 1 个显著信号"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "网页搜索 MCP",
                args: "轮次 82 · 用户行为 · 采集 30 个数据点 · 时间窗 第 9 周",
                ms: "2.2s",
                result: "采集完成 · 30 条记录 · 异常值 1 条已标记"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "飞书消息 MCP",
                args: "轮次 83 · 竞争格局 · 采集 42 个数据点 · 时间窗 第 9 周",
                ms: "2.5s",
                result: "采集完成 · 42 条记录 · 异常值 0 条已标记"
        },
        {
                t: "shell",
                name: "analysis-round-84",
                cmd: "analyze --dimension \"渠道效率\" --round 84 --data-points 32 --method \"bayesian-inference\" --confidence 0.95",
                ms: "2.8s",
                result: "exit 0 · 轮次 84 分析完成 · 置信度 95% · 发现 3 个显著信号"
        },
        {
                t: "think",
                text: "第 85 轮 品牌声量 分析发现：价格弹性系数出现结构性变化。需要在第 86 轮调整分析假设。"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "飞书消息 MCP",
                args: "轮次 86 · 财务影响 · 采集 27 个数据点 · 时间窗 第 9 周",
                ms: "1.8s",
                result: "采集完成 · 27 条记录 · 异常值 1 条已标记"
        },
        {
                t: "shell",
                name: "analysis-round-87",
                cmd: "analyze --dimension \"风险评估\" --round 87 --data-points 34 --method \"bayesian-inference\" --confidence 0.95",
                ms: "2.4s",
                result: "exit 0 · 轮次 87 分析完成 · 置信度 95% · 发现 2 个显著信号"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "网页搜索 MCP",
                args: "轮次 88 · 定价分析 · 采集 34 个数据点 · 时间窗 第 9 周",
                ms: "1.3s",
                result: "采集完成 · 34 条记录 · 异常值 0 条已标记"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "飞书消息 MCP",
                args: "轮次 89 · 转化漏斗 · 采集 48 个数据点 · 时间窗 第 9 周",
                ms: "0.8s",
                result: "采集完成 · 48 条记录 · 异常值 1 条已标记"
        },
        {
                t: "shell",
                name: "analysis-round-90",
                cmd: "analyze --dimension \"用户行为\" --round 90 --data-points 16 --method \"bayesian-inference\" --confidence 0.95",
                ms: "2.1s",
                result: "exit 0 · 轮次 90 分析完成 · 置信度 95% · 发现 2 个显著信号"
        },
        {
                t: "text",
                text: "【阶段结论 · 第 90 轮】用户行为维度分析完成。累计处理 1350 个数据点，识别出 11 个核心驱动因素。当前分析进度 90%，预计还需 10 轮完成全部维度交叉验证。"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "网页搜索 MCP",
                args: "轮次 91 · 竞争格局 · 采集 27 个数据点 · 时间窗 第 10 周",
                ms: "2.3s",
                result: "采集完成 · 27 条记录 · 异常值 2 条已标记"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "飞书消息 MCP",
                args: "轮次 92 · 渠道效率 · 采集 46 个数据点 · 时间窗 第 10 周",
                ms: "2.4s",
                result: "采集完成 · 46 条记录 · 异常值 2 条已标记"
        },
        {
                t: "shell",
                name: "analysis-round-93",
                cmd: "analyze --dimension \"品牌声量\" --round 93 --data-points 10 --method \"bayesian-inference\" --confidence 0.95",
                ms: "3.6s",
                result: "exit 0 · 轮次 93 分析完成 · 置信度 95% · 发现 2 个显著信号"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "网页搜索 MCP",
                args: "轮次 94 · 财务影响 · 采集 59 个数据点 · 时间窗 第 10 周",
                ms: "1.9s",
                result: "采集完成 · 59 条记录 · 异常值 1 条已标记"
        },
        {
                t: "think",
                text: "第 95 轮 风险评估 分析发现：价格弹性系数出现结构性变化。需要在第 96 轮调整分析假设。"
        },
        {
                t: "shell",
                name: "analysis-round-96",
                cmd: "analyze --dimension \"定价分析\" --round 96 --data-points 13 --method \"bayesian-inference\" --confidence 0.95",
                ms: "2.4s",
                result: "exit 0 · 轮次 96 分析完成 · 置信度 95% · 发现 3 个显著信号"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "网页搜索 MCP",
                args: "轮次 97 · 转化漏斗 · 采集 57 个数据点 · 时间窗 第 10 周",
                ms: "1.2s",
                result: "采集完成 · 57 条记录 · 异常值 1 条已标记"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "飞书消息 MCP",
                args: "轮次 98 · 用户行为 · 采集 48 个数据点 · 时间窗 第 10 周",
                ms: "1.1s",
                result: "采集完成 · 48 条记录 · 异常值 2 条已标记"
        },
        {
                t: "shell",
                name: "analysis-round-99",
                cmd: "analyze --dimension \"竞争格局\" --round 99 --data-points 20 --method \"bayesian-inference\" --confidence 0.95",
                ms: "1.6s",
                result: "exit 0 · 轮次 99 分析完成 · 置信度 95% · 发现 3 个显著信号"
        },
        {
                t: "think",
                text: "第 100 轮 渠道效率 分析发现：价格弹性系数出现结构性变化。需要在第 101 轮调整分析假设。"
        },
        {
                t: "text",
                text: "【阶段结论 · 第 100 轮】渠道效率维度分析完成。累计处理 1500 个数据点，识别出 12 个核心驱动因素。当前分析进度 100%，预计还需 0 轮完成全部维度交叉验证。"
        },
        {
                t: "think",
                text: "100 轮分析全部完成。现在汇总所有发现，撰写最终深度分析报告。报告需要涵盖五个部分：背景、数据验证、影响评估、行动建议、附录。"
        },
        {
                t: "text",
                text: "【深度分析报告】竞品 A 降价策略的全维度影响评估\n\n一、背景与动机分析\n\n竞品 A 在第 8 周（10 月 16 日）宣布将入门套餐价格从 ¥99/月下调至 ¥87/月，降幅达 12.1%。与此同时，该公司取消了月付选项，仅保留年付（¥87/月 × 12 = ¥1,044/年）和季付（¥87/月 × 3 = ¥261/季，但需一次性支付）。这一策略组合的背后，我们认为有三层动机：\n\n第一层：现金流优化。取消月付意味着用户一次性支付更长周期的费用，改善了公司的现金流状况。根据我们对 SaaS 行业的研究，年付用户的 LTV（生命周期价值）通常是月付用户的 2.8-3.5 倍，而获客成本（CAC）基本一致。\n\n第二层：用户锁定。年付用户在合同期内的流失率仅为月付用户的 1/4。竞品 A 的目标是通过降低单价 + 锁定周期的组合拳，在经济下行期保住用户基本盘。\n\n第三层：竞争卡位。竞品 B 在第 6-7 周新增了抖音小店和快手电商两个分销渠道，正在快速抢占下沉市场。竞品 A 需要通过价格优势对冲竞品 B 的渠道扩张。\n\n二、数据验证\n\n从第 8 周到第 12 周的追踪数据来看：\n\n1. 年付转化率：从 23% 跃升至 41%（+18pp），验证了\"降价锁客\"策略的有效性。特别是在第 10 周（国庆促销期间），单周年付转化率峰值达到 47%。\n\n2. 用户总量：竞品 A 的注册用户数在第 8-12 周增长了 23%，其中 78% 的新用户选择了年付方案。这表明降价确实带来了增量用户，而不仅仅是存量转化。\n\n3. ARPU 变化：虽然单月价格下降了 12%，但由于年付用户占比提升，整体 ARPU（每用户平均收入）反而增长了 8%。这验证了\"以价换量 + 周期锁定\"策略的正向经济模型。\n\n4. 流失率：月付用户在取消月付选项后的 3 周内，流失率高达 34%（行业平均为 8%），说明约 1/3 的原月付用户对价格敏感度极高，不愿意承诺长周期。但其中约 40% 在 2 个月后以年付形式回归。\n\n三、对我方的影响评估\n\n短期（1-3 个月）：\n- 我方入门套餐用户中，约 15% 属于价格敏感型，存在被竞品 A 吸引的风险\n- 我方月付用户可能要求匹配竞品 A 的价格，客服压力预计增加 20-30%\n- 竞品 A 的品牌声量在社交媒体上提升了 42%（\"降价\"话题的自然传播效应）\n\n中期（3-6 个月）：\n- 如果竞品 A 的年付转化率持续保持在 35% 以上，其现金流将支撑更多的产品投入和市场推广\n- 竞品 B 被迫跟进降价的概率约为 65%，届时整个行业的价格中枢将下移\n- 我方需要在第 16 周前做出定价策略决策\n\n长期（6-12 个月）：\n- 行业可能进入\"年付为主\"的定价模式，月付选项逐步边缘化\n- 价格战的终局是价值差异化——单纯的价格竞争不可持续\n\n四、行动建议\n\n1. 【紧急】立即启动\"价格敏感用户\"识别模型，对我方入门套餐用户进行分层（建议本周内完成）\n2. 【重要】评估我方年付方案的定价弹性——如果跟进降价至 ¥87，预计年付转化率可提升 12-15pp，但 ARPU 将下降 5-8%\n3. 【建议】准备 B 方案：不直接降价，而是增加年付专属权益（如优先客服、专属功能），以差异化应对\n4. 【监控】持续追踪竞品 A 的年付续费率（预计首年续费率在 60-70% 之间），以及竞品 B 分销渠道的获客成本变化\n\n五、附录：数据来源\n\n- 竞品 A 官网定价页（每日爬取，第 8-12 周共 35 个数据点）\n- 竞品 A 社交媒体声量（微博/小红书/抖音，第 8-12 周共 2,847 条相关讨论）\n- 行业报告：《2026 年 SaaS 定价趋势白皮书》（Gartner，2026 年 9 月）\n- 我方用户调研：价格敏感度问卷（N=1,247，第 10 周执行）"
        },
        {
                t: "tool",
                kind: "MCP",
                name: "飞书消息 MCP",
                args: "上传深度分析报告到「竞品周报」文件夹 + 通知战略组",
                ms: "2.1s",
                result: "上传成功 · 已触达 5 人"
        },
        {
                t: "text",
                text: "100 轮深度循环分析全部完成，报告已交付。"
        }
],
      },
{ id: 'n5', lane: 'output', name: '生成周报并推送', agent: '报告 Bot', status: 'idle', duration: '—',
        events: [
          { t: 'think', text: '周报结构：一、核心结论（3 句话）；二、竞品动态明细（按竞品分组）；三、数据附录（图表+表格）；四、建议行动项。控制在 2 屏以内，管理层没时间看长文。' },
          { t: 'tool', kind: 'MCP', name: '数据仓库查询 MCP', args: '拉取三竞品全维度数据', ms: '3.4s', result: '156 行' },
          { t: 'skill', name: '平台风格改写', args: '平台=飞书 · 风格=管理层周报 · 字数≤800', ms: '1.2s', result: '输出模板已生成' },
          { t: 'text', text: '周报草稿完成（756 字）：\n\n【竞品周报·第 43 周】\n\n一、核心结论\n1. 竞品 A 降价 12% 并锁定年付，转化率跃升 18pp，策略已验证有效\n2. 竞品 B 新增 2 个分销渠道，流量结构正在重构\n3. 竞品 C 服务退步（响应时长翻倍），用户满意度跌破 4.0\n\n二、竞品动态明细\n竞品 A：入门套餐 ¥99→¥87，取消月付，仅保留年付/季付。年付转化率 23%→41%。\n竞品 B：新增抖音小店+快手电商分销，价格体系不变，关注渠道流量占比变化。\n竞品 C：客服响应 4h→8h，满意度 4.2→3.8，建议关注其用户流失数据。\n\n三、数据附录\n图 1：三维度对比（分组条形图）\n图 2：价格变化热力图（标注 A 第 8 周暴跌）\n图 3：竞品 A 年付转化率趋势线\n\n四、建议行动项\n1. 监控竞品 A 降价后的我方用户流失率（建议本周内启动）\n2. 评估是否跟进年付定价策略\n3. 关注竞品 B 分销渠道的获客成本变化\n\n（全文 756 字，预计阅读 2 分钟）' },
          { t: 'tool', kind: 'MCP', name: '飞书消息 MCP', args: '发送周报到「竞品周报」群 + @张总 @李总', ms: '1.8s', result: '发送成功 · 已触达 2 人' },
          { t: 'text', text: '周报已推送到飞书群。' },
        ],
      },
    ],
  },
  {
    id: 'wf-prd',
    name: 'PRD 需求评审助手',
    category: '研究分析',
    desc: '对 PRD 做结构化预审，输出风险清单与建议',
    edges: [['n1', 'n2'], ['n2', 'n3'], ['n3', 'n4']],
    nodes: [
      { id: 'n1', lane: 'input', name: '解析 PRD 文档', agent: '文档解析 Bot', status: 'done', duration: '0m 48s', log: ['识别章节 14 个', '提取功能点 26 个'] },
      { id: 'n2', lane: 'core', name: '逻辑完整性检查', agent: '评审 Bot', status: 'done', duration: '1m 37s', log: ['发现缺失边界条件 3 处'] },
      { id: 'n3', lane: 'core', type: 'review', name: '人工审查：技术可行性', agent: '用户审查', status: 'pending', duration: '待审查',
        review: {
          report: '2 个功能点需人工确认可行性：① 积分自动扣减与现有风控规则存在冲突（触发频控阈值）；② 会员等级与权益中心的数据同步实测延迟约 1 小时。',
          questions: [
            { id: 'q1', q: '积分自动扣减的风控冲突如何处理？', options: ['调整风控规则，按原方案执行', '扣减改为次日批量执行', '本期不做积分扣减'], answer: null },
            { id: 'q2', q: '会员等级同步延迟是否可接受？', options: ['可接受，按小时级同步', '需优化为准实时同步', '本期降级为手动同步'], answer: null },
          ],
        },
        log: ['冲突点已标注，转人工审查', '等待审查结论…'],
      },
      { id: 'n4', lane: 'output', name: '输出评审意见', agent: '报告 Bot', status: 'idle', duration: '—', log: [] },
    ],
  },
  {
    id: 'wf-content',
    name: '多平台内容分发',
    category: '内容生成',
    desc: '一篇源稿适配公众号 / 知乎 / X 三个平台并排期',
    edges: [['n1', 'n2'], ['n1', 'n3'], ['n1', 'n4'], ['n2', 'n5'], ['n3', 'n5'], ['n4', 'n5']],
    nodes: [
      { id: 'n1', lane: 'input', name: '接收源稿', agent: '内容助理 Bot', status: 'done', duration: '0m 12s', log: ['源稿 2,430 字'] },
      { id: 'n2', lane: 'core', name: '公众号版改写', agent: '写作 Bot', status: 'done', duration: '1m 21s', log: ['输出 2,180 字'] },
      { id: 'n3', lane: 'core', name: '知乎版改写', agent: '写作 Bot', status: 'fail', duration: '重试 2 次',
        events: [
          { t: 'think', text: '知乎版需口语化但保留引用出处，引用格式统一用「」而非英文引号。' },
          { t: 'text', text: '生成中……「竞品 A 的定价策略，参考其官网定价页」' },
          { t: 'error', text: '引用格式校验失败：检出 3 处英文引号，自动重试 1/2' },
          { t: 'error', text: '重试 2/2 仍未通过，转人工纠正' },
        ],
      },
      { id: 'n4', lane: 'core', name: 'X 短文版改写', agent: '写作 Bot', status: 'done', duration: '0m 44s', log: ['输出 240 字线程'] },
      { id: 'n5', lane: 'output', name: '排期与发布', agent: '发布 Bot', status: 'idle', duration: '—', log: [] },
    ],
  },
  {
    id: 'wf-user',
    name: '用户反馈聚类',
    category: '研究分析',
    desc: '拉取多渠道用户反馈，聚类并生成主题报告',
    edges: [['n1', 'n2'], ['n1', 'n3'], ['n2', 'n4'], ['n3', 'n4']],
    nodes: [
      { id: 'n1', lane: 'input', name: '拉取反馈数据', agent: '数据采集 Bot', status: 'done', duration: '1m 05s', log: ['渠道 5 个，共 1,284 条'] },
      { id: 'n2', lane: 'core', name: '语义聚类', agent: '分析 Bot', status: 'done', duration: '2m 30s', log: ['聚出 8 个主题簇'] },
      { id: 'n3', lane: 'core', name: '情感打分', agent: '分析 Bot', status: 'done', duration: '0m 58s', log: ['负面占比 23.4%'] },
      { id: 'n4', lane: 'output', name: '生成主题报告', agent: '报告 Bot', status: 'done', duration: '1m 12s', log: ['报告已生成'] },
    ],
  },
  {
    id: 'wf-release',
    name: '版本发布检查单',
    category: '流程编排',
    desc: '发布前自动核对检查单并汇总风险',
    edges: [['n1', 'n2'], ['n1', 'n3'], ['n2', 'n4'], ['n3', 'n4']],
    nodes: [
      { id: 'n1', lane: 'input', name: '读取发布单', agent: '文档解析 Bot', status: 'done', duration: '0m 20s', log: ['版本 v2.6.0'] },
      { id: 'n2', lane: 'core', name: '核对回归范围', agent: 'QA Bot', status: 'running', duration: '进行中',
        events: [
          { t: 'tool', kind: 'MCP', name: '数据仓库查询 MCP', args: '用例关联查询 · release=v2.6.0', ms: '1.4s', result: '关联 86 条用例' },
          { t: 'think', text: '按模块聚合，优先核对支付与权益两个高风险模块。' },
          { t: 'shell', name: 'qa-check', cmd: 'qa-check --module payment --release v2.6.0', ms: '运行中', result: '42 / 86 条已核对…' },
          { t: 'text', text: '支付模块核对完成，权益模块核对中……' },
        ],
      },
      { id: 'n3', lane: 'core', name: '扫描配置差异', agent: 'QA Bot', status: 'done', duration: '0m 39s', log: ['配置变更 2 项'] },
      { id: 'n4', lane: 'output', name: '汇总发布风险', agent: '报告 Bot', status: 'done', duration: '0m 25s', log: ['风险 1 项：缓存策略'] },
    ],
  },
  {
    id: 'wf-design',
    name: '设计稿走查摘要',
    category: '内容生成',
    desc: '对照设计规范走查界面截图，输出问题摘要',
    edges: [['n1', 'n2'], ['n1', 'n3'], ['n2', 'n4'], ['n3', 'n4']],
    nodes: [
      { id: 'n1', lane: 'input', name: '接收走查截图', agent: '内容助理 Bot', status: 'done', duration: '0m 15s', log: ['截图 9 张'] },
      { id: 'n2', lane: 'core', name: '规范符合性比对', agent: '走查 Bot', status: 'done', duration: '2m 02s', log: ['比对规则 42 条'] },
      { id: 'n3', lane: 'core', type: 'review', name: '人工审查：问题定级', agent: '用户审查', status: 'pending', duration: '待审查',
        review: {
          report: '走查共发现 2 个疑似 P1 问题：① 会员中心价格条款字号 11px，低于规范下限 12px；② 开通按钮在暗色模式下对比度 3.1:1，未达 4.5:1 标准。',
          questions: [
            { id: 'q1', q: '两个问题的 P1 定级是否成立？', options: ['均成立，按 P1 处理', '仅字号问题成立，对比度降 P2', '均降级为 P2 观察'], answer: null },
          ],
        },
        log: ['疑似 P1 问题 2 个，转人工定级', '等待审查结论…'],
      },
      { id: 'n4', lane: 'output', name: '输出走查报告', agent: '报告 Bot', status: 'idle', duration: '—', log: [] },
    ],
  },
]

export const getWorkflow = (id) => workflows.find((w) => w.id === id)

// 无显式连线时按数组顺序链式兜底
export const chainEdges = (nodes) => {
  const out = []
  for (let i = 0; i < nodes.length - 1; i++) out.push([nodes[i].id, nodes[i + 1].id])
  return out
}
