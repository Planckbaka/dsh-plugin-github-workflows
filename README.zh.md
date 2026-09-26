# dsh-plugin-github

DeepSeek Harness (DSH) 插件:基于 [GitHub CLI](https://cli.github.com/) (`gh`) 的完整 GitHub 工作流。

## 工具一览

| 工具 | 覆盖 |
|---|---|
| `github_auth` | 登录状态、PAT 登录(token 走 stdin,不进日志)、刷新、切换账号 |
| `github_repo` | 查看/列表/创建/克隆/fork/编辑/同步/改名/归档/删除仓库 |
| `github_pr` | 创建/列表/查看/diff/checks/评论/review/合并/关闭/重开/编辑/ready/checkout |
| `github_issue` | 创建/列表/查看/状态/评论/关闭(带 reason)/重开/编辑/develop(关联分支) |
| `github_commit` | 只读提交浏览(列表/单提交/compare/分支),走 GitHub REST API |
| `github_release` | 创建(含自动生成 notes 与资产)/列表/查看/上传/下载/编辑/删除 |
| `github_actions` | run 列表/查看/日志/watch/rerun/cancel/delete + workflow 列表/查看/手动触发 |
| `github_codespace` | 列表/创建/ssh 非交互执行/cp/code/stop/rebuild/logs/delete |
| `github_search` | 仓库/issue/PR/代码/提交搜索 |
| `github_api` | 任意 REST/GraphQL 请求(逃生舱:label、milestone、project、gist、org…) |
| `github_cli` | 原样 gh 透传,**默认关闭**(`allowRaw: true` 才注册) |

## 安全设计

- 所有命令以 **argv 数组直传** `gh`,不经 shell——模型提供的任意文本(title/body/query)不可能注入;
- 破坏性动作(merge、delete、archive、rebuild、workflow 触发等)必须显式 `confirm: true`,且配置 `allowDestructive: false` 可全局硬禁;
- `github_cli` 透传默认关闭,并屏蔽浏览器/交互式命令;
- PAT 通过 stdin 传递,命令行与日志中永不出现;
- 超时(常规 60s、watch 类 300s,均可配置,上限 600s)+ 输出截断落盘。

## 认证(重要)

本插件不做自己的认证,完全复用 gh:

1. **推荐**:在 `~/.dsh/.env` 写入 `GH_TOKEN=ghp_xxx`(DSH 凭据环境),gh 原生识别;
2. 或调用 `github_auth`(action: `setup`)用 PAT 登录,token 经 stdin 安全传递;
3. 首次使用前先 `github_auth`(action: `status`)确认状态。

## 配置(cordis.patch.yml 的 config 段,全部可选)

| 键 | 默认 | 说明 |
|---|---|---|
| `ghPath` | `""` | gh 可执行文件路径覆盖(默认从 PATH 探测) |
| `defaultRepo` | `""` | 缺省仓库 `owner/name` |
| `timeoutMs` | `60000` | 常规命令超时 |
| `watchTimeoutMs` | `300000` | watch/logs 类长操作超时 |
| `maxOutputBytes` | `65536` | 输出截断阈值,超出部分写入临时 spill 文件 |
| `allowRaw` | `false` | 是否注册 `github_cli` 透传工具 |
| `allowDestructive` | `true` | 破坏性操作总开关 |
| `env` | `{}` | 附加环境变量(如 `GH_HOST` 企业版) |

## 前置要求

- 已安装 gh CLI(`winget install GitHub.cli` 或 https://cli.github.com/);
- 已认证(见上);
- 本地 git 提交/推送属于 git,请用 shell 工具完成,插件负责 GitHub 平台侧。

## 本地提交的写操作去哪了?

gh 没有 commit 子命令。`github_commit` 只提供只读浏览(列表/查看/compare/分支);创建提交、推送请使用 DSH 的 shell 工具跑 `git add/commit/push`,然后用 `github_pr create` 等接管平台侧流程。

## 安装与调试

```
plugin_manager: install_bundle → target: D:\Project2026\dsh-proje\dsh-plugin-github(绝对路径)
```

- 安装结果看返回的 `application` 字段,`applied` 即生效;
- 改配置(patch 的 config 段)HMR 即时生效;
- 改代码后需 禁用→启用;仍无效则重启应用。
