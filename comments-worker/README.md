# Git 原生评论服务

这个 Worker 通过 GitHub OAuth 确认评论者的公开身份，然后在博客仓库中创建一个只包含评论 JSON 的 Pull Request。GitHub access token 只用于读取一次公开身份，不会保存。Pull Request 通过站点和评论数据检查后，由 GitHub Actions 自动合并并发布。

## 配置

Cloudflare Worker secrets：

- `GITHUB_TOKEN`：仅授权本仓库的细粒度 GitHub token，需要 Contents 和 Pull requests 读写权限。
- `GITHUB_OAUTH_CLIENT_ID`：Yinsen’s Blog OAuth App 的 Client ID；
- `GITHUB_OAUTH_CLIENT_SECRET`：OAuth App 的 Client secret；
- `SESSION_SECRET`：至少 32 字节的随机会话签名密钥。

`wrangler.jsonc` 中的 `AUTH_REDIRECT_URI` 必须与 OAuth App 的回调地址完全一致。

博客构建变量：

- `PUBLIC_COMMENTS_API_URL`：Worker 地址；

不要把任何 secret 写入仓库或 `.env` 文件。

当前 GitHub token 于 2027-08-31 到期。到期前需要生成同等最小权限的新 token，并更新 Worker 的 `GITHUB_TOKEN` secret。

## 本地命令

```sh
pnpm comments:check
pnpm comments:dev
pnpm comments:deploy
```
