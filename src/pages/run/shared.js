import { NODE_STATUS } from '@/data/tasks'

// 审查点节点状态展示：未答完 → 待审查（琥珀），答完 → 成功
export const nodeStatus = (n) =>
  n.type === 'review' && n.status !== 'done' ? NODE_STATUS.review : NODE_STATUS[n.status]

// 主 Agent 对节点执行结果的评分：结合执行信号推导（纠正/失败扣分）；
// 打回重跑的节点由主 Agent 复评后显式写入 agentScore。未执行 / 运行中 / 审查未闭环 → 未评估
export const nodeScoreOf = (n) => {
  if (n.agentScore != null) return n.agentScore
  if (!['done', 'fail', 'pending'].includes(n.status)) return null
  if (n.type === 'review' && n.status !== 'done') return null
  let s = 4.9 - (n.corrections || 0) * 0.35
  if (n.status === 'fail') s -= 1.3
  if (n.status === 'pending') s -= 0.2
  return +Math.max(2.8, s).toFixed(1)
}
