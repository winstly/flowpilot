import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'

/* 自绘标题条：替代原生标题栏（frame: false）。
   32px 原生比例 + 46px 窗口控制命中区；整条可拖拽（含双击最大化），
   按钮区域 no-drag。字形为内联 SVG 描边，贴近 Windows 11 caption 几何。 */

function MinGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M0 5h10" stroke="currentColor" strokeWidth="1" fill="none" />
    </svg>
  )
}

function MaxGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1" fill="none" />
    </svg>
  )
}

function RestoreGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M2.5 2.5V.5h7v7h-2" stroke="currentColor" strokeWidth="1" fill="none" />
      <rect x="0.5" y="2.5" width="7" height="7" stroke="currentColor" strokeWidth="1" fill="none" />
    </svg>
  )
}

function CloseGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M.5.5l9 9M9.5.5l-9 9" stroke="currentColor" strokeWidth="1" fill="none" />
    </svg>
  )
}

export default function TitleBar() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    window.desktop?.isMaximized().then(setMaximized)
    return window.desktop?.onMaximizedChange(setMaximized)
  }, [])

  return (
    <header className="titlebar">
      <div className="titlebar-drag">
        <span className="flex size-[18px] flex-none items-center justify-center rounded-[5px] bg-primary text-white">
          <Sparkles size={10} />
        </span>
        <span className="text-xs text-ink2">FlowPilot</span>
      </div>

      <div className="titlebar-controls">
        <button
          type="button"
          className="caption-btn"
          aria-label="最小化"
          onClick={() => window.desktop?.minimize()}
        >
          <MinGlyph />
        </button>
        <button
          type="button"
          className="caption-btn"
          aria-label={maximized ? '还原' : '最大化'}
          onClick={() => window.desktop?.toggleMaximize()}
        >
          {maximized ? <RestoreGlyph /> : <MaxGlyph />}
        </button>
        <button
          type="button"
          className="caption-btn caption-btn-close"
          aria-label="关闭"
          onClick={() => window.desktop?.close()}
        >
          <CloseGlyph />
        </button>
      </div>
    </header>
  )
}
