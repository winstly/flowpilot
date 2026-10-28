import { getWorkflow } from './workflows'

let seq = 100
export const nextTaskId = () => `T-${++seq}`

// 由工作流定义克隆任务画布（深拷贝节点 + 附加运行字段）
export function buildBoard(workflowId) {
  const wf = getWorkflow(workflowId)
  if (!wf) return []
  return wf.nodes.map((n) => ({ ...n, corrections: 0 }))
}

const mk = (data) => {
  const d = { agents: [], skills: [], dir: '', attachments: [], correctionsByNode: {}, reworkByNode: {}, messages: [], ...data }
  // 把种子纠正计数与主 Agent 打回重跑记录回填到画布节点，保证节点徽章与复盘面板一致
  return {
    ...d,
    board: buildBoard(d.workflowId).map((n) => ({
      ...n,
      corrections: d.correctionsByNode[n.id] || 0,
      ...(d.reworkByNode[n.id] || {}),
    })),
  }
}

export const seedTasks = () => [
  mk({
    id: 'T-100', title: '生成 10 月第 4 周竞品周报', status: 'running', score: 4.2,
    updatedAt: '10 分钟前', workflowId: 'wf-weekly',
    agents: ['ag-01', 'ag-02'], skills: ['sk-cluster'], dir: '/团队空间/市场洞察',
    attachments: [{ name: '竞品截图-0930.png', size: '1.2 MB' }],
    corrections: 2,
    correctionsByNode: { n2: 1, n3: 1 },
    // 主 Agent 根据节点返回判定 n3 结论证据不足，已打回重跑并复评
    reworkByNode: { n3: { reworkCount: 1, reworkReason: '结论证据不足，需扩大样本重新分析', agentScore: 4.7, duration: '1m 24s' } },
    messages: [
      { role: 'user', text: '竞品对比请把定价维度放在最前面', time: '14:02' },
      { role: 'bot', text: '已收到，将在"多维度对比分析"节点调整维度顺序。', time: '14:02' },
      { role: 'user', text: '图表配色统一用品牌蓝，不要出现红绿对比', time: '14:10' },
      { role: 'bot', text: '好的，已写入图表生成节点的约束。', time: '14:10' },
    ],
  }),
  mk({
    id: 'T-99', title: '评审会员体系 PRD v3 的逻辑完整性', status: 'pending', score: 3.8,
    updatedAt: '1 小时前', workflowId: 'wf-prd',
    agents: ['ag-06'], skills: [], dir: '/团队空间/产品文档',
    corrections: 1, correctionsByNode: { n3: 1 },
    messages: [
      { role: 'user', text: '技术可行性那两个点我确认过了，按可行处理', time: '13:20' },
      { role: 'bot', text: '已记录确认意见，将在评审意见中标注"人工已确认"。', time: '13:21' },
    ],
  }),
  mk({
    id: 'T-98', title: '把《Agent 编排实践》适配到三个平台', status: 'fail', score: 3.1,
    updatedAt: '3 小时前', workflowId: 'wf-content',
    agents: ['ag-03'], skills: ['sk-rewrite'], dir: '/个人空间/草稿箱',
    corrections: 4, correctionsByNode: { n3: 3, n2: 1 },
    // 主 Agent 打回 n3 重跑后仍未通过结构校验
    reworkByNode: { n3: { reworkCount: 1, reworkReason: '输出未通过结构校验，需按 Schema 修正后重跑', agentScore: 2.9 } },
    messages: [
      { role: 'user', text: '知乎版的引用格式应该是「」不是""，改一下', time: '10:31' },
      { role: 'bot', text: '已收到纠正，已更新引用格式规则并重试。', time: '10:31' },
    ],
  }),
  mk({
    id: 'T-97', title: '聚类上周全渠道用户反馈', status: 'running', score: 4.5,
    updatedAt: '昨天', workflowId: 'wf-user',
    agents: ['ag-01', 'ag-02'], skills: ['sk-cluster'], dir: '/团队空间/市场洞察',
    corrections: 0,
  }),
  mk({
    id: 'T-96', title: '为 v2.6.0 发布跑一遍检查单', status: 'running', score: 4.0,
    updatedAt: '昨天', workflowId: 'wf-release',
    agents: ['ag-05'], skills: ['sk-checklist'], dir: '/团队空间/产品文档',
    corrections: 1, correctionsByNode: { n3: 1 },
  }),

  mk({
    id: 'T-95', title: '生成 10 月第 3 周竞品周报', status: 'done', score: 4.7,
    updatedAt: '10-20', workflowId: 'wf-weekly',
    agents: ['ag-01', 'ag-02'], skills: [], dir: '/团队空间/市场洞察',
    corrections: 1, correctionsByNode: { n4: 1 },
    // 主 Agent 打回 n4 重跑后复评通过（时长为重跑后）
    reworkByNode: { n4: { reworkCount: 1, reworkReason: '输出与任务口径不一致，需对齐上下文重新生成', agentScore: 4.9, duration: '3m 38s' } },
  }),

  mk({
    id: 'T-94', title: '设计稿走查：会员中心新版 9 张截图', status: 'done', score: 4.4,
    updatedAt: '10-18', workflowId: 'wf-design',
    agents: ['ag-07'], skills: ['sk-chart'], dir: '/团队空间/设计资产',
    corrections: 2, correctionsByNode: { n2: 1, n3: 1 },
  }),
  mk({
    id: 'T-93', title: '把复盘结论沉淀为可复用方法论', status: 'done', score: 4.9,
    updatedAt: '10-17', workflowId: 'wf-user',
    agents: ['ag-02'], skills: [], dir: '/团队空间/市场洞察',
    corrections: 0,
  }),
  mk({
    id: 'T-92', title: '多平台分发：10 月运营月报', status: 'done', score: 4.3,
    updatedAt: '10-15', workflowId: 'wf-content',
    agents: ['ag-03', 'ag-04'], skills: ['sk-rewrite'], dir: '/团队空间/产品文档',
    corrections: 3, correctionsByNode: { n2: 2, n3: 1 },
  }),
  mk({
    id: 'T-91', title: 'PRD 预审：积分商城一期', status: 'fail', score: 2.9,
    updatedAt: '10-12', workflowId: 'wf-prd',
    agents: ['ag-06'], skills: [], dir: '/团队空间/产品文档',
    corrections: 5, correctionsByNode: { n2: 2, n3: 3 },
  }),
]

export const TASK_STATUS = {
  running: { label: '执行中', cls: 'badge-info' },
  pending: { label: '待确认', cls: 'badge-warn' },
  draft:   { label: '草稿',   cls: 'badge-mute' },
  done:    { label: '成功',   cls: 'badge-ok' },
  fail:    { label: '失败',   cls: 'badge-fail' },
}

export const NODE_STATUS = {
  done:    { label: '成功',   cls: 'badge-ok' },
  running: { label: '运行中', cls: 'badge-info' },
  pending: { label: '待确认', cls: 'badge-warn' },
  review:  { label: '待审查', cls: 'badge-warn' },
  fail:    { label: '失败',   cls: 'badge-fail' },
  idle:    { label: '未开始', cls: 'badge-mute' },
}
