// 语义 toast：与徽章同源的"浅底深字"语言（成功/失败/警告/提示四态）
import toast from 'react-hot-toast'
import { CircleCheck, CircleAlert, TriangleAlert, Info } from 'lucide-react'

const mk = (icon, bg, fg, border, duration) => (message, opts = {}) =>
  toast(message, {
    icon,
    duration,
    style: {
      background: bg,
      color: fg,
      border: `1px solid ${border}`,
      borderRadius: 12,
      boxShadow: 'var(--shadow-toast)',
      fontSize: 14,
      fontWeight: 500,
    },
    ...opts,
  })

export const ok = mk(<CircleCheck size={15} />, 'var(--color-ok-soft)', 'var(--color-ok)', 'rgba(20,122,87,.2)', 2600)
export const fail = mk(<CircleAlert size={15} />, 'var(--color-fail-soft)', 'var(--color-fail)', 'rgba(178,69,34,.2)', 5200)
export const warn = mk(<TriangleAlert size={15} />, 'var(--color-warn-soft)', 'var(--color-warn)', 'rgba(143,95,16,.2)', 3600)
export const info = mk(<Info size={15} />, 'var(--color-panel)', 'var(--color-ink2)', 'var(--color-line)', 2600)

export default toast
