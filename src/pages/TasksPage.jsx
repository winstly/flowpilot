import { useState, useReducer } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  Workflow, Bot, Puzzle, FolderOpen, Paperclip, X, TriangleAlert,
  Clock, GitFork, MessageSquareWarning, SendHorizonal, Trash2, Share,
} from 'lucide-react'
import { PageHeader, Badge } from '@/components/ui'
import ResourceDialog from '@/components/ResourceDialog'
import ConfirmDialog from '@/components/ConfirmDialog'
import WorkflowPublishDialog from '@/components/WorkflowPublishDialog'
import { taskStore } from '@/store/taskStore'
import { publishWorkflowFromTask } from '@/store/marketStore'
import { TASK_STATUS } from '@/data/tasks'
import { getWorkflow } from '@/data/workflows'
import { agents } from '@/data/agents'
import { resources } from '@/data/resources'

const CFG_BUTTONS = [
  { type: 'workflow', icon: Workflow, label: '绑定 Workflow（单选）' },
  { type: 'agent', icon: Bot, label: '配置 Agent（可多选）' },
  { type: 'skill', icon: Puzzle, label: '配置 Skill（可多选）' },
  { type: 'dir', icon: FolderOpen, label: '选择存储目录' },
  { type: 'attach', icon: Paperclip, label: '添加附件（仅元数据）' },
]

const nameOf = {
  workflow: (id) => getWorkflow(id)?.name,
  agent: (id) => agents.find((a) => a.id === id)?.name,
  skill: (id) => resources.find((r) => r.id === id)?.name,
  dir: (id) => id,
  attach: (id) => id,
}

export default function TasksPage() {
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [sel, setSel] = useState({ workflow: '', agents: [], skills: [], dir: '', attachments: [] })
  const [dlgType, setDlgType] = useState(null)
  const [pubTask, setPubTask] = useState(null) // 结束且被选中申请发布的任务

  // 任务结束后的 Workflow 发布入口：AI 草稿 + 对话调整 → 进入市场待审批
  const publishFromTask = (draft) => {
    const res = publishWorkflowFromTask(pubTask, draft)
    toast(`「${res.name}」已提交申请，待审批`)
  }

  const tasks = taskStore.list()
  const hasSel = Boolean(sel.workflow || sel.dir) || sel.agents.length > 0 || sel.skills.length > 0 || sel.attachments.length > 0
  const inProgress = tasks.filter((t) => ['running', 'pending', 'draft'].includes(t.status)).slice(0, 5)
  const finished = tasks.filter((t) => ['done', 'fail'].includes(t.status)).slice(0, 5)

  const removeChip = (key, id) =>
    setSel((s) => ({ ...s, [key]: s[key].filter((x) => x !== id) }))

  const create = () => {
    if (!text.trim()) return toast('请先描述你要完成的任务')
    if (!sel.workflow) return toast('请先绑定一个 Workflow')
    const t = taskStore.add({
      title: text.trim().slice(0, 60),
      workflowId: sel.workflow,
      agents: sel.agents,
      skills: sel.skills,
      dir: sel.dir,
      attachments: sel.attachments,
    })
    setText('')
    setSel({ workflow: '', agents: [], skills: [], dir: '', attachments: [] })
    toast(`任务 ${t.id} 已创建`)
  }

  return (
    <>
      <PageHeader title="任务与对话" />

      {/* 创建面板 */}
      <div className="panel mx-auto w-full max-w-[760px] p-5 shadow-card">
        <textarea
          className="w-full resize-none bg-transparent text-sm leading-relaxed text-ink outline-none placeholder:text-faint"
          rows={4}
          maxLength={1200}
          placeholder="描述你要完成的任务，例如：生成 10 月第 4 周竞品周报，重点对比定价与渠道…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="mt-3 flex items-center gap-1.5">
          {CFG_BUTTONS.map(({ type, icon: Icon, label }) => (
            <button key={type} className="iconbtn" title={label} aria-label={label} onClick={() => setDlgType(type)}>
              <Icon size={17} strokeWidth={1.8} />
            </button>
          ))}
          <div className="flex-1" />
          <span className="mr-2 text-xs text-mute">{text.length} / 1200</span>
          <button className="btn-primary" onClick={create}>
            <SendHorizonal size={14} />
            创建任务
          </button>
        </div>

        {/* 已选 chips：只有目录 / 附件可删 */}
        {hasSel && (
          <div className="mt-3.5 flex flex-wrap gap-1.5">
            {sel.workflow && (
              <span className="chip chip-accent"><Workflow size={12} />{nameOf.workflow(sel.workflow)}</span>
            )}
            {sel.agents.map((id) => (
              <span key={id} className="chip chip-accent"><Bot size={12} />{nameOf.agent(id)}</span>
            ))}
            {sel.skills.map((id) => (
              <span key={id} className="chip chip-accent"><Puzzle size={12} />{nameOf.skill(id)}</span>
            ))}
            {sel.dir && (
              <span className="chip chip-neutral">
                <FolderOpen size={12} />{sel.dir}
                <button onClick={() => setSel((s) => ({ ...s, dir: '' }))} aria-label="移除目录" className="ml-0.5 opacity-60 hover:opacity-100">
                  <X size={11.5} strokeWidth={2.5} />
                </button>
              </span>
            )}
            {sel.attachments.map((f) => (
              <span key={f} className="chip chip-neutral">
                <Paperclip size={12} />{f}
                <button onClick={() => removeChip('attachments', f)} aria-label={`移除 ${f}`} className="ml-0.5 opacity-60 hover:opacity-100">
                  <X size={11.5} strokeWidth={2.5} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="notice mt-3.5">
          <TriangleAlert size={14} />
          演示原型：绑定关系仅写入本页内存，刷新即还原；附件不实际上传。
        </div>
      </div>

      {/* 双列表 */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TaskList title="进行中" tasks={inProgress} onOpen={(id) => navigate(`/tasks/${id}/run`)} />
        <TaskList
          title="已完结"
          tasks={finished}
          onOpen={(id) => navigate(`/tasks/${id}/run`)}
          onPublish={(t) => setPubTask(t)}
        />
      </div>

      {/* 任务结束后的发布申请：AI 草稿 + 对话调整 */}
      <WorkflowPublishDialog
        open={!!pubTask}
        onOpenChange={(o) => !o && setPubTask(null)}
        draft={pubTask ? { name: pubTask.title } : null}
        onPublish={publishFromTask}
      />

      <ResourceDialog
        type={dlgType}
        selected={
          dlgType === 'workflow' ? (sel.workflow ? [sel.workflow] : [])
          : dlgType === 'agent' ? sel.agents
          : dlgType === 'skill' ? sel.skills
          : dlgType === 'dir' ? (sel.dir ? [sel.dir] : [])
          : sel.attachments
        }
        onClose={() => setDlgType(null)}
        onConfirm={(type, picked) => {
          setDlgType(null)
          if (type === 'workflow') setSel((s) => ({ ...s, workflow: picked[0] || '' }))
          else if (type === 'dir') setSel((s) => ({ ...s, dir: picked[0] || '' }))
          else if (type === 'attach') setSel((s) => ({ ...s, attachments: picked }))
          else setSel((s) => ({ ...s, [type === 'agent' ? 'agents' : 'skills']: picked }))
        }}
      />
    </>
  )
}

function TaskList({ title, tasks, onOpen, onPublish }) {
  const [, force] = useReducer((x) => x + 1, 0)
  const [confirmDel, setConfirmDel] = useState(null)

  const deleteTask = () => {
    taskStore.remove(confirmDel.id)
    force()
    toast(`已删除任务「${confirmDel.title}」`)
  }

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
        {title}
        <span className="text-xs font-normal text-mute">{tasks.length} 条</span>
      </h2>
      <div className="flex flex-col gap-2.5">
        {tasks.map((t, i) => (
          <div
            key={t.id}
            role="button"
            tabIndex={0}
            onClick={() => onOpen(t.id)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen(t.id)}
            className="panel anim-rise group flex cursor-pointer items-center gap-4 px-4 py-3.5 text-left transition-all duration-[180ms] hover:border-brand-line2 hover:shadow-pop focus-visible:outline-2 focus-visible:outline-brand-line2"
            style={{ animationDelay: `${Math.min(i, 11) * 30}ms` }}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-ink">{t.title}</span>
              </div>
              <div className="meta-line mt-1.5">
                <span><Clock size={12} />{t.updatedAt}</span>
                <span><GitFork size={12} />{t.board.length} 节点</span>
                <span className={t.corrections ? 'text-amber' : ''}>
                  <MessageSquareWarning size={12} />
                  {t.corrections} 纠正
                </span>
              </div>
            </div>
            <Badge node={TASK_STATUS[t.status]} />
            {/* 任务成功结束 → 提供发布到团队的入口 */}
            {t.status === 'done' && onPublish && (
              <button
                className="btn-outline !py-1.5 !px-2.5 flex-none !text-xs"
                title="把本次任务的 Workflow 发布到团队"
                onClick={(e) => { e.stopPropagation(); onPublish(t) }}
              >
                <Share size={12} />
                申请发布
              </button>
            )}
            <button
              className="iconbtn iconbtn-danger !size-8 opacity-0 transition-opacity duration-[180ms] group-hover:opacity-100 focus-visible:opacity-100"
              title="删除任务"
              aria-label={`删除任务 ${t.title}`}
              onClick={(e) => { e.stopPropagation(); setConfirmDel(t) }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {tasks.length === 0 && (
          <div className="panel px-4 py-8 text-center text-sm text-mute">暂无任务</div>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={(o) => !o && setConfirmDel(null)}
        title={`删除任务「${confirmDel?.title}」？`}
        description="任务的对话记录、纠错与执行状态将一并清除，此操作不可撤销。"
        onConfirm={deleteTask}
      />
    </section>
  )
}
