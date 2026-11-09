// 任务工作目录内的文件工具：read / write / search
// 边界：一切路径解析到 workdir 内（防目录穿越）；write 的落盘文件即节点交付产出物
const path = require('node:path')
const fsp = require('node:fs/promises')
const { Type } = require('typebox')

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.venv'])
const MAX_SCAN_FILES = 3000
const MAX_READ_CHARS = 30000
const MAX_READ_BYTES = MAX_READ_CHARS * 4 // 只读够解码出截断上限的字节
const MAX_SCAN_BYTES = 2 * 1024 * 1024 // search 内容匹配只扫 ≤2MB 的文件

module.exports = function createFileTools({ workdir, onWrite = () => {} }) {
  const root = path.resolve(workdir)
  // 字面包含检查：用 path.relative（win32 大小写不敏感），相对路径以 root 为界
  const insideOf = (base, full) => {
    const r = path.relative(base, full)
    return r === '' || !(r === '..' || r.startsWith('..' + path.sep) || path.isAbsolute(r))
  }
  const resolveIn = (rel) => {
    const full = path.resolve(root, String(rel || '.'))
    if (!insideOf(root, full)) {
      throw new Error(`路径越界：只允许工作目录内的路径（${rel}）`)
    }
    return full
  }
  const relOf = (full) => path.relative(root, full).split(path.sep).join('/') || '.'

  // 真实路径检查：symlink/junction 不能把读写带出工作目录
  const assertRealInside = async (full, forWrite = false) => {
    let real
    try {
      real = await fsp.realpath(full)
    } catch {
      if (!forWrite) return full // 不存在的路径交给调用方按"不存在"处理
      const parent = await fsp.realpath(path.dirname(full)).catch(() => null)
      if (!parent) throw new Error(`路径越界：父目录不可用（${full}）`)
      if (!insideOf(await fsp.realpath(root), parent)) {
        throw new Error(`路径越界：符号链接指向工作目录之外（${full}）`)
      }
      return full
    }
    if (!insideOf(await fsp.realpath(root), real)) {
      throw new Error(`路径越界：符号链接指向工作目录之外（${full}）`)
    }
    return real
  }

  const readTool = {
    name: 'read',
    label: '读文件',
    description: `读取工作目录内的文件（文本，超长截断）；传目录则列出条目。相对路径以工作目录为根。`,
    parameters: Type.Object({ path: Type.String({ description: '相对工作目录的文件/目录路径' }) }),
    async execute(_id, params) {
      const full = resolveIn(params.path)
      const st = await fsp.stat(full).catch(() => null)
      if (!st) return { content: [{ type: 'text', text: `不存在：${params.path}` }], details: null, isError: true }
      await assertRealInside(full) // symlink/junction 指向目录外时抛错（目录列举与文件读取同一关口）
      if (st.isDirectory()) {
        const names = await fsp.readdir(full)
        return {
          content: [{ type: 'text', text: `目录 ${relOf(full)} 共 ${names.length} 项：\n${names.slice(0, 100).join('\n')}` }],
          details: { entries: names.length },
        }
      }
      // 只读够截断上限的字节，超大文件不整读进内存
      const fh = await fsp.open(full, 'r')
      let text
      try {
        const buf = Buffer.alloc(Math.min(MAX_READ_BYTES, st.size))
        await fh.read(buf, 0, buf.length, 0)
        text = buf.toString('utf8')
      } finally {
        await fh.close()
      }
      const clipped = text.length > MAX_READ_CHARS
        ? `${text.slice(0, MAX_READ_CHARS)}\n…(截断，全文 ${st.size} 字节)`
        : text
      return { content: [{ type: 'text', text: clipped }], details: { bytes: st.size } }
    },
  }

  const writeTool = {
    name: 'write',
    label: '写文件',
    description: '把交付产物写入工作目录（自动建父目录、覆盖写）。交付物必须落盘为真实文件，如 html / md / py / json / csv 等。',
    parameters: Type.Object({
      path: Type.String({ description: '相对工作目录的文件路径' }),
      content: Type.String({ description: '完整文件内容' }),
    }),
    async execute(_id, params) {
      const full = resolveIn(params.path)
      const content = String(params.content ?? '')
      await fsp.mkdir(path.dirname(full), { recursive: true })
      await assertRealInside(full, true) // 目标（或其父目录）是 symlink 且指向目录外时抛错
      await fsp.writeFile(full, content, 'utf8')
      onWrite({ name: path.basename(full), path: full })
      return {
        content: [{ type: 'text', text: `已写入 ${relOf(full)}（${Buffer.byteLength(content)} 字节）` }],
        details: { path: full, bytes: Buffer.byteLength(content) },
      }
    },
  }

  const searchTool = {
    name: 'search',
    label: '搜索',
    description: '在工作目录内搜索：同时匹配文件名与文本内容，返回「路径:行号 命中行」。跳过 node_modules/.git 等目录。',
    parameters: Type.Object({
      query: Type.String({ description: '关键词（大小写不敏感）' }),
      path: Type.Optional(Type.String({ description: '限定子目录（可选）' })),
      maxResults: Type.Optional(Type.Number({ description: '最多返回条数，默认 20' })),
    }),
    async execute(_id, params) {
      const base = resolveIn(params.path || '.')
      const q = String(params.query || '').toLowerCase()
      const max = Math.min(Number(params.maxResults) || 20, 100)
      const hits = []
      let scanned = 0
      const walk = async (dir) => {
        if (hits.length >= max || scanned >= MAX_SCAN_FILES) return
        let entries
        try { entries = await fsp.readdir(dir, { withFileTypes: true }) } catch { return }
        for (const ent of entries) {
          if (hits.length >= max || scanned >= MAX_SCAN_FILES) return
          const full = path.join(dir, ent.name)
          if (ent.isSymbolicLink()) continue // 不跟随符号链接，防跳出工作目录
          if (ent.isDirectory()) {
            if (!SKIP_DIRS.has(ent.name) && !ent.name.startsWith('.')) await walk(full)
            continue
          }
          if (!ent.isFile()) continue
          scanned++
          const rel = relOf(full)
          if (ent.name.toLowerCase().includes(q)) hits.push(`${rel}（文件名命中）`)
          if (hits.length >= max) continue
          try {
            const st = await fsp.stat(full)
            if (st.size > MAX_SCAN_BYTES) continue // 超大文件不做内容匹配，防内存峰值
            const text = await fsp.readFile(full, 'utf8')
            text.split('\n').forEach((line, i) => {
              if (hits.length < max && line.toLowerCase().includes(q)) {
                hits.push(`${rel}:${i + 1}  ${line.trim().slice(0, 120)}`)
              }
            })
          } catch { /* 二进制/不可读文件跳过 */ }
        }
      }
      await walk(base)
      return {
        content: [{
          type: 'text',
          text: hits.length
            ? `命中 ${hits.length} 条（扫描 ${scanned} 个文件）：\n${hits.join('\n')}`
            : `无命中（扫描 ${scanned} 个文件）`,
        }],
        details: { hits: hits.length, scanned },
      }
    },
  }

  return [readTool, writeTool, searchTool]
}
