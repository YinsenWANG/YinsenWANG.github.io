# 评论数据

每条公开评论由一个 JSON 文件保存，路径为：

```text
src/data/comments/<post-slug>/<timestamp>-<id>.json
```

评论通过 Cloudflare Worker 以 Pull Request 的形式提交。GitHub Actions 只会自动合并符合以下全部条件的评论 PR：

- PR 来自当前仓库的 `comment/` 分支，并由仓库所有者账号创建；
- PR 只新增一个路径和命名均合法的评论 JSON 文件；
- `postSlug` 对应已存在的文章，评论结构和 GitHub 身份字段合法；
- 评论数据检查和整站构建全部通过。

评论 PR 合并后，自动发布工作流会主动启动 Pages 部署，使新评论出现在博客上。

自动检查只验证结构和安全边界，不判断内容质量。发现垃圾、骚扰或隐私内容时，删除对应 JSON 并提交即可；Git 历史仍会保留变更记录。

不要在评论数据中保存 GitHub access token、邮箱、IP 地址或反垃圾验证信息。
