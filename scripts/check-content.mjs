/* eslint-disable no-console */
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";

const root = process.cwd();
const postsRoot = join(root, "src/content/posts");
const errors = [];
const slugs = new Map();

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith("_")) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if ([".md", ".mdx"].includes(extname(entry.name))) files.push(path);
  }
  return files;
}

function scalar(frontmatter, key) {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return match?.[1]?.trim().replace(/^(["'])(.*)\1$/, "$2");
}

function report(file, message) {
  errors.push(`${file.replace(`${root}/`, "")}: ${message}`);
}

for (const file of await walk(postsRoot)) {
  const relativeName = basename(file);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.(md|mdx)$/.test(relativeName)) {
    report(file, "文件名必须使用小写 ASCII kebab-case。");
  }

  const slug = relativeName.replace(/\.(md|mdx)$/, "");
  if (slugs.has(slug)) report(file, `与 ${slugs.get(slug)} 使用了重复 slug。`);
  slugs.set(slug, file.replace(`${root}/`, ""));

  const source = await readFile(file, "utf8");
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    report(file, "缺少有效的 frontmatter。");
    continue;
  }

  const frontmatter = match[1];
  for (const key of ["title", "description", "pubDatetime", "draft", "tags"]) {
    if (!new RegExp(`^${key}:`, "m").test(frontmatter)) report(file, `缺少必填字段 ${key}。`);
  }

  const description = scalar(frontmatter, "description") ?? "";
  if (description.length < 20 || description.length > 180) {
    report(file, "description 建议保持在 20–180 个字符之间。");
  }

  const date = scalar(frontmatter, "pubDatetime");
  if (date && Number.isNaN(Date.parse(date))) report(file, "pubDatetime 不是有效时间。");

  const draft = scalar(frontmatter, "draft");
  if (draft && !["true", "false"].includes(draft)) report(file, "draft 只能是 true 或 false。");

  const ogImage = scalar(frontmatter, "ogImage");
  if (ogImage && !/^https?:\/\//.test(ogImage)) {
    const target = ogImage.startsWith("/")
      ? resolve(root, "public", ogImage.slice(1))
      : resolve(dirname(file), ogImage);
    if (!existsSync(target)) report(file, `找不到 ogImage: ${ogImage}`);
  }

  for (const image of source.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)) {
    const [, alt, path] = image;
    if (!alt.trim()) report(file, `图片 ${path} 缺少替代文字。`);
    if (!/^(https?:\/\/|data:|@\/)/.test(path)) {
      const target = path.startsWith("/")
        ? resolve(root, "public", path.slice(1))
        : resolve(dirname(file), path);
      if (!existsSync(target)) report(file, `找不到图片: ${path}`);
    }
  }

  if (/(github_pat_|ghp_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,})/.test(source)) {
    report(file, "内容中出现疑似访问令牌的文本。");
  }
}

if (errors.length) {
  console.error(`\n内容检查失败（${errors.length} 项）：\n- ${errors.join("\n- ")}\n`);
  process.exit(1);
}

console.log(`内容检查通过：${slugs.size} 篇文章。`);
