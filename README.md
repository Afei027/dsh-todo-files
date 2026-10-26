# dsh-todo-files

给 [DeepSeek Harness](https://github.com/deepseek-ai) 用的侧边栏插件：一个**待办清单**面板，每条待办可以挂一个本机文件；加待办不用点按钮，直接跟 agent 说一句就行。

> A DSH sidebar panel for personal todos. Each item can point at a file on your computer, and you add or change items by talking to the agent instead of clicking around.

## 能干什么

- **左侧栏图标**打开「待办」面板：勾选完成、悬停删除、一键清除已完成。
- **办公 / 生活**两类归属，面板顶部「全部 / 办公 / 生活」筛选，各带未完成数量；列表里用标题前的小圆点区分（办公蓝、生活绿，悬停有文字）。
- **序号**：按当前视图的位置编号，可以直接说「第 2 条删掉」。
- **回连对话**：每条待办记着它是**哪段对话**里加的，任何对话里加都行。点 🔗 回到那段对话；如果它已经被归档，会先自动恢复再打开——**归档过的也点得动**。出处指不到了（对话被删）就不显示 🔗，不会留死链。
- **文件直达（传送门）**：每条待办可挂一个文件或文件夹，点行尾的 🌀 直接打开——文件夹交给资源管理器，文件在该出处的对话里用 DSH 自己的预览打开（`dsh-resource://file/session/<会话>/<路径>`，不另造文件浏览器）；悬停图标可看完整路径。
- **说一句就加**：面板底部是给 agent 的输入条，也可以在正常对话里说「帮我找找周报模板，加进待办」。Agent 有一个 `personal_todos` 工具（`list` / `add` / `update` / `remove` / `clear_done`），读写的就是面板这份数据——在任何对话里都可用，与当前开着哪段对话无关。
- **自动同步**：面板每 6 秒静默刷新，点列表任意处也会在 300ms 后重拉一次，右上角还有「刷新」。

## 安装

插件是纯 JavaScript，没有构建步骤。

**桌面端 / Web（推荐）**：设置 → 插件 → 添加，粘贴

```
github:OWNER/dsh-todo-files
```

也可以直接让 agent 装：「用 plugin_manager 安装 github:OWNER/dsh-todo-files」。

**CLI**（`dsh plugin` 会把参数转给 profile 目录里的 pnpm）：

```bash
dsh plugin --profile web add github:OWNER/dsh-todo-files
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

## 许可

MIT。`LICENSE` 里的版权人记得改成你自己；`package.json` 里的 `OWNER` 换成你的 GitHub 用户名。
