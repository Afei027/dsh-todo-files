# dsh-todo-files

给 [DeepSeek Harness](https://github.com/deepseek-ai) 用的侧边栏插件：一个**待办清单**面板，每条待办可以挂一个本机文件；加待办不用点按钮，直接跟 agent 说一句就行。

> A DSH sidebar panel for personal todos. Each item can point at a file on your computer, and you add or change items by talking to the agent instead of clicking around.

## 能干什么

- **左侧栏图标**打开「待办」面板：勾选完成、删除（可撤销）、一键清除已完成。
- **办公 / 生活**两类归属，面板顶部「全部 / 办公 / 生活」筛选，各带未完成数量。
- **在面板里直接改**：双击标题就地改名，点日期标签改截止日（含「今天 / 明天 / 一周后」快捷键），行尾 📅 给没有日期的待办补上。
- **搜索与快捷筛选**：`/` 或右上角放大镜展开搜索；「今天 / 逾期」一键过滤。
- **标签**：每条待办最多 6 个短标签，点标签筛选。
- **子任务**：行尾 ＋ 就地加一条子任务，缩进显示；删父任务会连子任务一起进回收站。
- **重复任务**：每天 / 每周 / 每月，勾完自动生成下一次（日期自动滚到未来）。
- **回收站**：删除先进回收站保留 7 天，可恢复、可彻底删；标题栏的 🗑 只在有内容时出现。
- **数据安全**：每次写入前留一份 `todos.json.bak`；存储格式 `version: 2`，旧版文件自动兼容。
- **回连对话**：每条待办记着它是**哪段对话**里加的，点 🔗 回到那段对话（归档的会先恢复）。注：只能定位到会话，定位不到具体某一行——宿主暂无该能力。
- **传送门**：每条待办可挂一个文件或文件夹。点行尾 🌀 会在资源管理器里打开**它所在的文件夹并选中该文件**（挂的是文件夹就打开它自己），面板同时给一行提示作为凭据。
- **说一句就加**：底部是给 agent 的输入条；Agent 有一个 `personal_todos` 工具（`list` / `add` / `update` / `remove` / `clear_done`），支持 `due` / `category` / `recurring` / `tags`。
- **自动同步**：面板每 6 秒静默刷新，右上角还有「刷新」。

## 版本

| 版本 | 内容 |
|---|---|
| **v1.1.1** | 面板标题栏的更新提示：远端有新版本时才出现，点一下就安装（本地 git 检出则执行 git pull），网络不通时不打扰 |
| v1.1.0 | 面板内增删改（改名 / 改日期）、搜索与今天·逾期、标签、子任务、重复任务、回收站、自动备份、撤销删除、行密度与布局重做 |
| v1.0.0 | 首个版本：清单、两类归属、序号、回连对话、文件传送门、agent 工具 |

## 安装

![安装步骤](docs/install-guide.png)

插件是纯 JavaScript，没有构建步骤。

**桌面端 / Web（推荐）**：设置 → 插件 → 添加，粘贴

```
github:Afei027/dsh-todo-files
```

也可以直接让 agent 装：「用 plugin_manager 安装 github:Afei027/dsh-todo-files」。

**CLI**（`dsh plugin` 会把参数转给 profile 目录里的 pnpm）：

```bash
dsh plugin --profile web add github:Afei027/dsh-todo-files
```

本地开发时可以直接装目录：

```bash
dsh plugin --profile web add link:/absolute/path/to/dsh-todo-files
```

装好后重启或刷新页面，左侧栏「插件」「日程」后面会多一个清单图标。

## 选择器与数据

- 待办存在主机侧 `$DSH_HOME/data/dsh-todo-files/todos.json`（可用 `dataDir` 改），刷新页面、重启 DSH 都不丢。
- 面板取数走 `POST /todo-files/api`，参数在查询串里，不需要请求体。桌面窗口是 `file://` 页面、没有 http 源也没有浏览器 cookie，所以路由还接受一个本机口令 `key=`；两组凭据任一通过即可（`requireAuth: true` 时仍然检查浏览器会话）。
- 这个插件**不读文件内容**：只有「在资源管理器中定位」（`fs.reveal`）。文件预览交给 DSH 自己的预览面板。

## 配置

`cordis.patch.yml` 的 `config`：

| 字段 | 默认 | 含义 |
|---|---|---|
| `requireAuth` | `true` | 除口令外，还接受通过浏览器会话校验的请求 |
| `dataDir` | `$DSH_HOME/data/dsh-todo-files` | 待办 JSON 的存放目录 |

## 开发

改 `client.js` 会热更新到页面；改 `index.js`（主机侧）需要重载这一行插件，例如在插件页关掉再打开。

## 发布

推到 GitHub 后别人一条命令就能装：`github:Afei027/dsh-todo-files`。

```bash
git remote add origin https://github.com/Afei027/dsh-todo-files.git
git push -u origin main
git tag v1.0.0 && git push --tags     # 可选，方便按版本装：github:Afei027/dsh-todo-files#v1.0.0
```

不想走 GitHub 也可以直接发文件夹：对方解压后

```bash
dsh plugin --profile web add link:D:\path\to\dsh-todo-files
```

插件没有构建步骤，也不需要联网；对方第一次用时数据目录会自动创建。

## 许可

MIT，版权人 Afei027。

