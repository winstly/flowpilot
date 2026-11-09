import { getWorkflow } from './workflows'

let seq = 100
export const nextTaskId = () => `T-${++seq}`
// 持久化水合后抬高序号，避免新任务与已存任务撞 id
export const setTaskSeq = (v) => { seq = Math.max(seq, v) }

// 由工作流定义克隆任务画布（纯定义 + 运行字段初始化；执行状态由真实运行产生）
export function buildBoard(workflowId) {
  const wf = getWorkflow(workflowId)
  if (!wf) return []
  return wf.nodes.map((n) => ({ ...n, status: 'idle', duration: '', output: '', corrections: 0 }))
}

export const TASK_STATUS = {
  running: { label: '执行中', cls: 'badge-info' },
  pending: { label: '待确认', cls: 'badge-warn' },
  draft:   { label: '草稿',   cls: 'badge-mute' },
  done:    { label: '成功',   cls: 'badge-ok' },
  fail:    { label: '失败',   cls: 'badge-fail' },
}

export const NODE_STATUS = {
  done:    { label: '成功', cls: 'badge-ok' },
  running: { label: '运行中', cls: 'badge-info' },
  pending: { label: '待确认', cls: 'badge-warn' },
  review:  { label: '待审查', cls: 'badge-warn' },
  fail:    { label: '失败', cls: 'badge-fail' },
  idle:    { label: '未开始', cls: 'badge-mute' },
}
