# Yinsen’s Blog 管理协议

本仓库是 Yinsen’s Blog 的唯一内容来源。所有 Agent 在修改博客前必须遵守本文件。

## 权威路径

- 文章：`src/content/posts/`
- 固定页面：`src/content/pages/`
- 文章图片：`src/assets/images/posts/<slug>/`
- 站点设置：`astro-paper.config.ts`
- 写作风格：`CONTENT_GUIDE.md`
- 发布流程：`.github/workflows/deploy.yml`

## 发布边界

- 新文章始终从 `draft: true` 开始。
- 只有在 Yinsen 明确说出“发布”、“上线”或同等指令后，才可将文章改为 `draft: false` 并合并到 `main`。
- “帮我写”、“整理成文章”、“改好一点”都不等于授权发布。
- 删除已发布文章、改变永久链接、添加第三方脚本或更换域名必须单独确认。
- 不得改写 Git 历史；回退已发布内容使用反向提交。

## 内容要求

- 文件名使用小写 ASCII kebab-case，发布后不随意改名。
- 必填字段：`title`、`description`、`pubDatetime`、`draft`、`tags`。
- 修订已发布文章时添加或更新 `modDatetime`。
- 图片必须有有意义的替代文字，且不得使用版权不明的素材。
- 事实、数据和直接引用要保留可核验来源，不得捏造引用、经历或结论。
- 不得把密钥、访问令牌、私人资料或未授权全文写入仓库。

## 标准流程

1. 阅读本文件和 `CONTENT_GUIDE.md`。
2. 在 `agent/<date>-<slug>` 分支工作，新文章保持草稿状态。
3. 执行 `pnpm check`。
4. 向 Yinsen 汇报改动摘要、检查结果和预览方式。
5. 收到明确发布指令后，再变更草稿状态并合并到 `main`。
6. 确认 GitHub Pages 部署成功和线上地址可访问。

如果任何检查失败，不得发布。
