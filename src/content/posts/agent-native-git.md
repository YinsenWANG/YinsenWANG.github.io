---
author: Yinsen
pubDatetime: 2026-08-30T00:10:00+08:00
modDatetime: 2026-08-30T00:45:00+08:00
title: Agent 为什么也需要一套自己的 Git
featured: true
draft: false
tags:
  - AI Agent
  - Agent Infrastructure
  - Git
description: 同一个 Agent Native Git 命题，分别写给人类、开发者和 Agent：先讲清问题，再进入实现，最后留下完整交接上下文。
---

同一篇文章，三个读取入口。

如果你只是想知道这件事为什么重要，读 `FOR HUMAN`。

如果你想判断它能不能做、应该怎么做，继续读 `FOR DEVELOPER`。

如果你是接手这项工作的 Agent，直接跳到 `FOR AGENT`。

<div class="audience-gate" role="separator" aria-label="For human"><span>FOR HUMAN</span></div>

## Agent 为什么也需要一套自己的 Git

现在的 AI Agent，正在从一个“会回答问题的聊天机器人”，变成一个会长期工作、长期学习、不断改变自己的系统。

它会记住用户偏好，会学习新的 Skill，会创建脚本，会安排定时任务，会安装插件，也会调整自己的工作方式。

这听起来是进步。

但一个新的问题也随之出现：

> Agent 学到的东西越来越多以后，我们怎么知道它现在到底变成了什么样？

假设一个 Agent 在几周内做了这些事情：

- 记住用户不喜欢频繁确认；
- 学会了一套 GitHub PR Review 方法；
- 写了一个自动检查 CI 的脚本；
- 创建了一个每天检查 PR 的定时任务；
- 修改了文件写入权限；
- 后来又更新了那套 PR Review Skill。

这些东西可能分别存在不同地方：

```text
Memory
Skill
Script
定时任务
权限配置
插件配置
```

问题是，它们并不是互相独立的。

定时任务可能依赖某个 Skill，Skill 又依赖某个 Script，Script 还需要特定权限。

一旦其中一部分被修改，另一部分没有同步更新，Agent 就可能进入一种“半升级”状态：

```text
Memory 更新了
Skill 更新了
Script 写到一半失败了
定时任务没有更新
```

每个文件单独看可能都没有坏，但整个 Agent 已经不再是一个完整、一致的状态。

这就是长期运行 Agent 面临的一个核心问题：

### Agent 会不断变化，但这些变化缺少统一管理

## Git 真正解决的，不只是代码版本问题

很多人提到 Git，第一反应是程序员写代码时用的版本控制工具。

但 Git 更本质的价值，是解决下面这些问题：

- 现在是什么状态；
- 之前是什么状态；
- 谁改了什么；
- 为什么改；
- 两个人同时修改怎么办；
- 改坏了怎么恢复；
- 能不能先试验，再决定是否正式使用。

这些问题以前出现在软件代码里。

现在，它们开始出现在 Agent 身上。

所以这里说的 **Agent Native Git**，并不是让 Agent 学会执行：

```bash
git add
git commit
```

而是让 Agent 自己的长期状态，也拥有类似 Git 的管理能力。

也就是说：

> Agent 每次学习、修改自己，都不应该只是直接覆盖原来的内容，而应该形成一次可以查看、审查和回退的变化记录。

## 今天的 Agent 为什么容易越用越乱

现在很多 Agent 都有 Memory。

但大多数 Memory 系统解决的只是：

> 怎么让 Agent 记住东西。

它们没有解决：

> Agent 记住的东西互相冲突怎么办。

例如 Agent 可能先记住：

> 用户不喜欢每次都被询问。

后来又记住：

```text
修改文件前要询问用户。
```

再后来某个 Skill 里又写着：

```text
为了提高效率，常规修改无需确认。
```

这些信息单独看都有道理。

但它们放在一起，Agent 每次执行时都只能自己临时理解：

> 这一次到底要不要问？

时间越长，这类规则、记忆和例外越多，Agent 的行为就越不稳定。

这可以叫作：

> **Agent 状态熵。**

简单说，就是 Agent 里面的东西越来越多，但它们之间的关系越来越不清楚。

传统 Memory 系统往往只是不断增加内容。

而真正需要的是：

- 新内容是否覆盖旧内容；
- 两条规则是否冲突；
- 这条记忆来自哪里；
- 它什么时候生效；
- 它影响了哪些 Skill 和任务；
- 出问题以后能不能恢复。

这已经不是单纯的“记忆”问题，而是版本管理问题。

## Hermes 已经开始做这件事，但还没有完全统一

Nous Research 的 Hermes Agent 是一个很好的案例。

因为它已经开始解决很多类似 Git 的问题。

Hermes 的长期 Memory 主要保存在：

```text
MEMORY.md
USER.md
```

它在写入时会做：

- 文件锁；
- 原子写入；
- 并发修改检查；
- 异常内容检测；
- 备份。

Session 启动时，Hermes 还会冻结一份 Memory 快照。

当前 Session 继续使用这份稳定状态，中途新写入的 Memory，要到下一个 Session 才真正进入系统提示词。

这说明 Hermes 已经意识到：

> 一个正在运行的 Agent，不能一边执行，一边不断改变自己的基础状态。

但 Hermes 的 Memory 目前主要解决的是：

- 不要写坏；
- 不要覆盖；
- 不要丢数据。

它还没有完整解决：

- Memory 的历史版本；
- 任意时间点回滚；
- 多个版本并行实验；
- 不同 Agent 修改后的合并。

相关实现：

- [Hermes Memory Tool](https://github.com/NousResearch/hermes-agent/blob/main/tools/memory_tool.py)

## Hermes 的 Skill 系统已经更接近 Git

Hermes 的 Skill 系统走得更远。

Agent 可以：

- 创建 Skill；
- 编辑 Skill；
- 局部修改 Skill；
- 删除 Skill；
- 添加脚本、模板和参考文件。

相关实现：

- [Hermes Skill Manager](https://github.com/NousResearch/hermes-agent/blob/main/tools/skill_manager_tool.py)

更重要的是，Hermes 有一套 Skill Ledger。

每一次 Skill 被修改，系统会记录：

- 谁修改的；
- 做了什么操作；
- 修改前是什么；
- 修改后是什么；
- 修改依据是什么；
- 修改发生在什么时候。

Skill 文件内容还会根据 SHA-256 保存成去重的内容块，并支持回滚。

相关实现：

- [Hermes Skill Ledger](https://github.com/NousResearch/hermes-agent/blob/main/tools/skill_ledger.py)

这已经很像 Git：

| Hermes      | Git         |
| ----------- | ----------- |
| 修改前内容  | 上一个版本  |
| 修改后内容  | 新版本      |
| Ledger 记录 | Commit      |
| 修改人      | Author      |
| Evidence    | Commit 原因 |
| Rollback    | Revert      |

但它和真正的 Agent Native Git 仍然有一个关键区别。

Hermes 的设计是：

```text
先修改 Skill
再尽量记录历史
```

即使 Ledger 记录失败，Skill 修改仍然可以成功。

所以它更像：

> 修改以后留一份备份和日志。

而真正的 Agent Native Git 应该是：

> 没有形成完整版本，就不能让修改正式生效。

这是两种完全不同的系统。

## Agent Native Git 真正要解决什么

这套系统最核心的，不是“保存更多历史”。

而是把 Agent 每一次变化，变成一个完整的“升级包”。

例如 Agent 决定改进 GitHub PR Review。

这次升级可能包括：

```text
修改一条 Memory
更新一个 Skill
新增一个 Script
创建一个定时任务
增加一项权限
```

在今天的系统里，这五项变化可能分别写入五个地方。

在 Agent Native Git 里，它们应该被视为一次完整变化：

```text
GitHub PR Review 升级
```

只有五项全部验证成功，这次升级才正式生效。

否则，Agent 继续使用旧版本。

这可以理解为：

> Agent 不再是“边学边直接改自己”，而是“先准备一个新版本，再决定是否启用”。

## 一套完整的 Agent Native Git 应该有四个关键能力

### 第一，Agent 每个时刻都应该有一个明确版本

例如：

```text
Agent State: 81fd213
```

这个版本代表：

- 当前 Memory；
- 当前 Skills；
- 当前定时任务；
- 当前 Scripts；
- 当前 Policies；
- 当前 Plugins；
- 当前权限配置。

这样，当用户说：

> Agent 昨天还正常，今天怎么变奇怪了？

系统就可以比较：

```text
昨天：7aa312
今天：81fd213
```

然后直接告诉用户：

```text
新增了 2 条 Memory
修改了 1 个 Skill
创建了 1 个定时任务
增加了文件写入权限
```

今天很多 Agent 做不到这一点。

因为它们没有一个统一版本，只能分别检查不同数据库、文件和配置。

### 第二，Agent 的修改应该先成为候选版本

Agent 学到新东西以后，不应该立即进入正式运行状态。

更加安全的流程应该是：

```text
Agent 提出修改
    ↓
生成候选版本
    ↓
运行检查和测试
    ↓
用户或系统审查
    ↓
正式启用
```

例如：

```text
当前版本：A
候选版本：B
```

B 已经保存，但 Agent 仍然使用 A。

只有 B 通过检查后，才切换过去。

这样即使 Agent 的自我改进出了问题，也不会立刻影响正式工作。

### 第三，用户看到的应该是“Agent 改变了什么”

现在很多 AI 产品的 Memory 页面是一长串：

```text
Memory 1
Memory 2
Memory 3
Memory 4
```

用户自己判断哪些该删。

这种方式不自然。

更好的体验应该像系统更新记录：

```text
你的 Agent 本周发生了 6 项变化

Memory
+ 学会你偏好简洁回答
- 删除一个过时偏好

Skills
~ 改进 GitHub Review 流程

Automations
+ 新增每周项目复盘

Permissions
- 移除一个不再使用的权限
```

用户可以：

```text
查看原因
查看证据
接受
拒绝
恢复
```

用户管理的不是一堆零散 Memory。

而是：

> Agent 的成长过程。

### 第四，Agent 的冲突需要被明确发现

有些冲突是文件冲突。

例如两个 Agent 同时修改同一个 Skill。

但更常见的是语义冲突。

例如：

```text
规则 A：修改文件前必须询问。

规则 B：常规代码修改无需确认。
```

它们可能存在不同文件里，普通 Git 不会认为它们冲突。

但 Agent 执行时会出现不确定性。

所以 Agent Native Git 不能只比较文件的行变化。

它还需要判断：

- 两条规则是否互相矛盾；
- 新规则是否覆盖旧规则；
- 一条规则是否只是另一条规则的例外；
- 两条 Memory 是否其实是重复内容。

这部分可以由：

- 结构化规则；
- Schema；
- 冲突检测程序；
- 大模型；

共同完成。

但对于权限、支付、数据删除等高风险内容，不能只让模型自动决定，必须进入人工审查。

## 哪些东西应该进入 Agent 的版本库

不是所有 Agent 数据都应该保存进 Git。

可以分成三类。

### 第一类：真正决定 Agent 行为的内容

这些应该进入版本库：

```text
Memory
Skills
Prompts
Policies
Scripts
定时任务
Workflow
工具配置
Plugin 清单
Subagent 定义
```

这些内容发生变化，Agent 的行为也会变化。

### 第二类：可以重新生成的数据

这些不需要进入版本库：

```text
Embedding
向量索引
搜索索引
缓存
临时文件
运行日志
编译后的 Prompt
```

例如 Memory 是原始内容。

Embedding 只是由 Memory 计算出来的结果。

只要原始 Memory 还在，Embedding 就可以重新生成。

这和软件开发中：

```text
源代码进 Git
编译结果不进 Git
```

是同一个道理。

### 第三类：密钥和敏感凭证

这些绝对不能进入 Git：

```text
API Key
OAuth Token
密码
私钥
Cookie
```

版本库里只能保存一个引用：

```text
使用 github/default 这组凭证
```

真正的密钥放在系统 Keychain、Vault 或其他安全存储中。

## 技术上有没有必要重新发明 Git

大概率没有。

Git 底层已经成熟解决了很多最困难的问题：

- 内容去重；
- 完整快照；
- 历史关系；
- 分支；
- 回滚；
- 合并；
- 数据校验；
- 多设备同步。

所以更现实的方案是：

```text
Agent State System
        ↓
Git Engine
```

底层继续使用 Git。

上层不让用户和 Agent 直接接触 Git 命令。

例如 Agent 不调用：

```bash
git commit
```

而调用：

```text
保存一次 Agent 改进
```

用户也不会看到：

```text
branch
rebase
cherry-pick
detached HEAD
```

用户看到的是：

```text
尝试一个新方案
应用改进
恢复之前行为
比较两个版本
```

Git 是内部骨架，不是全部产品。

这里并不是借 Git 打一个比方，然后在真正实现时把它丢掉。相反，我希望保留 Git 最有价值的对象模型、历史模型和协作模型：Blob、Tree、Commit、Ref、Branch、Merge 与 Remote。Agent 语义层负责补上 Git 不理解的 Evidence、Risk、Evaluation 与 Activation，但这些上层能力仍然围绕一个 Git-like Version Graph 运转。

## 可以基于哪些现有开源实现

第一版甚至可以直接使用官方 Git。

通过命令行完成：

- 创建快照；
- 生成 Commit；
- 比较版本；
- 回滚；
- 创建分支。

这样可以最快验证产品逻辑。

之后再根据系统语言选择嵌入式 Git 实现。

### libgit2

成熟的可嵌入 Git 实现。

适合桌面应用、服务端应用，以及需要多语言 Binding 的系统。

- [libgit2/libgit2](https://github.com/libgit2/libgit2)

### gix / gitoxide

Rust 原生 Git 实现。

适合独立状态引擎、强调安全和并发的 Agent Runtime，以及 Rust Sidecar 或 Native Core。

- [GitoxideLabs/gitoxide](https://github.com/GitoxideLabs/gitoxide)

### Dulwich

纯 Python Git 实现，适合 Python Agent、快速原型和不希望依赖系统 Git 的场景。

- [jelmer/dulwich](https://github.com/jelmer/dulwich)

### go-git

Go 实现，适合 Go Agent Runtime、云端 Agent 服务和单文件部署。

- [go-git/go-git](https://github.com/go-git/go-git)

### JGit

Java 实现，适合企业 Java 系统。

- [eclipse-jgit/jgit](https://github.com/eclipse-jgit/jgit)

### isomorphic-git

JavaScript 实现，适合 Node.js、浏览器和轻量 JavaScript 环境。

- [isomorphic-git/isomorphic-git](https://github.com/isomorphic-git/isomorphic-git)

对于 Electron 或 TypeScript 产品，一个比较稳妥的架构可能是：

```text
Electron / TypeScript
        ↓
Agent State Service
        ↓
Rust + gix
```

TypeScript 负责产品和交互。

Rust 服务负责事务、版本、数据完整性、并发和回滚。

## 真正需要创新的不是 Git，而是 Git 上面的 Agent 语义

Git 本身只知道：

```text
哪个文件变了
```

Agent 系统还需要知道：

```text
为什么变
根据什么变
谁提出的
可信度多少
风险多大
是否经过测试
是否已经批准
什么时候正式生效
```

例如一次 Agent 修改，不应该只有一句 `Update memory`，而应该包含：

```text
原因：
用户明确表示希望回答更简洁

证据：
某次对话中的用户原话

影响：
修改沟通偏好 Memory

风险：
低

检查：
未发现与现有偏好冲突

生效：
下一个 Session
```

Git 解决的是版本基础设施。

真正的新系统要解决的是：

> Agent 为什么改变，以及这种改变是否应该被接受。

## 这件事真正的价值

今天很多 Agent 系统在不断增加 Memory、Skill、Automation、Plugin、Subagent 和 Self-improvement。

但它们越强，就越容易出现一个问题：

> Agent 可以改变自己，却没有一套成熟的方法管理这种改变。

Hermes 已经开始分别补上 Memory 的原子写入、Skill 的来源追踪和回滚、Learning Graph，以及 Self-Evolution 的评估和 PR Review。

相关实现：

- [Hermes Memory Tool](https://github.com/NousResearch/hermes-agent/blob/main/tools/memory_tool.py)
- [Hermes Skill Manager](https://github.com/NousResearch/hermes-agent/blob/main/tools/skill_manager_tool.py)
- [Hermes Skill Ledger](https://github.com/NousResearch/hermes-agent/blob/main/tools/skill_ledger.py)
- [Hermes Learning Graph](https://github.com/NousResearch/hermes-agent/blob/main/agent/learning_graph.py)
- [Hermes Agent Self-Evolution](https://github.com/NousResearch/hermes-agent-self-evolution)

这些机制共同说明了一件事：

> 当 Agent 开始长期运行并修改自己以后，它会自然重新遇到软件工程里的版本控制问题。

Agent Native Git 的价值，就是把这些零散能力统一起来。

它最终要把 Agent 的变化过程，从直接修改，变成：

```text
提出修改
生成候选版本
检查
审查
正式启用
```

这样，Agent 才能真正做到可观察、可解释、可审查、可回滚、可复现，以及可安全地自我改进。

### 结语

模型让 Agent 会思考。

工具让 Agent 会行动。

而版本化状态系统，才让 Agent 能够可靠地成长。

没有版本控制的 Self-Improving Agent，本质上是在直接修改 Production。

Agent Native Git 真正要做的，并不是给 Agent 增加一个 Git 工具，而是把 Agent 的学习和变化，从不可见的内部过程，变成一个可以检查、验证、审查和恢复的工程过程。

<div class="audience-gate" role="separator" aria-label="For developer"><span>FOR DEVELOPER</span></div>

## 从概念到可实现的 Agent State SCM

从这里开始，不再论证“为什么需要它”。假设目标已经确定：我们要实现的不是一个 Memory History，也不是在 `~/.agent` 下面执行 `git init`，而是一条新的 Agent State Write Path。

它必须把今天散落在多个子系统里的写入：

```text
memory.write()
skill.patch()
script.create()
automation.update()
permission.grant()
```

收敛成一个具有统一原子边界的操作：

```text
state.begin(base_commit)
  → stage(typed_changes)
  → validate()
  → commit()
  → review()
  → activate()
```

实现机会不在于再造 Git，而在于接管所有 Canonical State 的写路径，并保证任何 Runtime 都只能从一个已经激活的不可变 Snapshot 启动。

### 0x01 — State Boundary

首先要区分三类数据。

第一类是 **Canonical State**，也就是决定 Agent 行为的权威来源，应该进入版本库：

```text
memory/
skills/
prompts/
policies/
permissions/
workflows/
automations/
scripts/
tool-config/
plugin-manifests/
subagent-definitions/
```

第二类是 **Derived State**，它们可以从权威来源重新生成，不应成为版本库的主体：Embedding、Vector Index、搜索索引、缓存、Runtime DB、编译后的 Prompt、临时文件与运行日志。它们和软件项目里的 Build Output、Cache 类似。

第三类是 **Secrets**。API Key、OAuth Token、密码、私钥、Cookie 永远不应进入 Git History。Repository 里最多保存 `credential_ref: github/default` 这样的引用，真实值放在 Keychain、Vault 或其他安全存储中。

准确的说法不是「把 Agent 所有用户数据塞进 Git」，而是：

> 把 Agent 的 canonical mutable state 变成一个 versioned repository。

这里的 `memory/` 只是版本库中的逻辑命名空间，不意味着 Memory 必须是一堆无结构文本。一个 Memory Claim 至少可以显式携带 `value`、`scope`、`source`、`confidence`、`valid_from`、`valid_until` 与 `supersedes`。Git 负责保存它的不可变版本和历史关系，Schema 与语义层负责定义它是否合法。

### 0x02 — Hermes Gap

Nous Research 的 [Hermes Agent](https://github.com/NousResearch/hermes-agent) 是一个很有价值的现实样本。它已经在不同子系统中自然长出了很多 Git-like 机制。

Hermes 的长期 Memory 主要保存在 `MEMORY.md` 和 `USER.md`。它的 [Memory Tool](https://github.com/NousResearch/hermes-agent/blob/main/tools/memory_tool.py) 会处理文件锁、原子写、并发修改和漂移检测，并在 Session 开始时冻结一份 Memory Snapshot。Session 中途写入的新 Memory 不会立刻改变当前 System Prompt，而会在后续 Session 生效。这解决的是运行稳定性和数据丢失问题，但还不是完整的历史、分支和合并系统。

Skills 走得更远。[Skill Ledger](https://github.com/NousResearch/hermes-agent/blob/main/tools/skill_ledger.py) 会记录 Actor、Action、Evidence、Before Manifest 与 After Manifest，并把文件内容按 SHA-256 存入内容寻址的 Blob Store，还支持单次修改回滚。它已经很像一个局部 Git：Blob 对应文件内容，Manifest 对应 Tree，Ledger Entry 对应 Commit。

但源码里有一句决定性的设计说明：`The ledger is TELEMETRY, NOT A GATE.`

也就是说，Hermes 当前的顺序是：

```text
先修改状态
→ 再尽力记录历史
```

即使 Ledger 写入失败，Skill Mutation 仍然成功。因此它更准确地属于 Audit、Backup 与 Rollback System，而不是 Transactional Versioned State System。

Hermes 还有 [Learning Graph](https://github.com/NousResearch/hermes-agent/blob/main/agent/learning_graph.py) 让 Memory 与 Skill 的关系可见；Curator 管理 Skill 的 active、stale、archived、pinned 生命周期；Cron 独立保存在 `jobs.json`；[Self-Evolution](https://github.com/NousResearch/hermes-agent-self-evolution) 则采用 Candidate、Evaluation、Constraint Gate、PR 和 Human Review。

这些模块共同说明了一件事：Agent 一旦开始长期学习和修改自己，开发者会自然重新发明 Content-addressed Storage、Provenance、History、Rollback、Lifecycle、Evaluation 与 Review。Hermes 已经有不少零件，但仍没有把 Memory、Skills、Cron、Scripts、Config 和 Plugins 统一成一个全局 Commit。

Hermes 与 Agent Native Git 最关键的差异不是有没有 SHA 或 Rollback，而是：

> **Commit 是不是整个 Agent State 的一级抽象。**

```text
Hermes 当前的局部模式
Mutation → Persistence → Best-effort Audit

Agent Native Git
Proposal → Transaction → Validation → Commit → Review → Activation
```

### 0x03 — System Invariants

一套可工作的 Agent Native Git 至少需要以下系统不变量。

**一、正式状态只能来自不可变 Snapshot。** 每个 Session 或 Task 都绑定明确的 State Commit。后台生成的新状态不能改变正在执行的任务。

**二、所有 Canonical Mutation 必须经过 Transaction。** 一次 PR Review 升级涉及 Memory、Skill、Script、Automation 和 Permission 时，要么全部形成新 Commit，要么 Active State 完全不变。

**三、Commit 与 Activation 分离。** 一个版本可以已经被保存，但仍处于 Candidate 状态。`main` 表示已经接受的主状态，`candidate` 表示待评估状态，`active` 表示 Runtime 真正使用的状态。

**四、每个 Commit 携带 Evidence 与 Evaluation。** 系统不仅记录改了什么，还记录为什么改、证据来自哪里、置信度、影响范围、风险、测试和审批结果。

**五、高风险变化不能由模型单独裁决。** 权限提升、支付、数据删除、外部写入等必须经过确定性的 Policy Gate；LLM 可以发现和解释冲突，但不能成为唯一安全边界。

### 0x04 — Semantic Commit

一个 Agent Commit 可以包含：

```yaml
actor:
  type: agent
  id: personal-agent
reason:
  type: user_correction
  summary: 用户希望技术回答更简洁
evidence:
  - type: explicit_user_statement
    source: conversation://182/message/27
confidence: 1.0
scope: global
risk: low
evaluation:
  schema: passed
  dependency_check: passed
  contradiction_check: passed
  regression_suite: passed
approval:
  policy: auto
activation:
  policy: next_session
```

Evidence 尤其重要。同一句「用户喜欢简洁回答」，可能来自用户明确表达，也可能只是一次行为推断。两者的可信度与治理策略不应相同。Agent Native Git 实际上需要同时维护 Version Graph 和 Evidence Graph。

### 0x05 — Runtime Projection

许多 Agent 今天把 Markdown、SQLite、Vector DB 和 Scheduler DB 同时当作真实数据源。更干净的架构是：

```text
Agent Repository
→ Materializer
→ Runtime Projection
```

`memory/` 生成 Vector Index，`skills/` 生成 Skill Registry，`automations/` 生成 Scheduler Jobs，`policies/` 生成 Permission Engine，`prompts/` 生成 Compiled System Prompt。

Repository 是 Source of Truth，其余系统是可以重建的投影。这样 Runtime 数据损坏后可以恢复，Checkout 任意 Commit 可以重建当时的 Agent，Diff 与 Review 也基于可读的行为源，而不是数据库内部状态。

激活新版本时，应先在隔离环境中构建所有 Projection，验证成功后再原子移动 `active`。正在执行的任务继续绑定旧 Commit，新任务才使用新版本。

### 0x05.5 — Desired / Authorized / Materialized / Observed

权限和外部系统不能只看 Repository 中的一份声明。`permissions/github.yaml` 写着允许写入，不代表 OAuth Provider 此刻真的授予了写权限；Automation Definition 已经进入 Commit，也不代表 Scheduler Job 已经创建成功。

因此，Agent Native Git 在接触外部控制面时至少要区分四种状态：

```text
Desired State       Repository 希望系统成为什么样
Authorized State    用户或外部权威实际批准了什么
Materialized State  Adapter 已经成功配置了什么
Observed State      系统当前实际观察到什么
```

Git Commit 保存 Desired State 及其证据与审批引用；Controller 负责 Materialize、Observe、发现 Drift 并 Reconcile。Checkout 到旧 Commit 只能改变期望配置，不能自动恢复已撤销的授权，也不能假装撤销已经发生的外部动作。

### 0x06 — Semantic Diff / Merge

普通 Git Diff 告诉程序员哪几行变了；Agent 的用户需要看到 Memory、Skill、Automation、Permission 分组后的 Semantic Diff。

Merge 至少有三层：

1. Structural Merge：按 JSON、YAML 和 Schema 字段合并；
2. Text Three-way Merge：处理传统文件并发修改；
3. Semantic Merge：识别 contradiction、duplicate、override、specialization 与 supersession。

例如「危险操作前必须确认」和「常规代码编辑不需要确认」可能不是冲突，而是具体规则对一般规则的补充。系统应尽量用 Scope、Priority、Effective Time 和 Explicit Override 表达关系，而不是每次都让 LLM 猜。

### 0x07 — Branch / A-B / Bisect

Self-improvement 不应等于直接修改 Production。Agent 可以从 `main` 创建 Experiment Branch，生成候选状态，在相同 Eval Set 上比较 Task Success、Tool Calls、Latency、Tokens 与 Policy Violations，表现更好再 Merge。

多个 Agent 也可以从同一个 Base Commit 分叉，各自提交后做 Three-way Merge，而不是共享一个 Last-write-wins 的可变数据库。

当 Agent 在 Commit A 表现正常、Commit H 开始异常时，还可以像 Git Bisect 一样加载中间状态并运行 Agent Eval，定位首次引入回归的 Commit。这会把「Agent 最近怎么变奇怪了」变成可执行的 Regression Debugging。

### 0x08 — Engine Selection

Git 已经成熟解决 Content-addressed Object、Tree Snapshot、Commit DAG、Refs、Branch、Merge、Pack、Integrity Check 和 Remote Sync。第一版没有必要 Fork Git 或设计新 Packfile。

可行架构是：

```text
Agent State API
→ Semantic Transaction Layer
→ Git-compatible Object Layer
→ Git Engine
```

PoC 可以直接使用官方 [Git](https://git-scm.com/) CLI，甚至只调用 `hash-object`、`mktree`、`commit-tree`、`update-ref` 等 Plumbing Commands。成熟的跨语言嵌入可考虑 [libgit2](https://github.com/libgit2/libgit2)；独立、安全的 Rust State Engine 可以研究 [gix / gitoxide](https://github.com/GitoxideLabs/gitoxide)；Python 原型可用 [Dulwich](https://github.com/jelmer/dulwich) 或 [pygit2](https://github.com/libgit2/pygit2)；Go、Java 和浏览器环境分别有 [go-git](https://github.com/go-git/go-git)、[JGit](https://github.com/eclipse-jgit/jgit) 与 [isomorphic-git](https://github.com/isomorphic-git/isomorphic-git)。

真正的创新不在 Git Object Model，而在 Typed Mutation、Semantic Commit、Evidence、Evaluation、Activation、Risk Policy、Semantic Merge、Runtime Projection 和 Privacy Purge。

### 0x09 — MVP / Failure Boundary

第一版只需要覆盖 Memory、Skills、Automations 和 Scripts，完成七件事：全局 Snapshot、事务化 Commit、History、Semantic Diff、Rollback、Candidate / Active 分离、Review 页面。

最适合验证的场景仍是一次 GitHub PR Review 能力升级：它同时修改多种状态，具有脚本、自动化、权限与评估要求，可以清楚验证“失败时 Active 不变，成功后单一 Commit 激活”的核心价值。

需要尽早承认的边界包括：

- Git History 与用户隐私删除权存在张力；
- State Commit 之外还要记录 Model、Runtime、Tool 和 Plugin 版本，才能接近完整复现；
- 外部 API 返回值仍可能不可复现；
- 高频自动修改会造成 Commit 噪声，需要聚合、过期与归档策略；
- Semantic Conflict Detection 不可能只靠 LLM；
- Automation 与 Permission 的 Activation 可能产生真实副作用，必须有 Dry Run、审批和回退。

这里的 Rollback 也要分清边界：配置可以回退，Runtime Projection 可以重新调和，但已经发送的邮件、完成的支付和外部删除不会因为 `git revert` 自动消失。它们需要幂等设计、业务补偿或人工介入。

Git History 与隐私删除的冲突同样不能只留作一句提醒。敏感 Memory 需要数据分级、Retention、对象级加密或外部受控存储，以及 History Rewrite、Garbage Collection 和 Remote Purge 机制。Git 的不可变历史是能力，也是一项必须被治理的责任。

**Agent State SCM** 是对系统类别的技术描述，**Agent Native Git** 仍然是这篇文章的核心主张：不是把 Git 降级为随时可替换的装饰，而是把 Git 已经验证过的版本化思想与对象模型，原生扩展到 Agent State。

<div class="audience-gate" role="separator" aria-label="For agent"><span>FOR AGENT</span></div>

## Context Handoff Protocol

以下内容面向接手研究、设计或实现工作的 Agent。不要把它当作上文摘要；它是一份规范性交接协议。术语 `MUST`、`SHOULD`、`MAY` 分别表示必须、应当和可以。

```yaml
context_packet:
  id: agent-native-git-v1
  language: zh-CN
  concept_names:
    public_name: Agent Native Git
    precise_names:
      - Agent State Repository
      - Agent State SCM
      - Transactional Versioned Agent State

  thesis:
    statement: >-
      Long-lived agents with mutable persistent state require a Git-like state
      governance layer. Git can provide storage and history primitives, while an
      agent-semantic layer must provide transactions, evidence, evaluation,
      activation, semantic conflict handling, policy gates and runtime projection.
    scope: >-
      Applies to agents that persistently learn, create or modify memory, skills,
      scripts, automations, policies, permissions, plugins or subagent definitions.
    non_goal: >-
      Do not put all user data, runtime caches, logs, embeddings or credentials into Git.

  primary_problem:
    name: cross_domain_partial_upgrade
    description: >-
      One logical agent improvement can mutate several independently persisted
      subsystems. Partial failure creates a state that is file-valid but
      semantically inconsistent.
    example_changes:
      - memory preference update
      - skill patch
      - script creation
      - automation creation
      - permission change
    required_property: all_or_nothing_visibility

  secondary_problems:
    - state entropy and contradictory long-term knowledge
    - missing provenance and evidence
    - no global snapshot identity
    - unsafe direct self-modification
    - last-write-wins multi-agent state
    - inability to review cross-domain changes
    - weak regression diagnosis and reproducibility

  agent_identity_model:
    formula: Agent = Model + Runtime + VersionedState + Credentials
    reproducibility_tuple:
      - model_version
      - runtime_version
      - state_commit
      - tool_and_plugin_digests
      - environment_descriptor
      - credential_references

  data_classes:
    canonical_state:
      versioned: true
      examples:
        - identity
        - memory
        - skills
        - prompts
        - policies
        - permissions
        - workflows
        - automations
        - scripts
        - tool_config
        - plugin_manifests
        - subagent_definitions
        - knowledge_manifests
    derived_state:
      versioned: false
      rebuildable: true
      examples:
        - embeddings
        - vector_index
        - search_index
        - runtime_database
        - compiled_prompts
        - cache
        - logs
        - temporary_files
        - model_kv_cache
    secrets:
      versioned: false
      repository_content: references_only
      stores:
        - os_keychain
        - vault
        - secure_storage
        - hsm

  typed_memory_claim:
    required_fields:
      - value
      - scope
      - source
      - confidence
      - valid_from
      - valid_until
      - supersedes
    storage_rule: >-
      Git versions serialized claims and their history; schema and semantic layers
      determine validity, precedence and expiration.

  invariants:
    - id: immutable_snapshot_runtime
      rule: Every task or session MUST bind to one immutable state commit.
    - id: transaction_only_mutation
      rule: Canonical state MUST NOT be directly mutated outside a transaction.
    - id: commit_activation_separation
      rule: A committed candidate MUST NOT become runtime-active without activation.
    - id: evidence_and_evaluation
      rule: Every semantic commit MUST include reason, actor, evidence and evaluation.
    - id: deterministic_high_risk_gate
      rule: High-risk changes MUST pass deterministic policy and human approval.
    - id: rebuildable_projection
      rule: Runtime projections SHOULD be rebuildable from canonical state.
    - id: secret_exclusion
      rule: Secret values MUST NOT enter repository history.

  refs:
    main: accepted canonical state
    candidate: proposed state awaiting evaluation or approval
    active: state used by new runtime sessions
    task_binding: immutable commit used by one running task

  transaction_lifecycle:
    ordered_steps:
      - begin_from_base_commit
      - stage_typed_mutations
      - calculate_structural_and_semantic_diff
      - validate_schema
      - validate_dependencies
      - validate_permissions
      - scan_secrets_and_security
      - detect_semantic_conflicts
      - test_skills_scripts_and_automations
      - run_agent_regression_evals
      - evaluate_risk_and_approval_policy
      - create_immutable_commit
      - build_runtime_projections_in_isolation
      - review_or_auto_approve
      - atomically_move_active_ref
    failure_rule: Active state MUST remain unchanged on any pre-activation failure.

  semantic_commit:
    required_fields:
      - parent
      - actor
      - reason
      - evidence
      - confidence
      - scope
      - typed_changes
      - risk
      - evaluation
      - approval_policy
      - activation_policy
      - created_at
    evidence_types:
      - explicit_user_statement
      - inferred_user_behavior
      - task_observation
      - repeated_observation
      - external_source
      - automated_summary
      - other_agent
    graph_model: VersionGraph + EvidenceGraph

  runtime_projection:
    source_of_truth: agent_repository
    mappings:
      memory: vector_index
      skills: skill_registry
      automations: scheduler_jobs
      policies_and_permissions: policy_engine
      prompts: compiled_system_prompt
      plugin_manifests: plugin_loader_state
    activation_strategy: build_validate_then_atomic_switch

  external_state_model:
    desired: state declared by the repository commit
    authorized: state currently approved by the user or external authority
    materialized: state successfully applied by adapters
    observed: state currently reported by external systems
    reconciliation_rule: >-
      Controllers MUST compare desired, authorized, materialized and observed state.
      Checking out a commit MUST NOT implicitly restore revoked authorization.

  rollback_semantics:
    configuration: restore future behavior configuration from another commit
    projection: reconcile rebuildable runtime state to the selected commit
    external_side_effect: requires idempotency, compensation or human intervention
    warning: A Git revert does not erase actions already completed in the outside world.

  diff_and_merge:
    semantic_diff:
      audience: human_and_agent
      groups:
        - memory
        - skills
        - automations
        - scripts
        - policies
        - permissions
        - plugins
      must_explain:
        - what_changed
        - why_changed
        - evidence
        - evaluation
        - risk
    merge_layers:
      - structural_schema_merge
      - textual_three_way_merge
      - semantic_conflict_analysis
    semantic_relations:
      - contradiction
      - duplicate
      - override
      - specialization
      - supersession
    llm_boundary: >-
      LLM MAY detect, explain and propose resolutions. LLM MUST NOT be the sole
      authority for high-risk permission, payment, deletion or external-side-effect decisions.

  risk_policy_examples:
    low:
      examples: [explicit_low_scope_memory_update]
      policy: auto_commit_and_next_session_activation
    medium:
      examples: [skill_update, external_side_effect_automation]
      policy: evaluation_and_review
    high:
      examples: [permission_escalation, payment, destructive_action]
      policy: mandatory_human_approval

  hermes_findings:
    memory:
      capabilities:
        - file_lock
        - atomic_write
        - drift_detection
        - backup
        - concurrent_write_guard
        - frozen_session_snapshot
      classification: consistency_and_data_loss_protection
      missing:
        - global_commit_history
        - arbitrary_global_rollback
        - branch
        - merge
        - cross_domain_transaction
    skills:
      capabilities:
        - actor_action_evidence_ledger
        - before_after_manifests
        - sha256_content_addressed_blobs
        - safety_snapshot_before_rollback
        - rollback_ledger_entry
      decisive_constraint: ledger_is_telemetry_not_a_gate
      classification: audit_backup_and_rollback
    curator:
      lifecycle: [active, stale, archived, pinned]
      source_sensitive_autonomy: true
    learning_graph:
      role: make_memory_and_skills_observable
      classification: observable_state_not_version_control
    cron:
      store: jobs.json
      persistence: atomic_file_replace
      classification: independent_scheduled_state
    self_evolution:
      flow:
        [candidate_generation, evaluation, constraint_gates, PR, human_review]
      lesson: self_improvement_must_not_equal_direct_production_mutation
    central_gap: >-
      Hermes has multiple Git-like subsystems, but no global commit whose atomic
      tree spans memory, skills, scripts, automations, policies, config and plugins.

  implementation_layers:
    - Agent State API
    - Typed Semantic Transaction Layer
    - Git-compatible Object and Ref Layer
    - Git Engine
    - Projection Materializer
    - Policy and Review Layer

  git_engine_options:
    proof_of_concept: git_cli_and_plumbing_commands
    embedded_cross_language: libgit2
    rust_core: gix_gitoxide
    python: [dulwich, pygit2]
    go: go-git
    java: jgit
    browser_or_node: isomorphic-git
    design_rule: >-
      Do not fork Git or invent new object and pack formats before validating the
      agent-semantic layer. Prefer standard blobs, trees, commits and refs.

  mvp:
    included_domains: [memory, skills, automations, scripts]
    required_features:
      - global_snapshot
      - transactional_commit
      - history
      - semantic_diff
      - rollback
      - candidate_active_separation
      - review_ui
    canonical_demo: github_pr_review_capability_upgrade
    acceptance_criteria:
      - one logical upgrade produces one cross-domain commit
      - failed validation leaves active state unchanged
      - accepted commit materializes all runtime projections
      - new sessions use the new commit while running sessions remain pinned
      - user can inspect reason, evidence, evaluation and risk

  future_capabilities:
    - experiment_branches
    - multi_candidate_ab_evaluation
    - multi_agent_three_way_merge
    - agent_regression_bisect
    - remote_sync
    - commit_and_artifact_signing
    - dependency_lock_and_supply_chain_policy

  known_boundaries:
    - Git history conflicts with privacy deletion and requires classification, retention, encryption, history rewrite, garbage collection and remote purge design.
    - State commit alone cannot reproduce external APIs or nondeterministic models.
    - High-frequency learning creates commit noise and needs aggregation and expiry.
    - Semantic conflict detection is probabilistic without structured scope and precedence.
    - Activation of automations and permissions can create external side effects.
    - Existing agents need import, shadow mode, drift detection and phased migration.

  suggested_rfc_sequence:
    - canonical_state_model
    - transaction_and_commit
    - activation_and_runtime_projection
    - semantic_commit_evidence_and_evaluation
    - semantic_diff_and_merge
    - security_secrets_and_privacy
    - experiment_branches_and_agent_eval
    - remote_sync_and_multi_agent_collaboration

  success_definition: >-
    Convert an agent from a collection of drifting memories, files, skills and jobs
    into a software entity with explicit identity, history, provenance, review,
    experimentation, activation, rollback and reproducibility semantics.
```

给继续接手这项工作的 Agent：不要从给 `~/.agent` 执行 `git init` 开始，也不要先重写 Git。先定义 Canonical State、Transaction 与 Activation 三个边界，再用一个跨 Memory、Skill、Script、Automation 的端到端场景验证它。

模型让 Agent 会思考，工具让 Agent 会行动，而版本化状态系统，才让 Agent 能够可靠地成长。
