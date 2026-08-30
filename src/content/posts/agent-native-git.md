---
author: Yinsen
pubDatetime: 2026-08-30T00:10:00+08:00
modDatetime: 2026-08-30T00:30:00+08:00
title: Agent Native Git：让 Agent 的成长可见、可审查、可回退
featured: true
draft: false
tags:
  - AI Agent
  - Agent Infrastructure
  - Git
description: 从状态控制平面的视角，讨论长期运行、能够自我修改的 Agent，如何获得事务、版本、溯源、审查、激活与回退能力，以及 Git 在其中真正适合承担的角色。
---

现在的 Agent 已经不只是回答一次问题。它会记住你的偏好，学习新的 Skill，写脚本，创建定时任务，安装插件，也会慢慢改变自己的工作方式。

这带来了一个很少被认真讨论的问题：Agent 学到的东西越来越多以后，我们怎么知道它现在到底变成了什么样？如果一次学习只完成了一半，如何避免它带着不一致的状态继续工作？如果它改坏了，究竟能回退什么，又有哪些事情已经无法撤销？

我最初把这个方向叫作 **Agent Native Git**。这个名字直观，但也容易让人误解为：把 Agent 的目录交给 Git，一切问题就解决了。

更准确的技术命题是：

> 长期运行、能够修改自身持久状态的 Agent，需要一个事务化、版本化、带溯源与激活机制的状态控制平面。Git 可以是其中一种自然的对象与历史后端，但不是系统本身。

这篇文章分成三部分。第一部分用一个具体例子解释问题；第二部分讨论更准确的架构、实现边界与 Git 的位置；第三部分给出一份供后续研究和实现使用的设计上下文包。

## 第一部分：先把 Agent 的变化管起来

假设你有一个长期协助工作的 Agent。几周之内，它做了这些事：

- 记住你不喜欢频繁确认；
- 学会一套 GitHub PR Review 方法；
- 写了一个自动检查 CI 的脚本；
- 创建了每天检查 PR 的定时任务；
- 获得了在项目目录中写文件的权限；
- 后来又更新了那套 Review Skill。

这些变化通常不在同一个地方。偏好可能在 Memory 里，Skill 在文件夹里，定时任务在数据库里，权限由另一个服务掌管，插件又有自己的配置与运行状态。

更麻烦的是，它们并不独立。定时任务依赖 Skill，Skill 调用脚本，脚本需要权限。一次“改进 PR Review”的决定，实际可能同时改变五六种资源。

如果 Agent 写完了 Memory 和 Skill，却在创建脚本时失败，就会进入一种“半升级”状态：它已经相信自己拥有新能力，实际运行所需的部分却没有准备完整。每个文件单独看也许都没坏，整个 Agent 却已经不再一致。

我们真正需要的第一个能力不是 Git，而是一个系统不变量：

> 一次逻辑升级，要么作为一个整体成为可用候选版本，要么当前正式状态保持不变。

理想过程应该是：

```text
Agent 提出一次改变
→ 在隔离环境准备候选状态
→ 检查结构、依赖、权限、风险与测试结果
→ 保存一个不可变版本
→ 人或系统进行审查
→ 构建运行时状态
→ 正式启用
```

这里必须区分两件事：**保存**和**启用**。

```text
Candidate 已经保存
≠
Production 已经启用
```

如果检查失败，Agent 继续使用旧版本。已经运行的任务继续绑定旧状态，新状态只影响之后启动的任务。

有了这套机制，用户看到的也不该再是一页几百条 Memory，而应该是 Agent 的更新记录：

```text
你的 Agent 本周发生了 6 项变化

Memory
+ 学会你偏好简洁回答
- 删除一个过时推断

Skills
~ 改进 GitHub Review 流程

Automations
+ 新增每周项目复盘

Permissions
- 请求移除一个不再使用的授权
```

用户可以查看变化依据、风险与测试结果，决定接受、拒绝或恢复。管理对象不再是一堆零散数据，而是 Agent 的成长过程。

这套系统只对一类 Agent 真正必要：拥有长期状态、会持续学习或自我修改的 Agent。一次性问答工具没有必要承担这套复杂度。越能改变自己的 Agent，越需要状态治理。

## 第二部分：真正需要的是 Agent State Control Plane

技术上，问题不是“Agent 数据很多”，也不是“Agent 没有 Git”，而是它的长期行为状态缺少统一的事务、版本、授权与激活语义。

一个更准确的名字是 **Agent State Control Plane**。`Agent Native Git` 可以继续作为便于传播的产品名，但不应成为问题定义。

### 先区分哪些东西能够被版本化

Agent 周围的数据至少分成四类。

第一类是 **Canonical State**：决定 Agent 行为、能够被声明和审查的权威配置，例如 Memory Claims、Skills、Prompts、Policies、Workflows、Automation Definitions、Scripts、Tool Config 和 Plugin Manifests。

第二类是 **Derived State**：从权威配置构建出来的投影，例如 Embedding、Vector Index、Skill Registry、Compiled Prompt、Scheduler Runtime DB、缓存与搜索索引。这些数据应当可以重建，不应反过来成为事实来源。

第三类是 **Secrets**：API Key、OAuth Token、密码、私钥和 Cookie。版本库只能保存 `credential_ref`，真实值必须留在 Keychain、Vault 或其他安全存储中。

第四类是 **External Mutable State**：已经发出的邮件、创建的工单、执行的支付、删除的云资源、第三方 SaaS 的实际授权。这些状态既不在版本库内，也不一定可以回滚。

所以需要版本化的不是“Agent 的一切”，而是：

> Agent 可声明、可审查、能够决定未来行为的 canonical mutable configuration。

一个 State Commit 也不等于完整 Agent。更接近可复现身份的表达是：

```text
Agent Execution Identity =
  Model Version
  + Runtime Version
  + State Revision
  + Tool / Plugin Digests
  + System Policy
  + Environment Descriptor
  + Retrieved Context
  + External Observations
```

即使 State Revision 相同，模型服务、时间、工具返回和外部世界不同，行为也可能不同。Revision 提供的是明确的配置身份，不是虚假的完全确定性。

### Memory 不是一个普通文件夹

把 Memory 画成 `memory/` 很方便，但它容易掩盖数据模型。

“用户喜欢简洁回答”可能是用户明确说过的，也可能只是模型从一次行为中推断出来的；它还可能只适用于技术回答，而不是所有场景。一个更合理的 Memory 单元应类似：

```yaml
claim: prefers_concise_answers
value: true
scope: technical_answers
source: conversation://182/message/27
authority: explicit_user_statement
confidence: 1.0
valid_from: 2026-08-30T00:00:00+08:00
valid_until: null
supersedes: null
```

因此，Memory 的 canonical model 更像带时间与溯源的结构化 Claim Store。它可以序列化进 Git，也可以存入关系数据库、事件存储或图数据库。**序列化格式和权威数据模型不是一回事。**

### 一次变更需要 Transaction，而不是直接覆盖

一次 PR Review 能力升级可能同时修改 Memory、Skill、Script 与 Automation Definition。控制平面需要从某个 Base Revision 开始事务，在隔离区准备全部变化，再运行：

- Schema Validation；
- Dependency Validation；
- Secret Scan；
- Policy Validation；
- Skill、Script 与 Automation Test；
- Agent Regression Eval；
- Risk Classification；
- Human Approval Gate。

只有整组变化通过，才能生成新的不可变 Revision。任何失败都不应改变当前 Active State。

这解决的是 cross-resource consistency，但不承诺外部世界的 ACID Transaction。第三方 Scheduler、OAuth Provider 和 SaaS API 可能不支持共同提交，因此系统还需要 Materialization、Reconciliation、Idempotency 与 Compensation。

### 权限必须分成四种状态

把 `permissions/` 放进版本库，最多只能表示 Agent **希望采用的权限策略**。Repository 里写着 `github.write = true`，不代表 OAuth Provider 已经授予写权限。

至少应区分：

```text
Desired State
  控制平面希望系统成为什么样

Authorized State
  用户或外部权威实际批准了什么

Materialized State
  适配器已经成功配置了什么

Observed State
  系统当前观察到的真实状态
```

四者之间可能发生漂移：用户撤销了 OAuth Scope，版本库仍保留旧策略；Scheduler Job 创建失败，Desired State 已更新但 Materialized State 没跟上。

因此核心循环不是简单 `checkout`，而是控制平面常见的 reconciliation：

```text
Desired + Authorized
→ Materialize
→ Observe
→ Detect Drift
→ Retry / Compensate / Escalate
```

切换到旧 Revision 也不能自动恢复危险权限。权限扩大永远需要当前时刻的权威重新批准。

### Commit、Materialization 与 Activation 必须分开

一个候选版本可以已经保存，但仍未被批准；可以已经批准，但运行时投影构建失败；也可以投影构建成功，但尚未切换 Active Pointer。

更完整的生命周期是：

```text
Proposal
→ Transaction
→ Validation
→ Immutable Revision
→ Review / Authorization
→ Isolated Materialization
→ Reconciliation Check
→ Atomic Activation
```

Repository 是 canonical configuration 的 Source of Truth；Vector Index、Skill Registry、Scheduler Jobs 和 Compiled Prompt 是它的投影。只有投影全部满足激活条件，系统才移动 `active`。

正在执行的任务继续绑定旧 Revision，新任务使用新的 Active Revision。这更接近 MVCC、配置发布与声明式控制平面，而不只是 Git Checkout。

### 回退不等于撤销外部副作用

回退 Skill、Prompt 或 Automation Definition 相对直接，但它无法撤销过去已经发生的动作：

- 邮件已经发送；
- 支付已经完成；
- 文件已经被第三方删除；
- 消息已经被外部用户看到；
- 一个权限曾经被滥用。

因此系统必须区分：

```text
Configuration Rollback
  恢复未来行为所使用的配置

Projection Reconciliation
  让运行时投影重新匹配目标状态

External Compensation
  在业务允许时执行反向操作
```

Compensation 不是时间倒流。高风险操作仍需要确定性 Policy Gate、幂等键、Dry Run、审批和审计，不能把“以后可以回滚”当作安全理由。

### Diff 与 Merge 需要结构化语义

普通 Git Diff 告诉程序员哪几行变了；Agent 用户需要看到按 Memory、Skill、Automation、Policy 与 Permission 分组的 Semantic Diff，并知道：为什么改、证据是什么、影响范围多大、测试是否通过。

Merge 可以有三层：

1. Structural Merge：按 Schema 字段合并；
2. Text Three-way Merge：处理传统文本并发修改；
3. Semantic Conflict Analysis：识别 contradiction、duplicate、override、specialization 与 supersession。

但 Semantic Merge 不能只靠“再让一个 LLM 判断两句话是否冲突”。规则至少需要显式表达：

```text
subject
action
resource
scope
condition
priority
authority
effective_interval
exception_relation
```

LLM 可以发现、解释并提出解决方案，但高风险权限、支付、删除和外部写入不能由模型单独裁决。

### 隐私删除是一级设计问题

“历史尽可能不可变”和“用户有权要求忘记个人信息”存在结构性冲突。

如果地址、身份信息或敏感偏好曾进入 Content-addressed History，仅仅删除当前文件或创建 Revert Commit 并没有真正删除历史 Blob。副本还可能存在于 Remote、Backup、Packfile 和缓存中。

因此 Agent State System 从第一天就需要定义：

- 哪些数据禁止进入不可变历史；
- 对象级加密与密钥销毁；
- Retention Policy 与 Expiry；
- History Rewrite 与 Garbage Collection；
- Remote Purge Protocol；
- 删除完成后的可验证证明。

一种可能的折中是：版本库主要保存低敏感、结构化的行为策略与加密引用；高敏感 Memory 保存在支持期限、删除和访问控制的专用存储中，Revision 只记录受控指针和摘要。

Git 是否适合作为 Memory 的 Primary Store，不能在隐私模型确定之前先验决定。

### Hermes 已经提供了哪些现实线索

Nous Research 的 [Hermes Agent](https://github.com/NousResearch/hermes-agent) 是一个有价值的现实样本。

Hermes 的 Memory Tool 已经处理文件锁、原子写、并发漂移与 Session Snapshot；Skill Ledger 记录 Actor、Action、Evidence、Before / After Manifest，并使用内容寻址 Blob；Learning Graph 让 Memory 与 Skill 的关系可见；Cron 独立保存任务；Self-Evolution 使用 Candidate、Evaluation、Constraint Gate、PR 与 Human Review。

这些模块说明：Agent 一旦长期学习和修改自己，开发者会自然需要 Provenance、Snapshot、Rollback、Evaluation、Lifecycle 与 Review。

但 Hermes 当前更接近多个局部治理机制，还不是一个跨 Memory、Skill、Script 与 Automation 的全局事务控制平面。Skill Ledger 中那句 `The ledger is TELEMETRY, NOT A GATE.` 尤其关键：它记录修改，却不决定修改是否能够生效。

真正需要补上的不是更多 SHA，而是统一的 Transaction、Authorization、Materialization 与 Activation。

### Git 应该待在架构的哪一层

把 Git 全部从设计中删掉，绝大多数核心不变量仍然成立：

```text
Canonical State
Transaction
Candidate
Validation
Review
Authorization
Activation
Immutable Runtime Snapshot
Provenance
Rollback
Reconciliation
```

后端可以是：

- Relational Database + MVCC；
- Event Store；
- Object Store + Manifest；
- Content-addressed DAG；
- Git。

Git 的优势是成熟地提供 Blob、Tree、Commit DAG、Refs、Branch、Three-way Merge、Pack、Integrity Check 与 Remote Sync。它很适合做低频、可读配置的版本后端，也适合快速验证产品交互。

但 Git 不负责定义合法 Agent State，不提供跨外部系统事务，不处理授权事实，也不会自动解决隐私删除和副作用撤销。

一个不预设后端的架构可以写成：

```text
Agent State Control Plane
├── Typed Transaction & Validation
├── Candidate / Review / Authorization
├── Desired / Materialized / Observed State
├── Provenance, Privacy & Retention
├── Projection & Reconciliation
└── Version Backend
    ├── Git
    ├── Event Store
    └── Database + MVCC
```

所以 `Agent Native Git` 最适合被理解为一个产品隐喻：让用户像查看代码版本一样查看 Agent 的成长；技术本体则是 **Transactional, Versioned, Provenance-aware Agent State Control Plane**。

### 一个更诚实的 MVP

第一版不应该声称解决完整 Agent State，也不应直接版本化真实权限。它只需要覆盖四类相对可控的行为源：

- Structured Memory Claims；
- Skills；
- Automation Definitions；
- Scripts。

完成以下能力：全局 Revision、事务化候选版本、History、Semantic Diff、Candidate / Active 分离、Review、隔离 Materialization 与 Runtime Snapshot Pinning。

最适合验证的场景仍是一次 GitHub PR Review 能力升级：它同时修改 Memory、Skill、Script 与 Automation Definition。成功标准是：失败时 Active State 不变；成功时形成一个可审查 Revision；新任务使用新版本；旧任务保持原来的 Snapshot。

第一版明确不承诺：

- 撤销已经发生的外部副作用；
- 用一个 Commit 完整复现 Agent 行为；
- 自动恢复被撤销的外部授权；
- 让 LLM 自动解决全部语义冲突；
- 把敏感个人数据永久写进不可变历史。

这会让产品范围小很多，却更接近一个可验证的系统。

## 第三部分：设计上下文包

以下 YAML 是交给后续研究与实现工作的 **Design Context Packet**。它表达当前假设、边界与验证目标，不是已经完成的协议、Schema 或 RFC。

```yaml
design_context:
  id: agent-state-control-plane-v2
  status: exploratory_design_input
  language: zh-CN

  names:
    public_name: Agent Native Git
    technical_name: Agent State Control Plane
    precise_description: >-
      Transactional, versioned, provenance-aware control plane for mutable
      agent behavior configuration.

  thesis:
    problem: >-
      Long-lived agents mutate behavior sources across independently persisted
      systems, creating partial upgrades, drift, weak provenance and unsafe activation.
    claim: >-
      Such agents need transactions, immutable revisions, review, authorization,
      materialization, activation, runtime snapshot pinning and reconciliation.
    backend_position: >-
      Git is one possible version and history backend, not the control plane itself.

  data_classes:
    canonical_configuration:
      examples:
        - structured_memory_claims
        - skills
        - prompts
        - policies
        - automation_definitions
        - scripts
        - tool_and_plugin_manifests
    derived_projection:
      examples:
        - vector_index
        - skill_registry
        - compiled_prompt
        - scheduler_runtime_state
        - cache
    secrets:
      rule: references_only_in_revisions
    external_mutable_state:
      examples:
        - oauth_grants
        - sent_messages
        - payments
        - third_party_resources

  state_model:
    desired: declared target configuration
    authorized: configuration currently approved by an external authority
    materialized: configuration successfully applied to runtime systems
    observed: state currently reported by those systems

  lifecycle:
    - proposal
    - transaction_from_base_revision
    - typed_mutation
    - validation_and_evaluation
    - immutable_revision
    - review_and_authorization
    - isolated_materialization
    - reconciliation_check
    - atomic_activation

  core_invariants:
    - Running tasks bind to one immutable state revision.
    - Failed pre-activation work does not change active state.
    - A saved candidate is not automatically active.
    - Semantic changes carry actor, reason, evidence, scope and evaluation.
    - High-risk changes require deterministic gates and current authorization.
    - Runtime projections are rebuildable where possible.
    - Secret values never enter revision history.

  memory_claim_minimum_fields:
    - claim
    - value
    - scope
    - source
    - authority
    - confidence
    - valid_from
    - valid_until
    - supersedes

  rollback_model:
    configuration_rollback: changes future behavior configuration
    projection_reconciliation: converges runtime systems toward desired state
    external_compensation: best-effort domain-specific reverse action
    warning: External side effects are not erased by revision rollback.

  llm_boundary: >-
    LLMs may detect, explain and propose semantic conflict resolutions. They are
    not the sole authority for permission escalation, payment, deletion or other
    high-risk external side effects.

  privacy_requirements:
    - data_classification_before_versioning
    - retention_and_expiry
    - object_encryption_or_external_sensitive_store
    - history_rewrite_and_garbage_collection
    - remote_purge_protocol
    - verifiable_erasure

  mvp:
    included:
      - structured_memory_claims
      - skills
      - automation_definitions
      - scripts
    required:
      - global_revision
      - transaction
      - semantic_diff
      - candidate_active_separation
      - review
      - isolated_materialization
      - runtime_snapshot_pinning
    excluded:
      - complete_agent_reproducibility
      - automatic_permission_restoration
      - external_side_effect_rollback
      - unrestricted_sensitive_memory_history

  open_questions:
    - Which canonical data belongs in Git versus a temporal database?
    - What isolation and crash-recovery guarantees are required?
    - How are partial external materializations compensated or reconciled?
    - How is erasure propagated across remotes and backups?
    - Which semantic relations must be formalized before LLM assistance?
```

给继续接手这项工作的 Agent：不要先给 `~/.agent` 执行 `git init`，也不要先重写 Git。先定义 Canonical State、Transaction、Authorization、Materialization 与 Activation 的边界，再用一个跨 Memory、Skill、Script 和 Automation Definition 的端到端场景验证它。

模型让 Agent 会思考，工具让 Agent 会行动；而一个诚实面对授权、漂移、隐私和副作用的状态控制平面，才可能让 Agent 可靠地成长。
