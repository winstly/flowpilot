import { useEffect, useState } from 'react'
import { Dialog } from 'radix-ui'
import { Plus, X, Pencil, Trash2, Zap, CircleCheck, CircleAlert, KeyRound } from 'lucide-react'
import toast from 'react-hot-toast'
import { PageHeader, TelemetryLine, Badge } from '@/components/ui'
import ConfirmDialog from '@/components/ConfirmDialog'

const EMPTY = { name: '', model: '', base_url: '', api_key: '', note: '', enabled: 1 }

// API Key 展示态：只露首尾各 3 位
const mask = (k) => (k && k.length > 8 ? `${k.slice(0, 3)}****${k.slice(-3)}` : k ? '****' : '')

export default function SettingsPage() {
  const [rows, setRows] = useState([])
  const [editing, setEditing] = useState(null) // null | {..表单}
  const [confirmDel, setConfirmDel] = useState(null)
  const [testState, setTestState] = useState(null) // {ok, message} | {busy:true}

  const refresh = () => window.settings.list().then(setRows)
  useEffect(() => { refresh() }, [])

  const runTest = async () => {
    setTestState({ busy: true })
    const r = await window.settings.test({ baseUrl: editing.base_url, apiKey: editing.api_key })
    setTestState(r)
  }

  const submit = async () => {
    if (!editing.name.trim() || !editing.model.trim() || !editing.base_url.trim() || !editing.api_key.trim()) {
      return toast('请完整填写等级名称、模型、Base URL 与 API Key')
    }
    await window.settings.save({ ...editing, name: editing.name.trim(), model: editing.model.trim() })
    setEditing(null)
    setTestState(null)
    refresh()
    toast('模型等级已保存')
  }

  const enabledCount = rows.filter((r) => r.enabled).length

  return (
    <>
      <PageHeader
        title="模型配置"
        actions={
          <button className="btn-primary" onClick={() => { setEditing({ ...EMPTY }); setTestState(null) }}>
            <Plus size={15} />
            新建等级
          </button>
        }
      />

      <TelemetryLine
        className="mb-5"
        items={[
          { value: rows.length, label: '等级' },
          { value: enabledCount, label: '已启用' },
        ]}
      />

      <section className="panel">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-4 border-b border-line px-5 py-3.5 last:border-b-0">
            <span className="flex size-9 flex-none items-center justify-center rounded-btn bg-subtle text-ink2">
              <KeyRound size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-ink">{r.name}</span>
                <Badge node={r.enabled ? { cls: 'badge-ok', label: '启用' } : { cls: 'badge-mute', label: '停用' }} />
              </div>
              <div className="meta-line mt-1">
                <span>{r.model}</span>
                <span>{r.base_url}</span>
                <span>{mask(r.api_key)}</span>
              </div>
            </div>
            <div className="flex flex-none items-center gap-1.5">
              <button
                className="btn-ghost !px-2.5 !text-xs"
                onClick={async () => {
                  const res = await window.settings.test({ baseUrl: r.base_url, apiKey: r.api_key })
                  toast[res.ok ? 'success' : 'error'](`${r.name}：${res.message}`)
                }}
              >
                <Zap size={13} />测试
              </button>
              <button
                className="btn-ghost !px-2.5 !text-xs"
                onClick={() => { setEditing({ ...r, enabled: r.enabled ? 1 : 0 }); setTestState(null) }}
              >
                <Pencil size={13} />编辑
              </button>
              <button
                className="btn-danger-ghost !px-2.5 !text-xs"
                aria-label={`删除 ${r.name}`}
                onClick={() => setConfirmDel(r)}
              >
                <Trash2 size={13} />删除
              </button>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="px-5 py-12 text-center text-sm text-mute">
            还没有模型等级，点击「新建等级」录入模型、Base URL 与 API Key。
          </div>
        )}
      </section>

      {/* 新建 / 编辑：等级表单 */}
      <Dialog.Root open={!!editing} onOpenChange={(o) => { if (!o) { setEditing(null); setTestState(null) } }}>
        <Dialog.Portal>
          <Dialog.Overlay className="radix-overlay fixed inset-0 z-50" />
          <Dialog.Content className="radix-content osd-shell fixed left-1/2 top-[max(80px,15vh)] z-[60] flex max-h-[82vh] w-[520px] max-w-[calc(100vw-40px)] -translate-x-1/2 flex-col p-0">
            <div className="dlg-body p-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="mb-1 block-label">模型配置</div>
                  <Dialog.Title className="text-sm font-semibold text-ink">
                    {editing?.id ? '编辑等级' : '新建等级'}
                  </Dialog.Title>
                </div>
                <Dialog.Close asChild>
                  <button className="iconbtn" aria-label="关闭"><X size={16} /></button>
                </Dialog.Close>
              </div>

              <div className="mt-4 space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink">等级名称 <span className="text-fail">*</span></label>
                  <input
                    className="field" maxLength={20} placeholder="如：轻量 / 标准 / 旗舰"
                    value={editing?.name ?? ''}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink">模型 <span className="text-fail">*</span></label>
                  <input
                    className="field font-mono" maxLength={80} placeholder="如：deepseek-chat"
                    value={editing?.model ?? ''}
                    onChange={(e) => setEditing({ ...editing, model: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink">Base URL <span className="text-fail">*</span></label>
                  <input
                    className="field font-mono" maxLength={160} placeholder="https://api.example.com/v1"
                    value={editing?.base_url ?? ''}
                    onChange={(e) => setEditing({ ...editing, base_url: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink">API Key <span className="text-fail">*</span></label>
                  <input
                    className="field font-mono" type="password" maxLength={200} placeholder="sk-..."
                    value={editing?.api_key ?? ''}
                    onChange={(e) => setEditing({ ...editing, api_key: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink">备注</label>
                  <input
                    className="field" maxLength={60} placeholder="用途说明，可留空"
                    value={editing?.note ?? ''}
                    onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                  />
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-ink2">
                  <input
                    type="checkbox"
                    checked={!!editing?.enabled}
                    onChange={(e) => setEditing({ ...editing, enabled: e.target.checked ? 1 : 0 })}
                  />
                  启用该等级
                </label>

                {/* 连接测试：录入时即刻校验 */}
                <div className="flex items-center gap-2.5">
                  <button
                    className="btn-outline !text-xs"
                    disabled={testState?.busy || !editing?.base_url || !editing?.api_key}
                    onClick={runTest}
                  >
                    <Zap size={13} />
                    {testState?.busy ? '测试中…' : '测试连接'}
                  </button>
                  {testState && !testState.busy && (
                    <span className={`flex items-center gap-1 text-xs ${testState.ok ? 'text-ok' : 'text-fail'}`}>
                      {testState.ok ? <CircleCheck size={13} /> : <CircleAlert size={13} />}
                      {testState.message}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <Dialog.Close asChild><button className="btn-ghost">取消</button></Dialog.Close>
                <button className="btn-primary" onClick={submit}>保存</button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={(o) => !o && setConfirmDel(null)}
        title={`删除等级「${confirmDel?.name}」？`}
        description="该等级的模型、Base URL 与 API Key 将一并删除，此操作不可撤销。"
        onConfirm={async () => {
          await window.settings.remove(confirmDel.id)
          setConfirmDel(null)
          refresh()
          toast('已删除该等级')
        }}
      />
    </>
  )
}
