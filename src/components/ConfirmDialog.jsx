import { Dialog } from 'radix-ui'
import { TriangleAlert, X } from 'lucide-react'

// 破坏性操作确认弹窗（UX 规则：删除前必须确认）
export default function ConfirmDialog({ open, onOpenChange, title, description, confirmText = '删除', onConfirm }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="radix-overlay fixed inset-0 z-50" />
        <Dialog.Content className="radix-content fixed left-1/2 top-1/2 z-[60] w-[400px] max-w-[calc(100vw-40px)] -translate-x-1/2 -translate-y-1/2 p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <span className="flex size-9 flex-none items-center justify-center rounded-full bg-fail-soft text-fail">
                <TriangleAlert size={17} />
              </span>
              <div>
                <Dialog.Title className="text-[16px] font-semibold text-ink">{title}</Dialog.Title>
                <Dialog.Description className="mt-1 text-[13px] leading-relaxed text-ink2">
                  {description}
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button className="iconbtn" aria-label="关闭"><X size={16} /></button>
            </Dialog.Close>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button className="btn-ghost">取消</button>
            </Dialog.Close>
            <Dialog.Close asChild>
              <button className="btn-danger" onClick={onConfirm}>{confirmText}</button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
