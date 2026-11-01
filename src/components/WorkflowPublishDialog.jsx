import { useEffect, useState } from 'react'
import { Dialog } from 'radix-ui'
import { ok, warn, fail, info } from '@/lib/toast'
import { X, Sparkles, CheckCircle2 } from 'lucide-react'
import TagInput from './TagInput'

// Workflow 发布申请：AI 依任务执行结果生成名称、说明、标签，用户微调后提交
// 入口在任务结束后（任务卡 / 运行页）
// props: open, onOpenChange, onPublish(draft), draft?={name, desc}（来源上下文预填）
export default function WorkflowPublishDialog({ open, onOpenChange, onPublish, draft }) {
  const [pub, setPub] = useState({ name: '', desc: '', tags: [] })

  useEffect(() => {
    if (!open) return
    setPub({
      name: draft?.name || '智能数据调研流水线',
      desc: draft?.desc || '自动聚合多渠道数据源，完成清洗、分析与结论输出，生成结构化调研报告。',
      tags: ['数据', '自动化'],
    })
  }, [open, draft?.name, draft?.desc])

  const submit = () => {
    const name = pub.name.trim()
    if (!name) return warn('请填写名称')
    onPublish({ name, desc: pub.desc.trim(), tags: [...pub.tags] })
    onOpenChange(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {/* 运行页是 z-50 全屏层，此弹窗从那里唤起：遮罩/内容须压过 z-50，否则背后不变暗 */}
        <Dialog.Overlay className="radix-overlay fixed inset-0 z-[60]" />
        <Dialog.Content className="radix-content osd-shell fixed left-1/2 top-[max(80px,15vh)] z-[70] flex max-h-[82vh] w-[480px] max-w-[calc(100vw-40px)] -translate-x-1/2 flex-col p-0">
         <div className="dlg-body p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="mb-1 block-label">发布申请</div>
              <Dialog.Title className="text-sm font-semibold text-ink">向团队发布 Workflow</Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button className="iconbtn" aria-label="关闭"><X size={16} /></button>
            </Dialog.Close>
          </div>

          {/* AI 生成提示 */}
          <div className="mt-4 flex items-center gap-2 rounded-btn bg-brand-soft px-3.5 py-2.5 text-xs text-brand-deep">
            <Sparkles size={14} className="flex-none" />
            AI 已生成发布信息，确认或微调后提交即可。
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">名称 <span className="text-fail">*</span></label>
              <input
                className="field" maxLength={40}
                value={pub.name} onChange={(e) => setPub({ ...pub, name: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">说明</label>
              <textarea
                className="field resize-none" rows={3} maxLength={200}
                value={pub.desc} onChange={(e) => setPub({ ...pub, desc: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">标签</label>
              <TagInput
                value={pub.tags}
                onChange={(tags) => setPub({ ...pub, tags })}
                suggestions={['周报', '竞品', '内容', '自动化', '数据']}
              />
            </div>
            <div className="notice">
              <CheckCircle2 size={14} />
              提交后进入「待发布」状态，由团队负责人审批后生效。
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild><button className="btn-ghost">取消</button></Dialog.Close>
            <button className="btn-primary" onClick={submit}>提交申请</button>
          </div>
         </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
