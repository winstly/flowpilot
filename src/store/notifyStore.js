// 通知中心 store：任务完成/失败/待确认 → 通知列表，点击跳转定位
// 预置模拟通知数据
let notifications = [
  {
    id: 'nt-seed-1',
    type: 'review-question',
    taskId: 'T-100',
    nodeId: 'n3r',
    nodeTitle: '人工审查：对比结论',
    taskTitle: '生成 10 月第 4 周竞品周报',
    body: '「人工审查：对比结论」对比结论是否采信，可进入图表生成？',
    read: false,
    time: '14:32',
  },
  {
    id: 'nt-seed-2',
    type: 'task-done',
    taskId: 'T-95',
    taskTitle: '生成 10 月第 3 周竞品周报',
    body: '任务「生成 10 月第 3 周竞品周报」已完成 · 5/5 节点成功',
    read: false,
    time: '14:18',
  },
  {
    id: 'nt-seed-3',
    type: 'task-fail',
    taskId: 'T-98',
    taskTitle: '把《Agent 编排实践》适配到三个平台',
    body: '任务「把《Agent 编排实践》适配到三个平台」执行失败，知乎版改写节点引用格式校验未通过',
    read: false,
    time: '11:45',
  },
  {
    id: 'nt-seed-4',
    type: 'review-question',
    taskId: 'T-99',
    nodeId: 'n3',
    nodeTitle: '人工审查：技术可行性',
    taskTitle: '评审会员体系 PRD v3 的逻辑完整性',
    body: '「人工审查：技术可行性」积分自动扣减的风控冲突如何处理？',
    read: true,
    time: '13:20',
  },
  {
    id: 'nt-seed-5',
    type: 'task-done',
    taskId: 'T-96',
    taskTitle: '为 v2.6.0 发布跑一遍检查单',
    body: '任务「为 v2.6.0 发布跑一遍检查单」已完成 · 4/4 节点成功',
    read: true,
    time: '10:05',
  },
  {
    id: 'nt-seed-6',
    type: 'task-fail',
    taskId: 'T-91',
    taskTitle: 'PRD 预审：积分商城一期',
    body: '任务「PRD 预审：积分商城一期」执行失败，2 个功能点存在逻辑缺失',
    read: true,
    time: '昨天 17:30',
  },
  {
    id: 'nt-seed-7',
    type: 'review-question',
    taskId: 'T-94',
    nodeId: 'n3',
    nodeTitle: '人工审查：问题定级',
    taskTitle: '设计稿走查：会员中心新版 9 张截图',
    body: '「人工审查：问题定级」两个问题的 P1 定级是否成立？',
    read: true,
    time: '昨天 15:12',
  },
  {
    id: 'nt-seed-8',
    type: 'task-done',
    taskId: 'T-93',
    taskTitle: '把复盘结论沉淀为可复用方法论',
    body: '任务「把复盘结论沉淀为可复用方法论」已完成 · 4/4 节点成功',
    read: true,
    time: '昨天 14:00',
  },
]

let seqStart = 100
const listeners = new Set()

function emit() {
  listeners.forEach((fn) => fn())
}

export const notifyStore = {
  subscribe(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  list() {
    return notifications
  },
  unread() {
    return notifications.filter((n) => !n.read).length
  },
  add({ type, taskId, nodeId, nodeTitle, taskTitle, body }) {
    const id = `nt-${++seqStart}`
    notifications = [
      {
        id,
        type, // 'task-done' | 'task-fail' | 'review-question'
        taskId,
        nodeId,       // 有值 → 跳转后定位到该节点
        nodeTitle,
        taskTitle,
        body,
        read: false,
        time: formatNow(),
      },
      ...notifications,
    ].slice(0, 50) // 最多保留 50 条
    emit()
    return id
  },
  markRead(id) {
    notifications = notifications.map((n) => (n.id === id ? { ...n, read: true } : n))
    emit()
  },
  markAllRead() {
    notifications = notifications.map((n) => ({ ...n, read: true }))
    emit()
  },
  clear() {
    notifications = []
    emit()
  },
}

function formatNow() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ---- 事件触发器：供 store / 页面调用 ----
export function notifyTaskDone(task) {
  notifyStore.add({
    type: 'task-done',
    taskId: task.id,
    taskTitle: task.title,
    body: `任务「${task.title}」已完成 · ${task.board.filter((n) => n.status === 'done').length}/${task.board.length} 节点成功`,
  })
}

export function notifyTaskFail(task) {
  notifyStore.add({
    type: 'task-fail',
    taskId: task.id,
    taskTitle: task.title,
    body: `任务「${task.title}」执行失败，请查看节点日志`,
  })
}

export function notifyReview(task, node) {
  const q = node.review?.questions.find((x) => !x.answer)
  notifyStore.add({
    type: 'review-question',
    taskId: task.id,
    nodeId: node.id,
    nodeTitle: node.name,
    taskTitle: task.title,
    body: `「${node.name}」${q?.q || '有待确认检查点'}`,
  })
}
