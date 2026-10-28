import { seedTasks, nextTaskId, buildBoard } from '@/data/tasks'
import { notifyTaskDone, notifyTaskFail, notifyReview } from '@/store/notifyStore'

// 模块级单例：Tasks ↔ Run 共享同一份任务内存（刷新还原）
let tasks = seedTasks()

export const taskStore = {
  list() {
    return tasks
  },
  get(id) {
    return tasks.find((t) => t.id === id)
  },
  add({ title, workflowId, agents = [], skills = [], dir = '', attachments = [] }) {
    const task = {
      id: nextTaskId(),
      title,
      status: 'draft',
      score: null,
      updatedAt: '刚刚',
      workflowId,
      agents, skills, dir, attachments,
      corrections: 0,
      correctionsByNode: {},
      messages: [],
      board: buildBoard(workflowId),
    }
    tasks = [task, ...tasks]
    return task
  },
  update(id, patch) {
    const old = tasks.find((t) => t.id === id)
    tasks = tasks.map((t) => (t.id === id ? { ...t, ...patch } : t))
    const updated = tasks.find((t) => t.id === id)
    // 状态流转 → 通知
    if (old && updated && old.status !== updated.status) {
      if (updated.status === 'done') notifyTaskDone(updated)
      else if (updated.status === 'fail') notifyTaskFail(updated)
    }
  },
  remove(id) {
    tasks = tasks.filter((t) => t.id !== id)
  },
  // 审查点问答：写入所选结论；全部问题答完则节点转成功
  answerReview(id, nodeId, answer) {
    const t = taskStore.get(id)
    if (!t) return
    const node = t.board.find((n) => n.id === nodeId)
    if (!node?.review) return
    const board = t.board.map((n) => {
      if (n.id !== nodeId) return n
      const questions = n.review.questions.map((q) =>
        answer[q.id] !== undefined ? { ...q, answer: answer[q.id] } : q,
      )
      const allDone = questions.every((q) => q.answer)
      return {
        ...n,
        review: { ...n.review, questions },
        status: allDone ? 'done' : 'review',
        duration: allDone ? '人工确认' : '待审查',
      }
    })
    const now = new Date()
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const qText = node.review.questions.find((q) => answer[q.id] !== undefined)?.q || ''
    const messages = [
      ...t.messages,
      { role: 'user', text: `【${node.name}】${qText} → ${Object.values(answer)[0]}`, time },
      { role: 'bot', text: '审查结论已记录，节点状态已更新。', time },
    ]
    taskStore.update(id, { board, messages })
  },
  setUserRating(id, rating) {
    taskStore.update(id, { userRating: rating })
  },
  setUserFeedback(id, text) {
    if (text.trim()) taskStore.update(id, { userFeedback: text.trim() })
  },
  // 纠错双写：节点 corrections 计数 + 对话消息（nodeId 为空则记任务级）
  addCorrection(id, nodeId, text) {
    const t = taskStore.get(id)
    if (!t) return
    const board = t.board.map((n) =>
      n.id === nodeId ? { ...n, corrections: n.corrections + 1 } : n,
    )
    const correctionsByNode = { ...t.correctionsByNode }
    if (nodeId) correctionsByNode[nodeId] = (correctionsByNode[nodeId] || 0) + 1
    const now = new Date()
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const nodeName = t.board.find((n) => n.id === nodeId)?.name || ''
    const messages = [
      ...t.messages,
      { role: 'user', text, time },
      { role: 'bot', text: nodeId ? `已收到纠正意见，将写入节点「${nodeName}」的执行约束。` : '已收到纠正意见，将在下轮执行中采纳。', time },
    ]
    taskStore.update(id, {
      board,
      correctionsByNode,
      corrections: t.corrections + 1,
      messages,
    })
  },
}
