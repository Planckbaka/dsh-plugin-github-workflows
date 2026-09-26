# dsh-plugin-github-workflows

[![CI](https://github.com/Planckbaka/dsh-plugin-github-workflows/actions/workflows/ci.yml/badge.svg)](https://github.com/Planckbaka/dsh-plugin-github-workflows/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](package.json)
[![Release](https://img.shields.io/github/v/release/Planckbaka/dsh-plugin-github-workflows?include_prereleases)](https://github.com/Planckbaka/dsh-plugin-github-workflows/releases)

[English](README.md) | **简体中文**

面向 [DeepSeek Harness (DSH)](https://github.com/topics/dsh-plugin) 的完整 GitHub 工作流插件,基于
[GitHub CLI](https://cli.github.com/) —— 提交、Pull Request、Issue、Release、Actions、仓库、Codespaces
与搜索,一个零依赖插件搞定:11 个类型化工具、80+ 个动作。

## 特点

- **类型化,而非字符串拼接** —— 每个操作都是带 `action` 枚举的 JSON Schema
  工具;命令以 argv 数组构建、**不经 shell** 执行,模型提供的任何文本都不可能注入 shell 语法;
- **默认安全** —— 破坏性操作(merge、delete、force-push、rebuild、workflow
  触发等)必须显式 `confirm: true`,配置总开关 `allowDestructive` 可全局硬禁;
- **零配置认证** —— 复用 gh 登录、`GH_TOKEN`,并自动回退到 git 凭证助手里
  已存的凭证。能 `git push` 的机器,插件开箱即用;
- **零依赖** —— 仅用 Node 内置模块;从 git 仓库或本地目录安装,无需解析、无需构建。

## 工具一览

| 工具 | 覆盖 |
|---|---|
| `github_auth` | 登录状态、PAT 登录(token 走 stdin,不进日志)、刷新、切换账号 |
| `github_repo` | 查看 / 列表 / 创建 / 克隆 / fork / 编辑 / 同步 / 改名 / 归档 / 删除 |
| `github_pr` | 创建 / 列表 / 查看 / diff / checks / 评论 / review / 合并 / 关闭 / 重开 / 编辑 / ready / checkout / 状态 |
| `github_issue` | 创建 / 列表 / 查看 / 状态 / 评论 / 关闭(带 reason) / 重开 / 编辑 / develop(关联分支) |
| `github_commit` | 只读提交浏览(列表 / 单提交 / compare / 分支),走 GitHub REST API |
| `github_release` | 创建(含自动生成 notes 与资产) / 列表 / 查看 / 上传 / 下载 / 编辑 / 删除 |
| `github_actions` | run:列表 / 查看 / 日志 / watch / rerun / cancel / delete;workflow:列表 / 查看 / 手动触发 |
| `github_codespace` | 列表 / 创建 / ssh 非交互执行 / cp / code / stop / rebuild / logs / delete |
| `github_search` | 仓库 / issue / PR / 代码 / 提交搜索 |
| `github_api` | 任意 REST/GraphQL 请求(逃生舱:label、milestone、project、gist、org…) |
| `github_git` | 本地 git:status / add / commit / push / pull / fetch / branch / log / remote |
| `github_cli` | 原样 gh 透传,**默认关闭**(`allowRaw: true` 才注册) |

## 安装

前置:[DSH](https://github.com/topics/dsh-plugin)、Node >= 18、
[gh CLI](https://cli.github.com/)、git,以及任意一个认证来源(见下)。

在 DSH 对话中让智能体调用 `plugin_manager`,或 GUI **设置 → 插件 → 安装插件**:

```
install_bundle → target: github:Planckbaka/dsh-plugin-github-workflows
```

## 快速上手

装好后的典型「编码 → PR → CI → 发版」动线:

```
github_auth       action: status                    ← 确认认证
github_git        action: status                    ← 看改了什么
github_git        action: add      paths: ["src"]
github_git        action: commit   message: "Fix ..."
github_git        action: push     setUpstream: true
github_pr         action: create   title: "Fix ..."  fill: true
github_actions    action: run_watch  runId: <id>     ← 盯 CI 到绿
github_pr         action: merge    mergeMethod: squash, deleteBranch: true, confirm: true
github_release    action: create   tag: v1.1.0, generateNotes: true
```

## 认证

插件完全复用已有凭证,**自动按顺序回退**:

1. gh 自身已登录(`gh auth login` 过)→ 直接用;
2. 环境变量 `GH_TOKEN`(如 `~/.dsh/.env`)→ gh 原生识别;
3. **git 凭证回退** —— gh 未登录时,自动读取 git 凭证助手(GCM /
   Windows 凭据管理器)中 `github.com` 的凭证(禁用交互提示)注入为
   `GH_TOKEN`。

也可调用 `github_auth`(action: `setup`)用 PAT 显式登录(token 经 stdin,
不进日志)。完整凭证模型见 [SECURITY.md](SECURITY.md)。

## 配置

全部可选 —— 默认值在 `lib/index.js`;在插件的 `config` 段覆盖(见
[cordis.patch.yml](cordis.patch.yml))。

| 键 | 默认 | 说明 |
|---|---|---|
| `ghPath` | `""` | gh 可执行文件路径覆盖(默认从 PATH 探测) |
| `gitPath` | `""` | git 可执行文件路径覆盖(`github_git` 工具与凭证回退用) |
| `defaultRepo` | `""` | 缺省仓库 `owner/name` |
| `timeoutMs` | `60000` | 常规命令超时 |
| `watchTimeoutMs` | `300000` | watch/logs 类长操作超时 |
| `maxOutputBytes` | `65536` | 输出截断阈值,超出部分写入临时 spill 文件 |
| `allowRaw` | `false` | 是否注册 `github_cli` 透传工具 |
| `allowDestructive` | `true` | 破坏性操作总开关 |
| `env` | `{}` | 附加环境变量(如 `GH_HOST` 企业版) |

## 开发

```bash
git clone https://github.com/Planckbaka/dsh-plugin-github-workflows.git
npm install --no-save typescript@5 @types/node   # 可选:类型检查
npx tsc --noEmit                                  # JSDoc 类型,零构建
npm test && npm run test:integration
```

目录结构、dsh-tools JSON Schema 子集规则与完整贡献指南见
[CONTRIBUTING.md](CONTRIBUTING.md)。

## 社区规范

[贡献指南](CONTRIBUTING.md) · [安全策略](SECURITY.md) ·
[行为准则](CODE_OF_CONDUCT.md) · [更新日志](CHANGELOG.md) ·
[问题反馈](https://github.com/Planckbaka/dsh-plugin-github-workflows/issues) ·
[讨论区](https://github.com/Planckbaka/dsh-plugin-github-workflows/discussions)

## 许可证

[MIT](LICENSE)
