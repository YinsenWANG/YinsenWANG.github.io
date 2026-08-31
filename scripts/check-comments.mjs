/* eslint-disable no-console */
import { readdir, readFile } from "node:fs/promises";
import { basename, extname, join, relative, sep } from "node:path";

const root = process.cwd();
const postsRoot = join(root, "src/content/posts");
const commentsRoot = join(root, "src/data/comments");
const errors = [];
const postSlugs = new Set();
const commentIds = new Set();

async function walk(directory, extensions) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path, extensions)));
    else if (extensions.includes(extname(entry.name))) files.push(path);
  }
  return files;
}

function report(file, message) {
  errors.push(`${relative(root, file)}: ${message}`);
}

function hasOnlyKeys(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).every(key => keys.includes(key)) &&
    keys.filter(key => key !== "name").every(key => key in value)
  );
}

for (const file of await walk(postsRoot, [".md", ".mdx"])) {
  postSlugs.add(basename(file).replace(/\.(md|mdx)$/, ""));
}

const commentFiles = await walk(commentsRoot, [".json"]);
for (const file of commentFiles) {
  let comment;
  try {
    comment = JSON.parse(await readFile(file, "utf8"));
  } catch {
    report(file, "不是有效 JSON。");
    continue;
  }

  if (!hasOnlyKeys(comment, ["id", "postSlug", "author", "content", "createdAt"])) {
    report(file, "顶层字段必须且只能包含 id、postSlug、author、content、createdAt。");
    continue;
  }
  if (!hasOnlyKeys(comment.author, ["githubId", "login", "name", "avatarUrl", "profileUrl"])) {
    report(file, "author 字段结构无效。");
    continue;
  }

  const directorySlug = relative(commentsRoot, file).split(sep)[0];
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(comment.postSlug)) {
    report(file, "postSlug 必须使用小写 ASCII kebab-case。");
  }
  if (comment.postSlug !== directorySlug) report(file, "postSlug 必须与所在目录一致。");
  if (!postSlugs.has(comment.postSlug)) report(file, "postSlug 没有对应的文章。");

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(comment.id)) {
    report(file, "id 必须是 UUID v4。");
  } else if (commentIds.has(comment.id)) {
    report(file, "id 与另一条评论重复。");
  } else commentIds.add(comment.id);

  if (!Number.isInteger(comment.author.githubId) || comment.author.githubId <= 0) {
    report(file, "githubId 必须是正整数。");
  }
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(comment.author.login)) {
    report(file, "GitHub 用户名格式无效。");
  }
  if (
    "name" in comment.author &&
    (typeof comment.author.name !== "string" || comment.author.name.length > 100)
  ) {
    report(file, "GitHub 显示名称无效。");
  }

  try {
    const avatar = new URL(comment.author.avatarUrl);
    if (avatar.protocol !== "https:" || avatar.hostname !== "avatars.githubusercontent.com") {
      throw new Error();
    }
  } catch {
    report(file, "头像必须来自 GitHub 官方头像域名。");
  }
  try {
    const profile = new URL(comment.author.profileUrl);
    if (
      profile.protocol !== "https:" ||
      profile.hostname !== "github.com" ||
      profile.pathname.toLowerCase() !== `/${comment.author.login.toLowerCase()}`
    ) {
      throw new Error();
    }
  } catch {
    report(file, "个人主页必须与 GitHub 用户名一致。");
  }

  if (
    typeof comment.content !== "string" ||
    comment.content.trim().length < 2 ||
    comment.content.length > 2000 ||
    comment.content.includes("\u0000")
  ) {
    report(file, "评论正文必须是 2–2000 个字符的纯文本。");
  }

  const createdAt = new Date(comment.createdAt);
  if (
    typeof comment.createdAt !== "string" ||
    Number.isNaN(createdAt.getTime()) ||
    createdAt.toISOString() !== comment.createdAt
  ) {
    report(file, "createdAt 必须是标准 UTC ISO 时间。");
  } else {
    const timestamp = comment.createdAt.replace(/[-:.TZ]/g, "").slice(0, 14);
    const expectedName = `${timestamp}-${comment.id.slice(0, 8)}.json`;
    if (basename(file) !== expectedName) report(file, `文件名应为 ${expectedName}。`);
  }
}

if (errors.length) {
  console.error(`\n评论检查失败（${errors.length} 项）：\n- ${errors.join("\n- ")}\n`);
  process.exit(1);
}

console.log(`评论检查通过：${commentFiles.length} 条公开评论。`);
