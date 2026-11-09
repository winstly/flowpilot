// SQLite 持久化桥（app_records 信封表）：渲染层内存 store 的统一落库口
// 无桌面桥（纯浏览器开发态）时静默降级为内存态
export const records = {
  load: (kind) => (window.records ? window.records.load(kind) : Promise.resolve([])),
  save: (kind, id, record) => (window.records ? window.records.save(kind, id, record) : Promise.resolve(false)),
  remove: (kind, id) => (window.records ? window.records.remove(kind, id) : Promise.resolve(false)),
}
