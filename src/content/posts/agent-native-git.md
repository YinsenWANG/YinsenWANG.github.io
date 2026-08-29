---
author: Yinsen
pubDatetime: 2026-08-30T00:10:00+08:00
title: Agent Native Git：让 Agent 的成长可见、可审查、可回退
featured: true
draft: false
tags:
  - AI Agent
  - Agent Infrastructure
  - Git
description: 从普通读者、技术实现者和 Agent 三个视角，解释为什么长期运行、能够自我修改的 Agent 需要一套原生的版本化状态系统。
---

现在的 Agent 已经不只是回答一次问题。它会记住你的偏好，学习新的 Skill，写脚本，创建定时任务，安装插件，也会慢慢改变自己的工作方式。

这带来了一个很少被认真讨论的问题：Agent 学到的东西越来越多以后，我们怎么知道它现在到底变成了什么样？

这篇文章分成三个部分。第一部分写给不熟悉技术的读者，用一个具体例子解释问题；第二部分写给技术人员，讨论架构、实现机会与边界；第三部分直接写给 Agent，尽量保留完整、明确、可继续执行的上下文。

## 第一部分：先把 Agent 的变化管起来

假设你有一个长期协助工作的 Agent。几周之内，它做了这些事：

- 记住你不喜欢频繁确认；
- 学会一套 GitHub PR Review 方法；
- 写了一个自动检查 CI 的脚本；
- 创建了每天检查 PR 的定时任务；
- 获得了在项目目录中写文件的权限；
- 后来又更新了那套 Review Skill。

这些变化并不一定保存在同一个地方。偏好可能在 Memory 里，Skill 在文件夹里，定时任务在数据库里，权限在配置文件里，插件又有自己的状态。

更麻烦的是，它们并不独立。定时任务依赖 Skill，Skill 调用脚本，脚本需要权限。一次“改进 PR Review”的决定，实际上可能同时改变五六种东西。

如果 Agent 写完了 Memory 和 Skill，却在创建脚本时失败，就会进入一种“半升级”状态：它已经相信自己拥有新能力，实际运行所需的部分却没有准备完整。每个文件单独看也许都没坏，整个 Agent 却已经不再一致。

Memory 越积越多，也会出现类似问题。比如 Agent 先后记住：

> 用户不喜欢每次都被询问。

> 修改文件前要询问用户。

> 常规代码修改不需要确认。

三句话各自都有道理，但范围和优先级并不清楚。Agent 每次工作时只能重新猜一遍。信息增加了，行为反而更不稳定。我把它叫作「Agent 状态熵」：Agent 里面的东西越来越多，它们之间的关系却越来越混乱。

Git 给了我们一个很自然的启发。

Git 经常被理解为程序员保存代码的工具，但它真正解决的是一组更普遍的问题：现在是什么状态，之前是什么状态，谁改了什么，为什么改，两个人同时修改怎么办，改坏了怎么恢复，能不能先试验再正式使用。

这些问题以前主要发生在代码里，现在也开始发生在 Agent 身上。

所以 Agent Native Git 并不是让 Agent 学会输入 `git commit`。它的意思是：Agent 每次学习或修改自己，不再直接覆盖原来的状态，而是先准备一个完整的新版本，让系统知道这次为什么改、改了哪些部分、是否通过检查，最后再决定要不要启用。

理想的过程应该是：

```text
Agent 提出一次改变
→ 准备候选版本
→ 检查依赖、冲突、权限与风险
→ 人或系统进行审查
→ 正式启用
```

如果检查失败，Agent 继续使用旧版本。候选版本即使已经保存，也不代表马上投入运行。

有了这套机制，用户看到的也不该再是一页几百条 Memory，而应该是 Agent 的更新记录：

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

你可以查看变化依据，接受、拒绝或恢复。你管理的不再是一堆零散数据，而是 Agent 的成长过程。

这套系统只对一类 Agent 真正必要：拥有长期状态、会持续学习或自我修改的 Agent。一次性问答工具没有必要承担这套复杂度。越能改变自己的 Agent，越需要版本化状态治理。

---

## 第二部分：把 Agent State 变成可实现的系统

技术上，问题不是「Agent 数据很多」，而是它的长期状态缺少统一提交语义。

### 需要管理的是行为源，不是所有数据

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

### Hermes 已经走到哪一步

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

### 五条核心不变量

一套可工作的 Agent Native Git 至少需要以下系统不变量。

**一、正式状态只能来自不可变 Snapshot。** 每个 Session 或 Task 都绑定明确的 State Commit。后台生成的新状态不能改变正在执行的任务。

**二、所有 Canonical Mutation 必须经过 Transaction。** 一次 PR Review 升级涉及 Memory、Skill、Script、Automation 和 Permission 时，要么全部形成新 Commit，要么 Active State 完全不变。

**三、Commit 与 Activation 分离。** 一个版本可以已经被保存，但仍处于 Candidate 状态。`main` 表示已经接受的主状态，`candidate` 表示待评估状态，`active` 表示 Runtime 真正使用的状态。

**四、每个 Commit 携带 Evidence 与 Evaluation。** 系统不仅记录改了什么，还记录为什么改、证据来自哪里、置信度、影响范围、风险、测试和审批结果。

**五、高风险变化不能由模型单独裁决。** 权限提升、支付、数据删除、外部写入等必须经过确定性的 Policy Gate；LLM 可以发现和解释冲突，但不能成为唯一安全边界。

### Commit 需要比 Git 多知道什么

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

### Runtime 应该是 Repository 的投影

许多 Agent 今天把 Markdown、SQLite、Vector DB 和 Scheduler DB 同时当作真实数据源。更干净的架构是：

```text
Agent Repository
→ Materializer
→ Runtime Projection
```

`memory/` 生成 Vector Index，`skills/` 生成 Skill Registry，`automations/` 生成 Scheduler Jobs，`policies/` 生成 Permission Engine，`prompts/` 生成 Compiled System Prompt。

Repository 是 Source of Truth，其余系统是可以重建的投影。这样 Runtime 数据损坏后可以恢复，Checkout 任意 Commit 可以重建当时的 Agent，Diff 与 Review 也基于可读的行为源，而不是数据库内部状态。

激活新版本时，应先在隔离环境中构建所有 Projection，验证成功后再原子移动 `active`。正在执行的任务继续绑定旧 Commit，新任务才使用新版本。

### Diff 与 Merge 必须理解语义

普通 Git Diff 告诉程序员哪几行变了；Agent 的用户需要看到 Memory、Skill、Automation、Permission 分组后的 Semantic Diff。

Merge 至少有三层：

1. Structural Merge：按 JSON、YAML 和 Schema 字段合并；
2. Text Three-way Merge：处理传统文件并发修改；
3. Semantic Merge：识别 contradiction、duplicate、override、specialization 与 supersession。

例如「危险操作前必须确认」和「常规代码编辑不需要确认」可能不是冲突，而是具体规则对一般规则的补充。系统应尽量用 Scope、Priority、Effective Time 和 Explicit Override 表达关系，而不是每次都让 LLM 猜。

### Branch、A/B 与回归定位

Self-improvement 不应等于直接修改 Production。Agent 可以从 `main` 创建 Experiment Branch，生成候选状态，在相同 Eval Set 上比较 Task Success、Tool Calls、Latency、Tokens 与 Policy Violations，表现更好再 Merge。

多个 Agent 也可以从同一个 Base Commit 分叉，各自提交后做 Three-way Merge，而不是共享一个 Last-write-wins 的可变数据库。

当 Agent 在 Commit A 表现正常、Commit H 开始异常时，还可以像 Git Bisect 一样加载中间状态并运行 Agent Eval，定位首次引入回归的 Commit。这会把「Agent 最近怎么变奇怪了」变成可执行的 Regression Debugging。

### 底层不需要重新发明 Git

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

### MVP 与边界

第一版只需要覆盖 Memory、Skills、Automations 和 Scripts，完成七件事：全局 Snapshot、事务化 Commit、History、Semantic Diff、Rollback、Candidate / Active 分离、Review 页面。

最适合验证的场景仍是一次 GitHub PR Review 能力升级：它同时修改多种状态，具有脚本、自动化、权限与评估要求，可以清楚验证“失败时 Active 不变，成功后单一 Commit 激活”的核心价值。

需要尽早承认的边界包括：

- Git History 与用户隐私删除权存在张力；
- State Commit 之外还要记录 Model、Runtime、Tool 和 Plugin 版本，才能接近完整复现；
- 外部 API 返回值仍可能不可复现；
- 高频自动修改会造成 Commit 噪声，需要聚合、过期与归档策略；
- Semantic Conflict Detection 不可能只靠 LLM；
- Automation 与 Permission 的 Activation 可能产生真实副作用，必须有 Dry Run、审批和回退。

到这里，Agent Native Git 更准确的名字也许不是 Git，而是 **Agent State SCM**：一套事务化、版本化、可审查、可激活的软件配置系统。

---

## 第三部分：给 Agent 的完整上下文包

以下内容面向接手研究、设计或实现工作的 Agent。把它视为规范性上下文，而不是对上文的摘要。术语 `MUST`、`SHOULD`、`MAY` 分别表示必须、应当和可以。

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
    - Git history conflicts with privacy deletion and requires purge design.
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
