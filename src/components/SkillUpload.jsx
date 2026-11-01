import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import {
  Upload, FolderUp, FileArchive, FolderTree, FileText, Sparkles,
} from 'lucide-react'

// Skill 文件上传区（受控）：ZIP / 文件夹导入 + 标准目录结构 + 树预览
// 发布信息（名称/说明/标签）由外层统一表单提供——与其他类型的申请发布字段一致
// props: fileTree（已解析的文件树）, onFiles(tree|null), mode='publish'|'edit'
const STANDARD_DIRS = [
  { name: 'SKILL.md', type: 'file', desc: '核心入口：名称、描述、规则、步骤、触发条件', required: true },
  { name: 'references/', type: 'dir', desc: '参考资料，供模型按需读取', required: false },
  { name: 'scripts/', type: 'dir', desc: '可执行脚本，供模型触发执行', required: false },
  { name: 'assets/', type: 'dir', desc: '示例、模板、样例输入输出', required: false },
]

export default function SkillUpload({ fileTree, onFiles, mode = 'publish' }) {
  const [channel, setChannel] = useState(null) // 'zip' | 'folder'：上传区高亮
  const zipRef = useRef(null)
  const folderRef = useRef(null)

  const handleZip = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setChannel('zip')
    try {
      const JSZip = (await import('jszip')).default
      const zip = await JSZip.loadAsync(file)
      const files = Object.keys(zip.files).filter((f) => !zip.files[f].dir)
      onFiles(buildTree(files))
      toast(`ZIP 解析完成，${files.length} 个文件`)
    } catch {
      toast('ZIP 解析失败，请检查文件格式')
    }
  }

  const handleFolder = (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setChannel('folder')
    const paths = files.map((f) => f.webkitRelativePath || f.name)
    onFiles(buildTree(paths))
    toast(`文件夹导入完成，${files.length} 个文件`)
  }

  return (
    <div className="rounded-panel border border-line p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Sparkles size={15} className="text-brand" />
        {mode === 'edit' ? '更新 Skill 文件' : 'Skill 文件'}
      </div>
      <p className="mt-1 text-xs text-ink2">
        上传 ZIP 压缩包或选择文件夹。标准目录结构：SKILL.md + references/ + scripts/ + assets/
      </p>

      {/* 上传区 */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          className={`flex flex-col items-center gap-2 rounded-btn border-2 border-dashed px-4 py-5 transition-colors ${
            channel === 'zip' ? 'border-brand bg-brand-soft/40' : 'border-line hover:border-brand-line2'
          }`}
          onClick={() => zipRef.current?.click()}
        >
          <FileArchive size={22} className="text-brand" />
          <span className="text-xs font-medium text-ink">上传 ZIP</span>
          <span className="text-xs text-mute">打包好的 Skill 目录</span>
        </button>
        <button
          type="button"
          className={`flex flex-col items-center gap-2 rounded-btn border-2 border-dashed px-4 py-5 transition-colors ${
            channel === 'folder' ? 'border-brand bg-brand-soft/40' : 'border-line hover:border-brand-line2'
          }`}
          onClick={() => folderRef.current?.click()}
        >
          <FolderUp size={22} className="text-brand" />
          <span className="text-xs font-medium text-ink">选择文件夹</span>
          <span className="text-xs text-mute">从本地目录导入</span>
        </button>
      </div>

      <input ref={zipRef} type="file" accept=".zip" hidden onChange={handleZip} />
      <input ref={folderRef} type="file" webkitdirectory="" directory="" hidden multiple onChange={handleFolder} />

      {/* 标准目录结构参考 */}
      <div className="mt-4">
        <div className="mb-1.5 block-label">标准目录结构</div>
        <div className="rounded-btn bg-canvas p-3">
          {STANDARD_DIRS.map((d) => (
            <div key={d.name} className="flex items-center gap-2 py-1 text-xs">
              {d.type === 'dir' ? <FolderTree size={12} className="text-mute" /> : <FileText size={12} className="text-brand" />}
              <span className="font-mono text-ink">{d.name}</span>
              {d.required && <span className="chip chip-accent !py-0 !text-xs">必需</span>}
              <span className="text-mute">{d.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 上传结果 */}
      {fileTree && (
        <div className="anim-drop mt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <div className="block-label">上传内容</div>
            <button
              type="button"
              className="text-xs text-mute transition-colors hover:text-fail"
              onClick={() => { onFiles(null); setChannel(null) }}
            >
              清除
            </button>
          </div>
          <div className="rounded-btn border border-line p-3">
            <TreePreview items={fileTree} />
          </div>
        </div>
      )}
    </div>
  )
}

function buildTree(paths) {
  const root = {}
  paths.forEach((p) => {
    const parts = p.split('/').filter(Boolean)
    let cur = root
    parts.forEach((part, i) => {
      const isFile = i === parts.length - 1
      if (!cur[part]) cur[part] = isFile ? { type: 'file', name: part } : { type: 'dir', name: part, children: {} }
      if (!isFile) cur = cur[part].children
    })
  })
  return Object.values(root).map((n) =>
    n.type === 'dir' ? { ...n, children: Object.values(n.children) } : n,
  )
}

function TreePreview({ items, depth = 0 }) {
  return (
    <div>
      {items.map((item) => (
        <div key={item.name} style={{ paddingLeft: depth * 16 }}>
          <div className="flex items-center gap-1.5 py-0.5 text-xs">
            {item.type === 'dir' ? (
              <FolderTree size={11} className="text-mute" />
            ) : (
              <FileText size={11} className="text-brand" />
            )}
            <span className={`font-mono ${item.name === 'SKILL.md' ? 'font-semibold text-brand' : 'text-ink'}`}>
              {item.name}
            </span>
          </div>
          {item.type === 'dir' && item.children && (
            <TreePreview items={item.children} depth={depth + 1} />
          )}
        </div>
      ))}
    </div>
  )
}
