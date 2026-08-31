# 评论数据

每条公开评论由一个 JSON 文件保存，路径为：

```text
src/data/comments/<post-slug>/<timestamp>-<id>.json
```

评论通过 Cloudflare Worker 以 Pull Request 的形式提交。合并前需确认：

- `postSlug` 对应已存在的文章；
- `author` 中的 GitHub ID、用户名和主页与 PR 描述一致；
- `content` 不包含隐私、骚扰或垃圾内容；
- PR 只新增一个评论 JSON 文件；
- 站点检查全部通过。

不要在评论数据中保存 GitHub access token、邮箱、IP 地址或反垃圾验证信息。
