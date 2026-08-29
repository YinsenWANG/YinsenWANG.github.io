/* eslint-disable no-console */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const values = Object.fromEntries(
  process.argv.slice(2).reduce((items, value, index, all) => {
    if (value.startsWith("--")) items.push([value.slice(2), all[index + 1]]);
    return items;
  }, [])
);

const { title, slug } = values;
if (!title || !slug) {
  console.error('用法：pnpm new:post -- --title "文章标题" --slug "article-slug"');
  process.exit(1);
}
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
  console.error("slug 必须使用小写 ASCII kebab-case。");
  process.exit(1);
}

const postsRoot = join(process.cwd(), "src/content/posts");
const target = join(postsRoot, `${slug}.md`);
if (existsSync(target)) {
  console.error(`文件已存在：${target}`);
  process.exit(1);
}

const now = new Date(Date.now() + 8 * 60 * 60 * 1000)
  .toISOString()
  .replace("Z", "+08:00");
const template = `---
author: Yinsen
pubDatetime: ${now}
title: ${JSON.stringify(title)}
featured: false
draft: true
tags:
  - 其他
description: 请在发布前补充 20–180 个字符的文章摘要。
---

请从这里开始写作。
`;

await mkdir(postsRoot, { recursive: true });
await writeFile(target, template, { flag: "wx" });
console.log(`已创建草稿：${target}`);
