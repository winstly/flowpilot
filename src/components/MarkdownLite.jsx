// 简易 Markdown 渲染（标题/列表/表格/代码/粗体）
// ResourceDetail 的 Rule 预览与 Rule 编辑「预览」共用
export default function MarkdownLite({ content = '' }) {
  const lines = content.split('\n')
  return (
    <div className="text-[13px] leading-relaxed">
      {lines.map((line, i) => {
        if (line.startsWith('### ')) return <h4 key={i} className="mt-3 text-[13.5px] font-semibold text-ink">{renderInline(line.slice(4))}</h4>
        if (line.startsWith('## ')) return <h3 key={i} className="mt-4 text-[15px] font-semibold text-ink">{renderInline(line.slice(3))}</h3>
        if (line.startsWith('# ')) return <h2 key={i} className="mt-4 text-[18px] font-semibold text-ink first:mt-0">{renderInline(line.slice(2))}</h2>
        if (line.startsWith('- ')) return <li key={i} className="ml-4 text-ink2">{renderInline(line.slice(2))}</li>
        if (/^\d+\.\s/.test(line)) return <li key={i} className="ml-4 list-decimal text-ink2">{renderInline(line.replace(/^\d+\.\s/, ''))}</li>
        if (line.startsWith('| ')) {
          if (line.includes('---')) return null
          const cells = line.split('|').filter((c) => c.trim()).map((c) => c.trim())
          return (
            <div key={i} className="flex gap-2 border-b border-line py-1 text-[12px]">
              {cells.map((c, j) => <span key={j} className="flex-1 text-ink2">{renderInline(c)}</span>)}
            </div>
          )
        }
        if (line.startsWith('```')) return null
        if (line.trim() === '') return <div key={i} className="h-2" />
        return <p key={i} className="text-ink2">{renderInline(line)}</p>
      })}
    </div>
  )
}

// 行内渲染：**粗体** 与 `代码`。注意必须返回 React 节点——
// 拼 HTML 字符串会被 JSX 整体转义，页面上会露出 <strong> 标签原文
function renderInline(text) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return <strong key={i} className="font-semibold text-ink">{p.slice(2, -2)}</strong>
    }
    if (p.startsWith('`') && p.endsWith('`')) {
      return <code key={i} className="rounded bg-mute-soft px-1 font-mono text-[11px] text-ink">{p.slice(1, -1)}</code>
    }
    return p
  })
}
