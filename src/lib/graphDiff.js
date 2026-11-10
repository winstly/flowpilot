// 流程图差异比对：重新编排只动受影响的节点
// 变更影响 = 定义有变化的节点 ∪ 其下游（下游输入会变，如确认门意见回灌）；无关分支整对象复用
// 签名只看语义字段：name/agent/type/确认问题。lane 是展示字段（编排每轮会重排 input/output），不进签名——
// 否则同定义节点因 lane 漂移被误判变更，整条下游跟着重跑，增量比对形同虚设
export function nodeSignature(n) {
  return JSON.stringify([
    String(n.name || '').trim(), String(n.agent || '').trim(), n.type || '',
    String(n.instruction || '').trim(), // 节点指令是派工内容：改了指令 = 改了活，必须重跑
    n.review?.questions?.map((q) => [String(q.q || '').trim(), q.options]) || null,
  ])
}

export function mergeBoard(oldBoard = [], newNodes = [], newEdges = [], oldEdges = []) {
  const oldById = Object.fromEntries(oldBoard.map((n) => [n.id, n]))
  // 0) 连线比对：上游集合变了的节点必须重跑——输入变了，即使定义没变（纯改连线的重新编排）
  //    旧连线未知（oldEdges 空）时不做连线比对，退化为纯定义比对
  const upsets = (edges) => {
    const m = {}
    for (const [a, b] of edges) (m[b] = m[b] || new Set()).add(a)
    return m
  }
  const upNew = upsets(newEdges)
  const upOld = upsets(oldEdges)
  const edgeChanged = oldEdges.length
    ? newNodes
      .filter((src) => {
        const now = upNew[src.id] || new Set()
        const was = upOld[src.id] || new Set()
        return now.size !== was.size || [...now].some((x) => !was.has(x))
      })
      .map((src) => src.id)
    : []
  // 1) 定义比对：同 id 且签名一致 → 候选复用
  const changed = new Set([
    ...newNodes
      .filter((src) => !(oldById[src.id] && nodeSignature(oldById[src.id]) === nodeSignature(src)))
      .map((src) => src.id),
    ...edgeChanged,
  ])
  // 2) 变更节点连同下游全部重置（上游产物/确认意见进入下游简报，必须重跑）
  const downstream = {}
  for (const [a, b] of newEdges) (downstream[a] = downstream[a] || []).push(b)
  const reset = new Set(changed)
  const stack = [...changed]
  while (stack.length) {
    const id = stack.pop()
    for (const dep of downstream[id] || []) {
      if (!reset.has(dep)) { reset.add(dep); stack.push(dep) }
    }
  }
  // 3) 合成：受影响节点重置，其余整对象复用（状态/产出/执行记录原样保留）
  const reuseIds = []
  const board = newNodes.map((src) => {
    const old = oldById[src.id]
    if (old && !reset.has(src.id)) {
      reuseIds.push(src.id)
      // 状态/产出/执行记录原样保留；lane 只影响画布布局，跟新图对齐但不触发重跑
      return { ...old, lane: src.lane || old.lane }
    }
    return {
      id: src.id,
      name: src.name,
      agent: src.agent,
      lane: src.lane || 'core',
      type: src.type,
      ...(src.instruction ? { instruction: src.instruction } : {}),
      ...(src.modelSlot ? { modelSlot: src.modelSlot } : {}),
      ...(src.review
        ? { review: { report: '', questions: src.review.questions.map((q) => ({ ...q, answer: null })) } }
        : {}),
      status: 'idle',
      duration: '',
      output: '',
      corrections: 0,
    }
  })
  return { board, reuseIds }
}
