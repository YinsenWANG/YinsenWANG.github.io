// 用与构建一致的 remark 管线渲染文章，找出渲染后仍残留 ** 的源行
import { readFileSync } from 'fs'
import { remark } from 'remark'
import remarkGfm from 'remark-gfm'
import remarkHtml from 'remark-html'

const FILE = 'src/content/posts/git-for-agent-brain-seven-days.md'
const src = readFileSync(FILE, 'utf8')
const body = src.replace(/^---[\s\S]*?---\n/, '')
const out = await remark().use(remarkGfm).use(remarkHtml).process(body)
const html = String(out)
// 找出 html 里裸露的 **（不在 code 里）
const stripped = html.replace(/<code[^>]*>[\s\S]*?<\/code>/g, '').replace(/<pre[\s\S]*?<\/pre>/g, '')
const residues = [...stripped.matchAll(/\*\*[^<]{0,60}/g)].map((m) => m[0])
console.log("残留 ** 数:", residues.length)
residues.forEach((r) => console.log(" -", r.slice(0, 60)))
// 映射回源行号
for (const r of residues) {
  const key = r.replace(/\*\*/g, '').slice(0, 18)
  const lineIdx = body.split('\n').findIndex((l) => l.includes(key))
  console.log("源行(正文内):", lineIdx + 1, "→", key)
}
