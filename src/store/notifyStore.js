// 通知中心 store：任务完成/失败/待确认 → 通知列表，点击跳转定位
// 不预置模拟通知：条目由真实任务事件（notifyTaskDone/Fail/Review）产生
let notifications = []

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

export function formatNow() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ---- 事件触发器：供 store / 页面调用 ----
export function notifyTaskDone(task) {
  notifyStore.add({
    type: 'task-done',
    taskId: task.id,
    taskTitle: task.title,
    body: `任务「${task.title}」已完成，${task.board.filter((n) => n.status === 'done').length}/${task.board.length} 节点成功`,
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
