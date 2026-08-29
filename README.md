# Yinsen’s Blog

Yinsen 的个人博客，记录关于 AI、技术、创造与日常思考。

线上地址：<https://yinsen.im/>

## Agent 管理

任何 Agent 在修改博客前，必须阅读 [AGENTS.md](AGENTS.md) 和 [CONTENT_GUIDE.md](CONTENT_GUIDE.md)。新文章默认是草稿，只有 Yinsen 明确确认后才能发布。

```bash
pnpm new:post -- --title "文章标题" --slug "article-slug"
pnpm check
```

## 开发

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm check
```

推送到 `main` 后，GitHub Actions 会自动检查并部署 GitHub Pages。

## 技术与授权

本站基于 [AstroPaper](https://github.com/satnaing/astro-paper) 构建，保留原项目 MIT 许可证。博客文章及原创图片的版权归 Yinsen 所有。
