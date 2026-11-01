import { useEffect, useState } from 'react'
import { Dialog } from 'radix-ui'
import { X, Zap, CircleCheck, CircleAlert } from 'lucide-react'
import toast from 'react-hot-toast'

/* 接口与模型配置：头像旁设置图标唤起的模态框。
   连接 = baseUrl + API Token；模型槽位按用途分列（主/Mythos/Fable/Opus/Sonnet/Haiku）。 */

// 模型槽位：label 与存储键一一对应，后续新增等级只加一行
const MODEL_SLOTS = [
  { key: 'main', label: '主模型', hint: '默认执行模型' },
  { key: 'mythos', label: 'Mythos 模型', hint: '' },
  { key: 'fable', label: 'Fable 模型', hint: '' },
  { key: 'opus', label: 'Opus 模型', hint: '' },
  { key: 'sonnet', label: 'Sonnet 模型', hint: '' },
  { key: 'haiku', label: 'Haiku 模型', hint: '' },
]

const EMPTY = { base_url: '', api_key: '', models: {} }

export default function SettingsDialog({ open, onOpenChange }) {
  const [cfg, setCfg] = useState(EMPTY)
  const [testState, setTestState] = useState(null) // {ok,message} | {busy:true}

  useEffect(() => {
    if (open) {
      window.settings.get().then((c) => setCfg({ ...EMPTY, ...c, models: { ...c.models } }))
      setTestState(null)
    }
  }, [open])

  const setModel = (key, value) => setCfg((c) => ({ ...c, models: { ...c.models, [key]: value } }))

  const runTest = async () => {
    setTestState({ busy: true })
    setTestState(await window.settings.test({ baseUrl: cfg.base_url, apiKey: cfg.api_key, model: (cfg.models.main || '').trim() }))
  }

  const submit = async () => {
    if (!cfg.base_url.trim() || !cfg.api_key.trim()) {
      return toast('请填写 Base URL 与 API Token')
    }
    await window.settings.save({
      base_url: cfg.base_url.trim(),
      api_key: cfg.api_key.trim(),
      models: Object.fromEntries(Object.entries(cfg.models).map(([k, v]) => [k, (v ?? '').trim()])),
    })
    onOpenChange(false)
    toast('配置已保存')
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="radix-overlay fixed inset-0 z-50" />
        <Dialog.Content className="radix-content osd-shell fixed left-1/2 top-[max(80px,15vh)] z-[60] flex max-h-[82vh] w-[560px] max-w-[calc(100vw-40px)] -translate-x-1/2 flex-col p-0">
          <div className="dlg-body p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="mb-1 block-label">设置</div>
                <Dialog.Title className="text-sm font-semibold text-ink">接口与模型配置</Dialog.Title>
              </div>
              <Dialog.Close asChild>
                <button className="iconbtn" aria-label="关闭"><X size={16} /></button>
              </Dialog.Close>
            </div>

            {/* 连接 */}
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">Base URL <span className="text-fail">*</span></label>
                <input
                  className="field font-mono" maxLength={160} placeholder="https://api.example.com/v1"
                  value={cfg.base_url}
                  onChange={(e) => setCfg({ ...cfg, base_url: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">API Token <span className="text-fail">*</span></label>
                <input
                  className="field font-mono" type="password" maxLength={200} placeholder="sk-..."
                  value={cfg.api_key}
                  onChange={(e) => setCfg({ ...cfg, api_key: e.target.value })}
                />
              </div>
            </div>

            {/* 模型槽位 */}
            <div className="mt-5 block-label">模型</div>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {MODEL_SLOTS.map((s) => (
                <div key={s.key}>
                  <label className="mb-1.5 block text-sm font-medium text-ink">{s.label}</label>
                  <input
                    className="field font-mono" maxLength={80} placeholder={s.hint || 'model-id'}
                    value={cfg.models[s.key] ?? ''}
                    onChange={(e) => setModel(s.key, e.target.value)}
                  />
                </div>
              ))}
            </div>

            {/* 连接测试 */}
            <div className="mt-5 flex items-center gap-2.5">
              <button
                className="btn-outline !text-xs"
                disabled={testState?.busy || !cfg.base_url.trim() || !cfg.api_key.trim()}
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

            <div className="mt-5 flex justify-end gap-2">
              <Dialog.Close asChild><button className="btn-ghost">取消</button></Dialog.Close>
              <button className="btn-primary" onClick={submit}>保存</button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
