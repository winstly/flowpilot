import { resources as seed, workflowDetails } from '@/data/resources'
import { getWorkflow } from '@/data/workflows'

// 演示环境：Market 资源列表的模块级单例。
// 任务页 / 运行页申请发布的工作流与市场页共享同一份数据，跨路由不丢。
let list = null

export function getMarketList() {
  if (!list) list = [...seed]
  return list
}

export function setMarketList(next) {
  list = next
}

// 任务结束后申请发布：以任务执行结果建档（名称/说明/标签来自 AI 草稿 + 对话调整），
// 并按任务画布生成只读预览数据，市场详情页可直接查看
export function publishWorkflowFromTask(task, draft) {
  const date = new Date().toISOString().slice(0, 10)
  const id = `wf-from-${task.id}-${Date.now()}`
  const res = {
    id, kind: 'Workflow', name: draft.name, author: '檀小猊', version: 'v1.0',
    status: '待发布', rating: 0, reuses: 0,
    tags: draft.tags.length ? [...draft.tags] : ['来自任务'],
    desc: draft.desc || '（待补充说明）',
    versions: [{ v: 'v1.0', date, note: `来自任务 ${task.id} 的发布申请（待审批）` }],
  }
  workflowDetails[id] = {
    summary: `来自任务「${task.title}」的执行结果，共 ${task.board.length} 个节点。`,
    agents: [...new Set(task.board.map((n) => n.agent).filter((a) => a && a !== '用户审查'))],
    nodes: task.board.map((n) => ({ id: n.id, name: n.name, agent: n.agent, agentVersion: n.agentVersion, status: n.status })),
    edges: getWorkflow(task.workflowId)?.edges || [],
  }
  setMarketList([res, ...getMarketList()])
  return res
}
