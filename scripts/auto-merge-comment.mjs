/* eslint-disable no-console */

const repository = process.env.GITHUB_REPOSITORY ?? "";
const token = process.env.GITHUB_TOKEN ?? "";
const checkedHeadSha = process.env.CHECKED_HEAD_SHA ?? "";
const pullNumber = Number(process.env.COMMENT_PR_NUMBER);
const [owner] = repository.split("/");

if (
  !repository ||
  !owner ||
  !token ||
  !checkedHeadSha ||
  !Number.isInteger(pullNumber)
) {
  throw new Error("缺少自动发布评论所需的 GitHub Actions 环境变量。");
}

async function github(path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "yinsens-blog-comment-publisher",
      "X-GitHub-Api-Version": "2022-11-28",
      ...options.headers,
    },
  });
  const responseBody = await response.text();
  const result = responseBody ? JSON.parse(responseBody) : {};
  if (!response.ok) {
    throw new Error(
      `GitHub API 请求失败（${response.status}）：${result.message ?? path}`
    );
  }
  return result;
}

function hasOnlyKeys(value, requiredKeys, optionalKeys = []) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).every(key =>
      [...requiredKeys, ...optionalKeys].includes(key)
    ) &&
    requiredKeys.every(key => key in value)
  );
}

function reject(message) {
  throw new Error(`拒绝自动合并评论 PR #${pullNumber}：${message}`);
}

const pull = await github(`/repos/${repository}/pulls/${pullNumber}`);
if (pull.state !== "open") {
  console.log(`PR #${pullNumber} 已不是打开状态，跳过。`);
  process.exit(0);
}

const branchMatch = pull.head.ref.match(
  /^comment\/([a-z0-9]+(?:-[a-z0-9]+)*)\/(\d{14}-[0-9a-f]{8})$/
);
if (!branchMatch) {
  console.log(`PR #${pullNumber} 不是评论分支，跳过。`);
  process.exit(0);
}

if (pull.base.ref !== "main") reject("目标分支不是 main。");
if (pull.head.repo?.full_name !== repository) reject("来源不是当前仓库。");
if (pull.head.sha !== checkedHeadSha) {
  reject("检查完成后分支内容发生了变化，请等待新一轮检查。");
}
if (pull.user?.login?.toLowerCase() !== owner.toLowerCase()) {
  reject("PR 不是由仓库所有者账号创建的。");
}

const [, postSlug, fileStem] = branchMatch;
const expectedPath = `src/data/comments/${postSlug}/${fileStem}.json`;
const files = await github(
  `/repos/${repository}/pulls/${pullNumber}/files?per_page=100`
);
if (
  files.length !== 1 ||
  files[0].status !== "added" ||
  files[0].filename !== expectedPath
) {
  reject(`只能新增 ${expectedPath}。`);
}

const encodedPath = expectedPath
  .split("/")
  .map(encodeURIComponent)
  .join("/");
const file = await github(
  `/repos/${repository}/contents/${encodedPath}?ref=${encodeURIComponent(pull.head.sha)}`
);
if (file.type !== "file" || file.encoding !== "base64") {
  reject("无法读取评论数据文件。");
}

let comment;
try {
  comment = JSON.parse(Buffer.from(file.content, "base64").toString("utf8"));
} catch {
  reject("评论数据不是有效 JSON。");
}

if (
  !hasOnlyKeys(comment, ["id", "postSlug", "author", "content", "createdAt"]) ||
  !hasOnlyKeys(
    comment.author,
    ["githubId", "login", "avatarUrl", "profileUrl"],
    ["name"]
  )
) {
  reject("评论字段结构无效。");
}
if (comment.postSlug !== postSlug) reject("文章标识与文件路径不一致。");
if (
  typeof comment.content !== "string" ||
  comment.content.trim().length < 2 ||
  comment.content.length > 2000 ||
  comment.content.includes("\u0000")
) {
  reject("评论正文无效。");
}
if (
  !Number.isInteger(comment.author.githubId) ||
  !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(
    comment.author.login
  ) ||
  comment.author.profileUrl !== `https://github.com/${comment.author.login}` ||
  !comment.author.avatarUrl.startsWith(
    "https://avatars.githubusercontent.com/"
  )
) {
  reject("GitHub 身份字段无效。");
}

const merged = await github(`/repos/${repository}/pulls/${pullNumber}/merge`, {
  method: "PUT",
  body: JSON.stringify({
    merge_method: "squash",
    commit_title: `Publish comment on ${postSlug} (#${pullNumber})`,
  }),
});
if (!merged.merged) reject(merged.message ?? "GitHub 未完成合并。");

await github(`/repos/${repository}/actions/workflows/deploy.yml/dispatches`, {
  method: "POST",
  body: JSON.stringify({ ref: "main" }),
});

console.log(`评论 PR #${pullNumber} 已自动合并，并已启动博客部署。`);
