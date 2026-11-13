/**
 * Browser half of the `dsh-todo-files` bundle.
 *
 * One panel, one job: the personal todo list, in the main column, opened from the sidebar icon.
 * Each item may carry one linked path; clicking that path goes back to the Conversation and opens
 * the file there through DSH's own file preview, so this plugin never re-implements a file browser.
 *
 * Data comes from the package's host half. The desktop window is a `file://` page, so the request
 * is a relative path to the carrier's route (the shape the client's own RPC uses) and carries the
 * loopback key that route accepts instead of a browser session cookie.
 */
window.__ModuleLoader__.load({
  id: 'dsh-todo-files',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useCallback, useMemo, useRef } = React

    const PANEL_ID = 'todo-files'
    const ICON_ORDER = 20
    const ENDPOINT = '/todo-files/api'
    /** Loopback key the host route accepts; see `PANEL_TOKEN` in the host half. */
    const PANEL_KEY = 'tf-2f7c9a1e6b8d4c05'
    /** Build marker: it rides every request so the host access log shows which panel build is live. */
    const CLIENT_REV = '2026-11-13.2'

    // ---------------------------------------------------------------- text

    const ZH = {
      'panel.title': '待办',
      'panel.sub': '{open} 条待办未完成',
      'panel.subEmpty': '还没有待办',
      'todo.empty.title': '还没有待办',
      'todo.empty.hint': '在上面跟我说一句，或者直接让我加一条。',
      'todo.emptyScope': '这一类还没有待办。',
      'filter.all': '全部',
      'filter.work': '办公',
      'filter.life': '生活',
      'filter.today': '今天',
      'filter.overdue': '逾期',
      'quick.placeholder': '加一条待办，回车保存…',
      'quick.add': '加',
      'search.placeholder': '搜索待办…',
      'todo.open': '进行中',
      'todo.done': '已完成',
      'todo.markDone': '标记完成',
      'todo.markOpen': '标记未完成',
      'todo.remove': '删除这条待办',
      'todo.clearDone': '清除已完成',
      'todo.openConversation': '回到这条待办所在的对话',
      'todo.openTarget': '传送门：打开这个文件所在的文件夹',
      'todo.reveal': '在资源管理器中显示',
      'due.today': '今天',
      'due.tomorrow': '明天',
      'due.overdue': '已过期',
      'say.placeholder': '跟 DSH 说一句：帮我找找周报模板，加进待办…',
      'say.send': '发送给 DSH',
      'say.hint': '发往「待办」专用对话 · 回车发送 · Shift+Enter 换行',
      'say.sending': '发送中…',
      'say.sent': '已发给「待办」专用对话，新待办会自动出现在上面',
      'say.open': '看回复',
      'say.draft': '已放进对话输入框，按回车发送',
      'say.openChat': '打开对话',
      'say.unavailable': '当前界面连不上会话服务，请刷新页面再试。',
      'say.empty': '先写点什么再发。',
      'common.retry': '重试',
      'common.refresh': '刷新',
      'portal.reveal': '已在资源管理器打开文件夹：{name}',
    }

    const EN = {
      'panel.title': 'Todos',
      'panel.sub': '{open} todo(s) open',
      'panel.subEmpty': 'Nothing open',
      'todo.empty.title': 'No todos yet',
      'todo.empty.hint': 'Say something above, or just ask me to add one.',
      'todo.emptyScope': 'Nothing in this list yet.',
      'filter.all': 'All',
      'filter.work': 'Work',
      'filter.life': 'Life',
      'filter.today': 'Today',
      'filter.overdue': 'Overdue',
      'quick.placeholder': 'Add a todo, Enter to save…',
      'quick.add': 'Add',
      'search.placeholder': 'Search todos…',
      'todo.open': 'Open',
      'todo.done': 'Done',
      'todo.markDone': 'Mark done',
      'todo.markOpen': 'Mark open',
      'todo.remove': 'Delete this todo',
      'todo.clearDone': 'Clear done',
      'todo.openConversation': 'Go to the conversation this todo came from',
      'todo.openTarget': 'Portal: open the folder that holds this file',
      'todo.reveal': 'Show in file manager',
      'due.today': 'Today',
      'due.tomorrow': 'Tomorrow',
      'due.overdue': 'Overdue',
      'say.placeholder': 'Tell DSH what you need: find last week’s template and add it to my todos…',
      'say.send': 'Send to DSH',
      'say.hint': 'Goes to the dedicated Todos conversation · Enter to send · Shift+Enter for a new line',
      'say.sending': 'Sending…',
      'say.sent': 'Sent to the dedicated Todos conversation — new todos will appear above',
      'say.open': 'See reply',
      'say.draft': 'Put in the chat box — press Enter there to send',
      'say.openChat': 'Open chat',
      'say.unavailable': 'The chat service is unreachable from this page; refresh and retry.',
      'say.empty': 'Write something first.',
      'common.retry': 'Retry',
      'common.refresh': 'Refresh',
      'portal.reveal': 'Opened the folder in the file manager: {name}',
    }

    // ---------------------------------------------------------------- css

    const CSS = `
.dsh-tf-root, .dsh-tf-root * { box-sizing: border-box; }
.dsh-tf-root {
  --dsh-tf-work: #2f6bff;
  display: flex; flex-direction: column; height: 100%; min-height: 0;
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
  font-family: inherit; font-size: 15px; line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
.dsh-tf-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; padding: 18px 22px 12px; flex: none; }
.dsh-tf-headline { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.dsh-tf-titlerow { display: flex; align-items: center; gap: 8px; min-width: 0; }
.dsh-tf-title { margin: 0; font-size: 20px; font-weight: 600; letter-spacing: .2px; line-height: 1.3; }
.dsh-tf-sub { font-size: 14px; color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-tf-body { flex: 1; min-height: 0; overflow: auto; padding: 0 22px 20px; }
.dsh-tf-pane { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.dsh-tf-error {
  margin: 8px 0 4px; padding: 9px 12px; border-radius: 9px; font-size: 14px; line-height: 1.6;
  border: 1px solid var(--dsw-alias-state-error-primary); color: var(--dsw-alias-label-primary);
  display: flex; align-items: center; gap: 10px;
}
.dsh-tf-notice {
  margin: 8px 0 4px; padding: 7px 12px; border-radius: 9px; font-size: 13px; line-height: 1.5;
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary);
  border: 1px solid var(--dsw-alias-border-l1);
}
.dsh-tf-list {
  display: flex; flex-direction: column; gap: 1px; margin-top: 2px;
  background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 12px; padding: 4px;
}
.dsh-tf-filters { display: contents; }
.dsh-tf-divider { flex: none; width: 1px; height: 18px; margin: 0 2px; background: var(--dsw-alias-border-l1); }
.dsh-tf-filter {
  display: inline-flex; align-items: center; height: 32px; padding: 0 14px;
  border-radius: 9px; border: 1px solid var(--tf-line); background: transparent;
  color: var(--tf-line); font: inherit; font-size: 14px; cursor: pointer;
  transition: background .15s ease, color .15s ease, border-color .15s ease, box-shadow .15s ease, filter .15s ease;
}
.dsh-tf-filter[data-scope="all"] {
  --tf-line: var(--dsw-alias-label-secondary);
  --tf-fill: var(--dsw-alias-label-primary);
  --tf-on: var(--dsw-alias-bg-base);
}
.dsh-tf-filter[data-scope="work"] {
  --tf-line: var(--dsh-tf-work);
  --tf-fill: var(--dsh-tf-work);
  --tf-on: #fff;
}
.dsh-tf-filter[data-scope="life"] {
  --tf-line: var(--dsw-alias-state-success-primary);
  --tf-fill: var(--dsw-alias-state-success-primary);
  --tf-on: #fff;
}
.dsh-tf-filter[data-scope="quick"] {
  --tf-line: var(--dsw-alias-label-secondary);
  --tf-fill: var(--dsw-alias-label-primary);
  --tf-on: var(--dsw-alias-bg-base);
}
.dsh-tf-filter:hover { background: color-mix(in srgb, var(--tf-line) 12%, transparent); }
.dsh-tf-filter.is-active {
  background: var(--tf-fill);
  border-color: var(--tf-fill);
  color: var(--tf-on);
  box-shadow: 0 1px 4px color-mix(in srgb, var(--tf-fill) 38%, transparent);
}
.dsh-tf-filter.is-active:hover { filter: brightness(1.06); }
.dsh-tf-filter-count { margin-left: 6px; font-size: 13px; font-weight: 500; font-variant-numeric: tabular-nums; opacity: .68; }
.dsh-tf-filter.is-active .dsh-tf-filter-count { opacity: .85; }
.dsh-tf-sec { display: flex; align-items: center; gap: 8px; margin: 14px 0 2px; padding: 0 8px; font-size: 12px; font-weight: 600; letter-spacing: .4px; color: var(--dsw-alias-label-secondary); }
.dsh-tf-sec:first-child { margin-top: 2px; }
.dsh-tf-sec-count { font-variant-numeric: tabular-nums; }
.dsh-tf-sec-toggle {
  display: inline-flex; align-items: center; gap: 6px; padding: 0; border: 0;
  background: transparent; font: inherit; color: inherit; cursor: pointer;
}
.dsh-tf-sec-toggle:hover { color: var(--dsw-alias-label-primary); }
.dsh-tf-chevron { display: inline-block; font-size: 11px; transition: transform .15s ease; }
.dsh-tf-chevron.is-open { transform: rotate(90deg); }
.dsh-tf-sec-action { margin-left: auto; }
/* ---------- pixel corgi ---------- */
.dsh-tf-root { position: relative; }
.dsh-tf-pet {
  position: absolute; right: 14px; bottom: 108px; z-index: 6;
  display: flex; align-items: flex-end; gap: 6px; pointer-events: none;
}
.dsh-tf-pet-stage { position: relative; pointer-events: auto; }
.dsh-tf-pet-body {
  padding: 0; border: 0; background: none; cursor: pointer; display: block;
  transform-origin: bottom center; animation: dsh-tf-breathe 3.1s ease-in-out infinite;
  filter: drop-shadow(0 8px 12px rgba(15, 23, 42, .16));
}
.dsh-tf-pet-body:active { transform: scale(.95) translateY(1px); }
.dsh-tf-pet-body.is-happy { animation: dsh-tf-hop .45s ease-out; }
@keyframes dsh-tf-breathe {
  0%, 100% { transform: translateY(0) scaleY(1); }
  50% { transform: translateY(-2px) scaleY(1.03); }
}
@keyframes dsh-tf-hop {
  0% { transform: translateY(0) scale(1); }
  40% { transform: translateY(-10px) scale(1.06); }
  100% { transform: translateY(0) scale(1); }
}
.dsh-tf-pet-bubble {
  pointer-events: auto; position: absolute; right: 0; bottom: 100%; margin-bottom: 46px; max-width: 190px;
  background: #fff; color: var(--dsw-alias-label-primary, #1f2328);
  border: 1px solid #e6e8ec; border-radius: 14px; padding: 9px 12px;
  font-size: 13px; line-height: 1.55; letter-spacing: .01em;
  box-shadow: 0 10px 24px rgba(15, 23, 42, .12);
  animation: dsh-tf-bubble-in .22s ease-out;
}
.dsh-tf-pet-bubble:after {
  content: ''; position: absolute; left: 22px; bottom: -6px; width: 11px; height: 11px;
  background: #fff; border-right: 1px solid #e6e8ec; border-bottom: 1px solid #e6e8ec;
  transform: rotate(45deg);
}
@keyframes dsh-tf-bubble-in {
  from { opacity: 0; transform: translateY(4px) scale(.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.dsh-tf-pet-actions {
  position: absolute; right: 0; bottom: 100%; margin-bottom: 8px; display: flex; gap: 6px; pointer-events: auto;
  opacity: 0; transition: opacity .15s ease; white-space: nowrap;
}
.dsh-tf-pet:hover .dsh-tf-pet-actions,
.dsh-tf-pet-actions:focus-within,
.dsh-tf-pet.is-teaching .dsh-tf-pet-actions { opacity: 1; }
.dsh-tf-pet-btn {
  display: inline-flex; align-items: center; gap: 4px; height: 26px; padding: 0 9px; white-space: nowrap; flex: none;
  border: 1px solid #e2e3e7; border-radius: 9px; background: #fff; cursor: pointer;
  font-size: 12px; color: var(--dsw-alias-label-primary, #1f2328);
  box-shadow: 0 2px 6px rgba(15, 23, 42, .06); transition: transform .12s ease, border-color .12s ease;
}
.dsh-tf-pet-btn:hover { transform: translateY(-1px); border-color: #d0d3d9; }
.dsh-tf-pet-btn:active { transform: scale(.96); }
.dsh-tf-pet-btn-num { font-size: 11px; color: #8a8f98; }
.dsh-tf-pet-meta {
  position: absolute; right: 0; bottom: -12px; display: flex; gap: 4px; align-items: center;
  pointer-events: auto; white-space: nowrap;
}
.dsh-tf-pet-level {
  font-size: 10px; font-weight: 600; color: #8a8f98; letter-spacing: .02em;
}
.dsh-tf-pet-badge {
  height: 16px; padding: 0 5px; border-radius: 5px; font-size: 10px; line-height: 16px;
  background: #fff4e0; color: #a86b12; border: 1px solid #f3dcb4; white-space: nowrap;
}
.dsh-tf-pet-badge.is-new { animation: dsh-tf-badge-pop .5s ease-out; }
@keyframes dsh-tf-badge-pop {
  0% { transform: scale(.6); opacity: 0; }
  60% { transform: scale(1.12); }
  100% { transform: scale(1); opacity: 1; }
}
.dsh-tf-pet-hearts { position: absolute; right: 26px; bottom: 40px; pointer-events: none; }
.dsh-tf-pet-hearts i {
  position: absolute; right: 0; bottom: 0; opacity: 0;
  animation: dsh-tf-heart 1.5s ease-out forwards;
}
@keyframes dsh-tf-heart {
  0% { transform: translate(0, 0) scale(.7); opacity: 0; }
  18% { opacity: 1; }
  100% { transform: translate(var(--dx, -6px), -52px) scale(1.1); opacity: 0; }
}
.dsh-tf-row {
  display: flex; align-items: flex-start; gap: 10px; padding: 7px 10px; min-height: 36px;
  border-radius: 8px; transition: background .12s ease;
}
.dsh-tf-row:hover { background: color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent); }
.dsh-tf-index {
  flex: none; width: 22px; text-align: right;
  font-size: 13px; line-height: 24px; font-weight: 500; color: var(--dsw-alias-label-secondary);
  font-variant-numeric: tabular-nums;
}
.dsh-tf-index.is-work { color: var(--dsh-tf-work); }
.dsh-tf-index.is-life { color: var(--dsw-alias-state-success-primary); }
.dsh-tf-main { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
.dsh-tf-text { font-size: 14.5px; line-height: 1.45; font-weight: 600; letter-spacing: -.005em; word-break: break-word; }
.dsh-tf-due {
  display: inline-block; margin-left: 8px; padding: 0 7px; border-radius: 6px;
  font-size: 12.5px; line-height: 19px; vertical-align: 1px; font-variant-numeric: tabular-nums;
  border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-1); white-space: nowrap;
}
.dsh-tf-due.is-soon { color: var(--dsh-tf-work); border-color: color-mix(in srgb, var(--dsh-tf-work) 38%, transparent); background: color-mix(in srgb, var(--dsh-tf-work) 9%, transparent); }
.dsh-tf-due.is-today { color: #a45a00; border-color: color-mix(in srgb, #d97706 45%, transparent); background: color-mix(in srgb, #d97706 12%, transparent); }
.dsh-tf-due.is-overdue { color: var(--dsw-alias-state-error-primary); border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, transparent); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent); }
.dsh-tf-search { flex: 1; min-width: 0; height: 30px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1); background: transparent; color: inherit; font: inherit; font-size: 13px; outline: none; }
.dsh-tf-quickfilter { height: 30px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1); background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 13px; cursor: pointer; }
.dsh-tf-quickfilter.is-on { border-color: var(--dsw-tf-work); color: var(--dsw-tf-work); background: color-mix(in srgb, var(--dsw-tf-work) 12%, transparent); }
.dsh-tf-edit { width: 100%; min-width: 0; height: 28px; padding: 0 8px; border-radius: 6px; border: 1px solid var(--dsw-tf-work); background: var(--dsw-alias-bg-base); color: inherit; font: inherit; font-size: 15px; outline: none; }
.dsh-tf-dateinput { height: 26px; padding: 0 6px; border-radius: 6px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-base); color: inherit; font: inherit; font-size: 12px; }
.dsh-tf-duepop { display: flex; align-items: center; gap: 4px; margin-top: 4px; padding: 4px; border-radius: 8px; background: var(--dsw-alias-bg-layer-2); }
.dsh-tf-quickset { height: 24px; padding: 0 8px; border-radius: 6px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer; }
.dsh-tf-quickset:hover { border-color: var(--dsw-tf-work); color: var(--dsw-tf-work); }
.dsh-tf-quickset.is-quiet { border-color: transparent; background: transparent; color: var(--dsw-alias-label-secondary); }
.dsh-tf-rec { display: inline-block; margin-left: 8px; padding: 0 6px; border-radius: 5px; font-size: 11.5px; line-height: 17px; cursor: pointer; color: #8b5cf6; border: 1px solid rgba(139,92,246,.45); background: rgba(139,92,246,.1); }
.dsh-tf-tag { display: inline-block; margin-left: 6px; padding: 0 6px; border-radius: 5px; font-size: 11.5px; line-height: 17px; cursor: pointer; color: var(--dsw-alias-label-secondary); border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); }
.dsh-tf-tag:hover { color: var(--dsw-tf-work); border-color: var(--dsw-tf-work); }
.dsh-tf-tagfilter { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 8px; }
.dsh-tf-child { padding-left: 26px; }
.dsh-tf-child .dsh-tf-row { font-size: 14px; }
.dsh-tf-childadd { padding: 2px 0 4px 26px; }
.dsh-tf-toolbar { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
.dsh-tf-group { display: contents; }
.dsh-tf-searchbtn { flex: none; display: grid; place-items: center; width: 30px; height: 30px; padding: 0; border-radius: 8px; border: 0; background: transparent; color: var(--dsw-alias-label-secondary); font-size: 14px; line-height: 1; cursor: pointer; transition: background .15s ease, color .15s ease; }
.dsh-tf-searchbtn:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.dsh-tf-searchbtn { margin-left: auto; }
.dsh-tf-trashbtn { display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 13px; margin-left: auto; border-radius: 10px; border: 1px solid var(--dsw-alias-border-l1); background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 14px; cursor: pointer; transition: border-color .12s ease, color .12s ease; }
.dsh-tf-trashbtn:hover { border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
.dsh-tf-trashbtn.is-on { border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent); }
.dsh-tf-trashbtn-count { font-variant-numeric: tabular-nums; font-weight: 600; font-size: 14px; }
.dsh-tf-trashbtn svg { display: block; }
.dsh-tf-updatebtn { display: inline-flex; align-items: center; gap: 4px; height: 22px; padding: 0 9px; border-radius: 999px; border: 1px solid var(--dsw-tf-work); background: transparent; color: var(--dsw-tf-work); font: inherit; font-size: 12px; font-weight: 600; line-height: 1; cursor: pointer; transition: background .15s ease; }
.dsh-tf-updatebtn:hover { background: color-mix(in srgb, var(--dsw-tf-work) 12%, transparent); }
.dsh-tf-updatebtn:disabled { opacity: .7; cursor: default; }
.dsh-tf-searchbtn:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.dsh-tf-toolbar .dsh-tf-search { flex: 1; min-width: 0; height: 30px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); color: inherit; font: inherit; font-size: 13px; outline: none; transition: border-color .18s ease, background .18s ease; }
.dsh-tf-toolbar .dsh-tf-search:focus { border-color: var(--dsw-tf-work); background: var(--dsw-alias-bg-base); }
.dsh-tf-row { border-radius: 8px; transition: background .15s ease; }
.dsh-tf-row:hover { background: color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent); }
.dsh-tf-row:active { transform: translateY(1px); }
.dsh-tf-undo { position: sticky; bottom: 0; display: flex; align-items: center; gap: 10px; margin-top: 8px; padding: 9px 12px; border-radius: 10px; background: var(--dsw-alias-label-primary); color: var(--dsw-alias-bg-base); font-size: 13px; }
.dsh-tf-datarow { display: flex; align-items: center; gap: 12px; padding: 0 2px 8px; }
.dsh-tf-datarow-hint { flex: 1; min-width: 0; font-size: 12px; color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-tf-row.is-done .dsh-tf-due { opacity: .6; }
.dsh-tf-row.is-done .dsh-tf-text { color: var(--dsw-alias-label-secondary); text-decoration: line-through; text-decoration-thickness: 1px; }
.dsh-tf-check {
  flex: none; width: 19px; height: 19px; margin-top: 3px; padding: 0; border-radius: 6px;
  border: 1.5px solid var(--dsw-alias-border-l2); background: transparent; color: transparent;
  display: grid; place-items: center; cursor: pointer;
  transition: background .15s ease, border-color .15s ease, color .15s ease;
}
.dsh-tf-check:hover { border-color: var(--dsw-alias-brand-primary); }
.dsh-tf-check[aria-checked="true"] { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); color: #fff; }
.dsh-tf-check:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dsh-tf-actions { display: flex; gap: 2px; flex: none; }
.dsh-tf-icon-btn {
  width: 30px; height: 30px; padding: 0; border: 0; border-radius: 8px; background: transparent;
  color: var(--dsw-alias-label-secondary); display: grid; place-items: center; cursor: pointer;
  opacity: 0; transition: opacity .12s ease, background .12s ease, color .12s ease;
}
.dsh-tf-emoji { font-size: 16px; line-height: 1; }
.dsh-tf-row:hover .dsh-tf-icon-btn { opacity: 1; }
.dsh-tf-icon-btn:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.dsh-tf-icon-btn:focus-visible { opacity: 1; outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.dsh-tf-icon-btn.is-visible { opacity: 1; }
.dsh-tf-empty {
  margin-top: 12px; padding: 32px 18px; border-radius: 12px; text-align: center;
  border: 1px dashed var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary);
  font-size: 14px; line-height: 1.9;
}
.dsh-tf-empty strong { display: block; color: var(--dsw-alias-label-primary); font-size: 15px; font-weight: 600; margin-bottom: 2px; }
.dsh-tf-btn {
  height: 30px; padding: 0 11px; border-radius: 8px; border: 1px solid transparent;
  background: transparent; color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 14px; cursor: pointer; flex: none;
  transition: background .15s ease, color .15s ease;
}
.dsh-tf-btn:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.dsh-tf-btn.is-solid {
  display: inline-flex; align-items: center; gap: 6px;
  height: 28px; padding: 0 12px; border-radius: 8px; font-weight: 500;
  background: var(--dsw-alias-label-primary); color: var(--dsw-alias-bg-base);
}
.dsh-tf-btn.is-solid:hover { background: var(--dsw-alias-label-primary); color: var(--dsw-alias-bg-base); opacity: .86; }
.dsh-tf-foot { flex: none; padding: 8px 22px 12px; border-top: 1px solid var(--dsw-alias-border-l1); }
.dsh-tf-composer {
  display: flex; align-items: center; gap: 6px; padding: 4px 4px 4px 11px;
  border-radius: 10px; border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  transition: border-color .15s ease, box-shadow .15s ease;
}
.dsh-tf-composer:hover { border-color: var(--dsw-alias-border-l2); }
.dsh-tf-composer:focus-within { border-color: var(--dsw-alias-brand-primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent); }
.dsh-tf-say {
  flex: 1; min-width: 0; height: 30px; max-height: 96px; padding: 5px 0; border: 0; outline: none;
  background: transparent; color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 13.5px; line-height: 1.45; resize: none; overflow-y: auto;
}
.dsh-tf-say::placeholder { color: var(--dsw-alias-label-secondary); }
.dsh-tf-send {
  width: 30px; height: 30px; flex: none; padding: 0; border: 0; border-radius: 9px;
  background: var(--dsw-alias-brand-primary); color: #fff; display: grid; place-items: center;
  cursor: pointer; transition: opacity .15s ease, filter .15s ease;
}
.dsh-tf-send:hover { filter: brightness(1.08); }
.dsh-tf-send:disabled { opacity: .4; cursor: default; filter: none; }
.dsh-tf-sayhint {
  display: flex; align-items: center; gap: 10px; min-height: 17px; margin-top: 6px;
  font-size: 13px; line-height: 1.5; color: var(--dsw-alias-label-secondary);
}
.dsh-tf-sayhint-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-tf-sayhint.is-error .dsh-tf-sayhint-text { color: var(--dsw-alias-state-error-primary); }
.dsh-tf-linkbtn {
  flex: none; padding: 0; border: 0; background: transparent; cursor: pointer;
  font: inherit; font-size: 13px; color: var(--dsw-alias-brand-primary);
}
.dsh-tf-linkbtn:hover { text-decoration: underline; }
`

    // -------------------------------------------------------------- helpers

    /**
     * Turn one thrown value into a line of text.
     * @param error - the thrown value.
     */
    function messageOf(error) {
      if (!error) return 'unknown error'
      if (typeof error === 'string') return error
      return typeof error.message === 'string' && error.message ? error.message : String(error)
    }

    /**
     * Last path segment, tolerant of both separators and a trailing separator.
     * @param target - absolute path.
     */
    function baseName(target) {
      const text = String(target || '').replace(/[\\/]+$/, '')
      const parts = text.split(/[\\/]/)
      return parts[parts.length - 1] || text
    }

    /**
     * Where the panel's HTTP endpoint lives for this page.
     * @returns an absolute URL, or a bare relative path when the page has no http origin.
     */
    function endpointUrl() {
      const transport = typeof window !== 'undefined' ? window.__DSH_TRANSPORT__ : null
      const base = transport && typeof transport === 'object' ? transport.fetchBaseUrl || transport.baseUrl : ''
      if (base) {
        try {
          return new URL(ENDPOINT, new URL(base).origin).href
        } catch {
          // fall through to the page origin
        }
      }
      if (typeof location !== 'undefined' && /^https?:$/.test(location.protocol)) {
        return new URL(ENDPOINT, location.origin).href
      }
      // A `file://` window cannot address the listener by origin. The desktop shell forwards bare
      // relative paths to its Host, which is the same shape the client's own RPC uses.
      return ENDPOINT.slice(1)
    }

    /**
     * Call one host operation. The operation rides the query string so the request needs no body.
     * @param op - operation name.
     * @param payload - operation arguments.
     */
    async function call(op, payload) {
      const base = endpointUrl()
      const query = `op=${encodeURIComponent(op)}&args=${encodeURIComponent(JSON.stringify(payload || {}))}&key=${encodeURIComponent(PANEL_KEY)}&v=${encodeURIComponent(CLIENT_REV)}&l=${encodeURIComponent(i18nRuntime ? activeLocale(i18nRuntime) : 'en')}`
      const url = base.includes('?') ? `${base}&${query}` : `${base}?${query}`
      const controller = typeof AbortController === 'function' ? new AbortController() : null
      const timer = controller ? window.setTimeout(() => controller.abort(), 15000) : null
      let response
      try {
        response = await fetch(url, {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          signal: controller ? controller.signal : undefined,
        })
      } catch (error) {
        const aborted = !!error && (error.name === 'AbortError' || error.name === 'TimeoutError')
        throw new Error(aborted ? `接口 15 秒没有响应：${ENDPOINT}` : messageOf(error))
      } finally {
        if (timer) window.clearTimeout(timer)
      }
      const raw = await response.text()
      let decoded = null
      try {
        decoded = raw ? JSON.parse(raw) : null
      } catch {
        decoded = null
      }
      if (!response.ok || !decoded || decoded.ok !== true) {
        const reason = decoded && typeof decoded.error === 'string' ? decoded.error : null
        if (reason) throw new Error(reason)
        throw new Error(
          decoded === null ? `接口返回的不是 JSON（HTTP ${response.status}）：${ENDPOINT}` : `HTTP ${response.status}`,
        )
      }
      return decoded.value
    }

    /**
     * Turn a `YYYY-MM-DD` deadline into the short label the row shows.
     * @param due - stored due date.
     * @param t - translator.
     * @returns `{ text, tone }`, or null when there is no usable date.
     */
    function dueChip(due, t) {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(due || ''))
      if (!match) return null
      const month = Number(match[2])
      const day = Number(match[3])
      const target = new Date(Number(match[1]), month - 1, day)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const days = Math.round((target.getTime() - today.getTime()) / 86400000)
      const text = days === 0 ? t('due.today') : days === 1 ? t('due.tomorrow') : `${month}/${day}`
      const tone = days < 0 ? 'overdue' : days === 0 ? 'today' : days <= 2 ? 'soon' : 'later'
      return { text, tone }
    }

    /**
     * The folder that holds one path: a file's parent directory, or a drive root for a top-level file.
     * @param target - absolute path on this computer.
     */
    function parentFolder(target) {
      const text = String(target || '').replace(/[\\/]+$/, '')
      const cut = text.replace(/[\\/][^\\/]+$/, '')
      if (!cut) return text
      return /^[A-Za-z]:$/.test(cut) ? `${cut}\\` : cut
    }

    /** Context captured by `createI18n`, so transport calls can report the resolved language. */
    let i18nRuntime = null

    /**
     * The language to render in, resolved at call time.
     *
     * The locale service may not be mounted when this plugin applies, so it is looked up on every
     * call and the page language stands in before English.
     * @param ctx - the plugin context.
     */
    function activeLocale(ctx) {
      try {
        const locale = typeof ctx.get === 'function' ? ctx.get('locale') : undefined
        const snapshot = locale && typeof locale.getLocale === 'function' ? locale.getLocale() : null
        if (snapshot && typeof snapshot.active === 'string' && snapshot.active) return snapshot.active
      } catch {
        // fall through to the page language
      }
      try {
        if (typeof navigator !== 'undefined' && typeof navigator.language === 'string' && navigator.language) {
          return navigator.language
        }
      } catch {
        // fall through to English
      }
      return 'en'
    }

    /**
     * Hand components a translate function that follows the active locale, and let them re-render
     * when it changes.
     * @param ctx - the plugin context.
     */
    function createI18n(ctx) {
      i18nRuntime = ctx
      const listeners = new Set()
      const translate = (key, vars) => {
        const dict = String(activeLocale(ctx)).toLowerCase().indexOf('zh') === 0 ? ZH : EN
        let text = dict[key] != null ? dict[key] : EN[key] != null ? EN[key] : key
        if (vars) {
          for (const name of Object.keys(vars)) text = text.split(`{${name}}`).join(String(vars[name]))
        }
        return text
      }
      const follow = (locale) => {
        if (!locale || typeof locale.subscribe !== 'function') return undefined
        return ctx.effect(() => {
          const off = locale.subscribe(() => listeners.forEach((fn) => fn()))
          return () => {
            try {
              off()
            } catch {
              // a disposed locale service needs no cleanup
            }
          }
        })
      }
      const immediate = typeof ctx.get === 'function' ? ctx.get('locale') : undefined
      if (immediate) follow(immediate)
      else if (typeof ctx.inject === 'function') ctx.inject(['locale'], (inner) => follow(inner.locale))
      return {
        t: translate,
        subscribe(fn) {
          listeners.add(fn)
          return () => listeners.delete(fn)
        },
      }
    }

    /**
     * Re-render when the active locale changes.
     * @param i18n - the translator created in `apply`.
     */
    function useTranslate(i18n) {
      const [, bump] = useState(0)
      useEffect(() => i18n.subscribe(() => bump((value) => value + 1)), [i18n])
      return i18n.t
    }

    /**
     * Bridge to the agent: remembers the Session the Conversation is showing (so a file link can
     * return there) and sends the composer's sentences into one dedicated "待办" conversation.
     *
     * The composer never addresses the Session the user happens to be in: its first message creates
     * a dedicated todo conversation, the id is anchored in this browser, and every later message
     * reuses it (an archived anchor is revived; a deleted one gets a fresh conversation).
     * @param ctx - the plugin context.
     * @param i18n - the translator created in `apply`.
     */
    function createBridge(ctx, i18n) {
      let lastSessionId = null
      /** Where this browser remembers the dedicated todo conversation. */
      const TODO_SESSION_KEY = 'dsh-tf-todo-session-v1'
      const TODO_SESSION_TITLE = '待办'
      // The panel's own inject list only declares 'slots', so a plain ctx.get() cannot see
      // sessions/uiWorkspace. Late-inject them here: the bridge degrades to "unavailable"
      // if the harness ever stops offering them, but sending works whenever they exist.
      let late = {}
      try {
        ctx.inject(['sessions', 'uiWorkspace'], (inner) => {
          late = { sessions: inner.sessions, uiWorkspace: inner.uiWorkspace }
        })
      } catch {
        // an environment without late injection keeps the ctx.get() path below
      }
      const service = (name) => {
        if (late && late[name]) return late[name]
        return typeof ctx.get === 'function' ? ctx.get(name) : undefined
      }

      /** Read the anchored dedicated conversation id from this browser. */
      const readTodoAnchor = () => {
        try {
          return typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem(TODO_SESSION_KEY) || '' : ''
        } catch {
          return ''
        }
      }

      /** Remember which conversation is the dedicated one. */
      const writeTodoAnchor = (sessionId) => {
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(TODO_SESSION_KEY, String(sessionId))
          }
        } catch {
          // a blocked store keeps the anchor for this page only
        }
      }

      /** Whether one session id is still on the visible (unarchived) list. */
      const listedSession = (sessionId) => {
        try {
          const sessions = service('sessions')
          const snapshot = sessions && sessions.list ? sessions.list.getSnapshot() : null
          return !!(snapshot && Array.isArray(snapshot.ids) && snapshot.ids.includes(sessionId))
        } catch {
          return false
        }
      }
      return {
        remember(sessionId) {
          if (typeof sessionId === 'string' && sessionId) lastSessionId = sessionId
        },
        sessionId() {
          return lastSessionId
        },
        /**
         * Resolve the dedicated todo conversation: the anchored one when it still exists, a fresh
         * one otherwise. The anchor lives in localStorage, so the same conversation serves the
         * panel across reloads and restarts.
         * @returns the session id, or '' when this environment cannot create sessions.
         */
        async ensureTodoSession() {
          const sessions = service('sessions')
          const ui = service('uiWorkspace')
          const workspaces = service('workspaces')
          const anchored = readTodoAnchor()
          if (anchored) {
            if (listedSession(anchored)) return anchored
            // Off the visible list: archived, or deleted. Reviving proves it still exists.
            if (workspaces && typeof workspaces.unarchiveSession === 'function') {
              const revived = await Promise.resolve(workspaces.unarchiveSession(anchored)).then(
                () => true,
                () => false,
              )
              if (revived) return anchored
            }
          }
          let created = ''
          if (sessions && typeof sessions.create === 'function') {
            try {
              created = await sessions.create({})
            } catch (error) {
              if (typeof console !== 'undefined' && console.error) {
                console.error('[todo-files] could not create the todo conversation', error)
              }
            }
          }
          if (!created && ui && typeof ui.connectWorkspace === 'function') {
            try {
              created = await ui.connectWorkspace(undefined, {})
            } catch (error) {
              if (typeof console !== 'undefined' && console.error) {
                console.error('[todo-files] connectWorkspace failed', error)
              }
            }
          }
          if (!created) return ''
          writeTodoAnchor(created)
          this.renameTodoSession(created)
          return created
        },

        /**
         * Give the dedicated conversation its stable title. Cosmetic: a failure must never block
         * a send, and the anchor above already guarantees reuse.
         * @param sessionId - the dedicated conversation.
         */
        async renameTodoSession(sessionId) {
          const sessions = service('sessions')
          if (!sessionId || !sessions || typeof sessions.retain !== 'function') return
          try {
            const reference = sessions.retain(sessionId, { source: 'controllerOperation' })
            try {
              const binding = await Promise.race([
                reference.ready,
                new Promise((_, reject) => {
                  window.setTimeout(() => reject(new Error('rename timeout')), 8000)
                }),
              ])
              const session = binding && binding.session
              if (session && typeof session.rename === 'function') await session.rename(TODO_SESSION_TITLE)
            } finally {
              try {
                reference.release()
              } catch {
                // a reference released twice is harmless
              }
            }
          } catch (error) {
            if (typeof console !== 'undefined' && console.error) {
              console.error('[todo-files] could not name the todo conversation', error)
            }
          }
        },

        async send(text) {
          const sessions = service('sessions')
          // The composer's sentence is always treated as a todo operation: the dedicated
          // conversation must act on it right away instead of bouncing a question back at a
          // panel the user is looking at, not the conversation.
          const framed =
            '【待办面板】下面这句来自待办面板的输入条，请直接按待办处理：' +
            '要新增就用 personal_todos 工具立刻添加（不要反问任何确认问题，分类分不清就按 work，' +
            '截止日期换算成 YYYY-MM-DD 写进 due，不要写进 title）；' +
            '查询、勾完成、修改、清空等意图就按对应的 action 执行。\n' +
            text
          // The composer addresses the dedicated todo conversation, never the conversation the
          // user happens to be in. A failure here is reported, not rerouted elsewhere.
          const dedicated = await this.ensureTodoSession()
          if (dedicated && sessions && typeof sessions.retain === 'function') {
            const reference = sessions.retain(dedicated, { source: 'controllerOperation' })
            try {
              // A stale Session id can leave the open attempt pending forever, which used to
              // freeze the composer on "sending" for the rest of the page life. Bound it.
              const binding = await Promise.race([
                reference.ready,
                new Promise((_, reject) => {
                  window.setTimeout(() => reject(new Error(i18n.t('say.unavailable'))), 8000)
                }),
              ])
              const result = await binding.session.prompt([{ type: 'text', text: framed }], 'queue')
              if (result && result.ok === false) {
                const reason = result.error && result.error.message ? result.error.message : ''
                throw new Error(reason || i18n.t('say.unavailable'))
              }
              return { sessionId: dedicated }
            } catch (error) {
              if (typeof console !== 'undefined' && console.error) console.error('[todo-files] prompt failed', error)
              throw error
            } finally {
              try {
                reference.release()
              } catch {
                // a reference released twice is harmless
              }
            }
          }
          // Environments without session creation: the conversation currently open.
          if (sessions && typeof sessions.retain === 'function' && lastSessionId) {
            try {
              const reference = sessions.retain(lastSessionId, { source: 'controllerOperation' })
              try {
                const binding = await Promise.race([
                  reference.ready,
                  new Promise((_, reject) => {
                    window.setTimeout(() => reject(new Error(i18n.t('say.unavailable'))), 8000)
                  }),
                ])
                const result = await binding.session.prompt([{ type: 'text', text }], 'queue')
                if (result && result.ok === false) {
                  const reason = result.error && result.error.message ? result.error.message : ''
                  throw new Error(reason || i18n.t('say.unavailable'))
                }
                return { sessionId: lastSessionId }
              } finally {
                try {
                  reference.release()
                } catch {
                  // a reference released twice is harmless
                }
              }
            } catch (error) {
              if (typeof console !== 'undefined' && console.error) console.error('[todo-files] prompt failed', error)
            }
          }
          const ui = service('uiWorkspace')
          if (ui && typeof ui.startSession === 'function') {
            ui.startSession(undefined, { prompt: text, whenDraftExists: 'append' })
            return { sessionId: null, draft: true }
          }
          throw new Error(i18n.t('say.unavailable'))
        },
        open(sessionId) {
          const ui = service('uiWorkspace')
          if (ui && typeof ui.openSession === 'function') ui.openSession(sessionId)
        },
        /**
         * Open the conversation a todo came from, archived or not.
         *
         * An archived Session is hidden from the sidebar, so it is restored first and opened right
         * after — a link that only works while the conversation is unarchived is not a link. A live
         * Session makes the restore call a no-op; a refusal still opens what can be opened.
         * @param sessionId - the origin Session.
         */
        openLinked(sessionId) {
          if (!sessionId) return
          const ui = service('uiWorkspace')
          const sessions = service('sessions')
          const workspaces = service('workspaces')
          const go = () => {
            if (ui && typeof ui.openSession === 'function') ui.openSession(sessionId)
          }
          let live = false
          try {
            const snapshot = sessions && sessions.list ? sessions.list.getSnapshot() : null
            live = !!(snapshot && Array.isArray(snapshot.ids) && snapshot.ids.includes(sessionId))
          } catch {
            live = false
          }
          if (live || !workspaces || typeof workspaces.unarchiveSession !== 'function') {
            go()
            return
          }
          Promise.resolve(workspaces.unarchiveSession(sessionId)).then(go, go)
        },
        openChat() {
          const ui = service('uiWorkspace')
          if (!ui) return
          if (lastSessionId && typeof ui.openSession === 'function') {
            ui.openSession(lastSessionId)
            return
          }
          if (typeof ui.startSession === 'function') ui.startSession()
        },
        /**
         * Open the folder around one linked path — the "portal".
         *
         * A todo's link names a document; what the portal is for is the directory it lives in, so a
         * file opens its parent folder and a folder opens itself. The file manager is the only
         * surface that can show a path outside this Session's workspace, and because such a window
         * can appear behind the app, the caller reports where it went.
         * @param target - absolute path of the linked file or folder.
         * @param kind - `'dir'` opens the path itself; anything else opens its parent folder.
         * @returns the folder that was opened.
         */
        async openPath(target, kind) {
          const path = String(target || '')
          if (!path) return { folder: '' }
          const folder = kind === 'dir' ? path : parentFolder(path)
          await call('fs.reveal', { path: folder })
          return { folder }
        },
      }
    }

    // ---------------------------------------------------------------- icons

    const stroke = {
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.7,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }

    function IconCheck(props) {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: props.size || 11, height: props.size || 11, 'aria-hidden': true },
        h('path', { ...stroke, strokeWidth: 2.2, d: 'M3.2 8.6 6.2 11.6 12.8 4.6' }),
      )
    }

    function IconRefresh(props) {
      const size = props.size || 14
      return h(
        'svg',
        { viewBox: '0 0 20 20', width: size, height: size, 'aria-hidden': true },
        h('path', { ...stroke, d: 'M16.2 9.3a6.3 6.3 0 1 1-1.9-4.2' }),
        h('path', { ...stroke, d: 'M16.4 3.4v4.4h-4.4' }),
      )
    }

    function IconTrash(props) {
      const size = props.size || 14
      return h(
        'svg',
        { viewBox: '0 0 20 20', width: size, height: size, 'aria-hidden': true },
        h('path', { ...stroke, d: 'M3.8 5.6h12.4' }),
        h('path', { ...stroke, d: 'M8 5.4V3.9c0-.5.4-.9.9-.9h2.2c.5 0 .9.4.9.9v1.5' }),
        h('path', { ...stroke, d: 'M5.6 5.8l.7 10c0 .5.5.9 1 .9h5.4c.5 0 1-.4 1-.9l.7-10' }),
      )
    }

    function IconSend(props) {
      const size = props.size || 15
      return h(
        'svg',
        { viewBox: '0 0 20 20', width: size, height: size, 'aria-hidden': true },
        h('path', { ...stroke, strokeWidth: 2, d: 'M10 15.2V5.4' }),
        h('path', { ...stroke, strokeWidth: 2, d: 'M5.4 9.8 10 5.2l4.6 4.6' }),
      )
    }

    /** The sidebar glyph: a checklist card. */
    function PanelGlyph(props) {
      const size = props.size || 18
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          'aria-hidden': true,
          style: { display: 'block' },
        },
        h('rect', {
          x: 3.2,
          y: 3.4,
          width: 17.6,
          height: 17.2,
          rx: 4.2,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          opacity: props.active ? 0.95 : 0.85,
        }),
        h('path', { ...stroke, strokeWidth: 1.9, d: 'M7.2 8.5 8.6 9.9 11.4 7.1' }),
        h('path', { ...stroke, strokeWidth: 1.9, d: 'M7.2 14.4 8.6 15.8 11.4 13' }),
        h('path', { ...stroke, d: 'M13.9 8.6h3.4M13.9 14.5h3.4' }),
      )
    }

    // ---------------------------------------------------------------- panel

    /**
     * One todo row.
     * @param props - `{ item, t, index, onToggle, onRemove, onPortal, onOpenConversation }`.
     */
    function TodoRow(props) {
      const { item, t } = props
      const category = item.category === 'life' ? 'life' : 'work'
      const due = dueChip(item.due, t)
      return h(
        'div',
        { className: `dsh-tf-row is-${category}${item.done ? ' is-done' : ''}` },
        props.index > 0 ? h('span', { className: `dsh-tf-index is-${category}` }, props.index) : null,
        h(
          'button',
          {
            type: 'button',
            className: 'dsh-tf-check',
            role: 'checkbox',
            'aria-checked': item.done,
            'aria-label': item.done ? t('todo.markOpen') : t('todo.markDone'),
            title: item.done ? t('todo.markOpen') : t('todo.markDone'),
            onClick: () => props.onToggle(item),
          },
          item.done ? h(IconCheck, { size: 11 }) : null,
        ),
        h(
          'div',
          { className: 'dsh-tf-main' },
          props.editing
            ? h('input', {
                className: 'dsh-tf-edit',
                autoFocus: true,
                value: props.editText,
                onChange: (event) => props.onEditChange(event.target.value),
                onKeyDown: (event) => {
                  if (event.key === 'Enter') props.onSaveEdit(item)
                  if (event.key === 'Escape') props.onCancelEdit()
                },
                onBlur: () => props.onSaveEdit(item),
              })
            : h(
                'div',
                { className: 'dsh-tf-text', onDoubleClick: () => props.onStartEdit(item), title: '双击改标题' },
                item.title,
                item.recurring
                  ? h(
                      'span',
                      {
                        className: 'dsh-tf-rec',
                        title: '点一下换重复规则',
                        onClick: (event) => {
                          event.stopPropagation()
                          props.onCycleRecurring(item)
                        },
                      },
                      item.recurring.freq === 'daily' ? '每天' : item.recurring.freq === 'weekly' ? '每周' : '每月',
                    )
                  : null,
                (item.tags || []).map((tag) =>
                  h(
                    'span',
                    {
                      className: 'dsh-tf-tag',
                      key: tag,
                      onClick: (event) => {
                        event.stopPropagation()
                        props.onTagClick(tag)
                      },
                    },
                    tag,
                  ),
                ),
                props.dueEditing
                  ? h(
                      'div',
                      { className: 'dsh-tf-duepop' },
                      h('button', { type: 'button', className: 'dsh-tf-quickset', onClick: () => props.onQuickDue(item, 0) }, '今天'),
                      h('button', { type: 'button', className: 'dsh-tf-quickset', onClick: () => props.onQuickDue(item, 1) }, '明天'),
                      h('button', { type: 'button', className: 'dsh-tf-quickset', onClick: () => props.onQuickDue(item, 7) }, '一周后'),
                      h('input', {
                        type: 'date',
                        className: 'dsh-tf-dateinput',
                        autoFocus: true,
                        defaultValue: item.due || '',
                        onChange: (event) => props.onSaveDue(item, event.target.value),
                      }),
                      item.due
                        ? h('button', { type: 'button', className: 'dsh-tf-quickset is-quiet', onClick: () => props.onSaveDue(item, '') }, '清除')
                        : null,
                      h('button', { type: 'button', className: 'dsh-tf-quickset is-quiet', onClick: () => props.onCancelDue() }, '取消'),
                    )
                  : due
                    ? h('span', { className: `dsh-tf-due is-${due.tone}`, title: '点一下改日期', onClick: () => props.onStartDue(item) }, due.text)
                    : null,
              ),
        ),
        h(
          'div',
          { className: 'dsh-tf-actions' },
          item.due
            ? null
            : h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-tf-icon-btn',
                  title: '设置截止日期',
                  'aria-label': '设置截止日期',
                  onClick: () => props.onStartDue(item),
                },
                h('span', { className: 'dsh-tf-emoji', 'aria-hidden': true }, '📅'),
              ),
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-tf-icon-btn',
              title: '加子任务',
              'aria-label': '加子任务',
              onClick: () => props.onAddChild(item),
            },
            h('span', { className: 'dsh-tf-emoji', 'aria-hidden': true }, '＋'),
          ),
          item.origin && item.origin.sessionId
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-tf-icon-btn is-visible',
                  title: t('todo.openConversation'),
                  'aria-label': t('todo.openConversation'),
                  onClick: () => props.onOpenConversation(item),
                },
                h('span', { className: 'dsh-tf-emoji', 'aria-hidden': true }, '🔗'),
              )
            : null,
          item.link
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-tf-icon-btn is-visible',
                  title: `${t('todo.openTarget')} · ${item.link.path}`,
                  'aria-label': t('todo.openTarget'),
                  onClick: () => props.onPortal(item),
                },
                h('span', { className: 'dsh-tf-emoji', 'aria-hidden': true }, '🌀'),
              )
            : null,
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-tf-icon-btn',
              title: t('todo.remove'),
              'aria-label': t('todo.remove'),
              onClick: () => props.onRemove(item),
            },
            h(IconTrash, { size: 14 }),
          ),
        ),
      )
    }

    /**
     * Records the Session the Conversation is showing, so the panel can address it.
     * Renders nothing; it exists only for its props.
     * @param props - `{ sessionId, bridge }`.
     */
    function SessionProbe(props) {
      const sessionId = props && props.sessionId
      const bridge = props && props.bridge
      useEffect(() => {
        if (bridge && typeof sessionId === 'string' && sessionId) bridge.remember(sessionId)
      }, [bridge, sessionId])
      return null
    }

    /**
     * The panel: the todo list, a refresh control, and the "say it to DSH" composer.
     * @param props - `{ i18n, bridge }` plus the slot's standard props.
     */
    function Panel(props) {
      const i18n = props.i18n
      const t = useTranslate(i18n)
      const bridge = props.bridge
      const [items, setItems] = useState([])
      const [trashCount, setTrashCount] = useState(0)
      const [updateInfo, setUpdateInfo] = useState(null)
      const [updating, setUpdating] = useState(false)
      const [busy, setBusy] = useState(true)
      const [error, setError] = useState('')
      const [notice, setNotice] = useState('')
      const [showDone, setShowDone] = useState(false)
      const [say, setSay] = useState('')
      const [sendState, setSendState] = useState(null)
      const [scope, setScope] = useState('all')

      const loadTodos = useCallback(async (silent) => {
        if (!silent) setBusy(true)
        try {
          const value = await call('todos.list', {})
          setItems(Array.isArray(value.items) ? value.items : [])
          setTrashCount(Number(value.trashCount) || 0)
          if (value.update) setUpdateInfo(value.update)
          setError('')
        } catch (failure) {
          if (!silent) setError(messageOf(failure))
        } finally {
          if (!silent) setBusy(false)
        }
      }, [])

      useEffect(() => {
        loadTodos()
      }, [loadTodos])

      // Ask once per page load whether the published repository is ahead of this install.
      useEffect(() => {
        let alive = true
        call('update.check')
          .then((value) => {
            if (alive) setUpdateInfo(value)
          })
          .catch(() => {})
        return () => {
          alive = false
        }
      }, [])

      /** Install the published version in place; a linked development copy never offers this. */
      const applyUpdate = async () => {
        if (updating) return
        setUpdating(true)
        try {
          const value = await call('update.apply', {}, 300000)
          setUpdateInfo((current) => ({ ...(current || {}), available: false }))
          setNotice(
            value.application === 'restart-required'
              ? `已安装 v${value.version || ''}，重启 DSH 后生效`
              : `已更新到 v${value.version || ''}`,
          )
          window.setTimeout(() => setNotice(''), 6000)
        } catch (failure) {
          setError(messageOf(failure))
        } finally {
          setUpdating(false)
        }
      }

      // Every click inside the list pulls the authoritative list again: DSH may have changed items
      // from the conversation, and a click is the moment the user expects the panel to be current.
      // Debounced so one action (a toggle also refreshes itself) costs one extra read.
      const refreshTimer = useRef(0)
      const refreshAfterClick = useCallback(() => {
        if (refreshTimer.current) window.clearTimeout(refreshTimer.current)
        refreshTimer.current = window.setTimeout(() => {
          refreshTimer.current = 0
          loadTodos(true)
        }, 300)
      }, [loadTodos])
      useEffect(
        () => () => {
          if (refreshTimer.current) window.clearTimeout(refreshTimer.current)
        },
        [],
      )

      // DSH changes the list from the conversation; keep the panel in step without a manual reload.
      useEffect(() => {
        const timer = window.setInterval(() => {
          if (typeof document !== 'undefined' && document.hidden) return
          loadTodos(true)
        }, 6000)
        return () => window.clearInterval(timer)
      }, [loadTodos])

      const [quickText, setQuickText] = useState('')
      const [query, setQuery] = useState('')
      const [quick, setQuick] = useState('all')
      const [editingId, setEditingId] = useState('')
      const [editText, setEditText] = useState('')
      const [dueEditingId, setDueEditingId] = useState('')
      const [undoItem, setUndoItem] = useState(null)
      const [tagFilter, setTagFilter] = useState('')
      const [searchOpen, setSearchOpen] = useState(false)
      const [childFor, setChildFor] = useState('')
      const [childText, setChildText] = useState('')
      const undoTimer = useRef(null)
      const todayKey = useMemo(() => {
        const date = new Date()
        date.setHours(0, 0, 0, 0)
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      }, [])
      // Monday..Sunday of the current week, as YYYY-MM-DD keys.
      const weekRange = useMemo(() => {
        const base = new Date()
        base.setHours(0, 0, 0, 0)
        const mondayOffset = (base.getDay() + 6) % 7
        const monday = new Date(base)
        monday.setDate(base.getDate() - mondayOffset)
        const sunday = new Date(monday)
        sunday.setDate(monday.getDate() + 6)
        const key = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0")
        return { start: key(monday), end: key(sunday) }
      }, [])
      const visibleItems = useMemo(() => {
        const needle = query.trim().toLowerCase()
        return items
          .filter((item) => (scope === 'all' ? true : (item.category === 'life' ? 'life' : 'work') === scope))
          .filter((item) => (tagFilter ? (item.tags || []).includes(tagFilter) : true))
          .filter((item) => (needle ? String(item.title || '').toLowerCase().includes(needle) : true))
          .filter((item) => {
            if (quick === 'today') return item.due === todayKey && !item.done
            if (quick === 'overdue') return Boolean(item.due) && item.due < todayKey && !item.done
            if (quick === 'week') return Boolean(item.due) && item.due >= weekRange.start && item.due <= weekRange.end
            return true
          })
      }, [items, scope, query, quick, todayKey, tagFilter, weekRange])
      const openItems = useMemo(() => visibleItems.filter((item) => !item.done), [visibleItems])
      const doneItems = useMemo(() => visibleItems.filter((item) => item.done), [visibleItems])
      const scopeCounts = useMemo(() => {
        const open = items.filter((item) => !item.done && !item.parentId)
        const work = open.filter((item) => item.category !== 'life').length
        return { all: open.length, work, life: open.length - work }
      }, [items])

      // Position-driven numbering: the host already orders open items before completed ones, so the
      // position in the visible list is the number the user sees (and can say out loud).
      const orderIndex = useMemo(() => {
        const map = new Map()
        visibleItems.forEach((item, position) => map.set(item.id, position + 1))
        return map
      }, [visibleItems])

      const toggleTodo = async (item) => {
        try {
          await call('todos.update', { id: item.id, patch: { done: !item.done } })
          await loadTodos(true)
        } catch (failure) {
          setError(messageOf(failure))
        }
      }

      /** Add straight from the list, inheriting the scope being viewed. */
      const quickAdd = async () => {
        const title = quickText.trim()
        if (!title) return
        try {
          await call('todos.add', { title, category: scope === 'life' ? 'life' : 'work' })
          setQuickText('')
          await loadTodos(true)
        } catch (failure) {
          setError(messageOf(failure))
        }
      }

      const startEdit = (item) => {
        setEditingId(item.id)
        setEditText(item.title)
      }

      const saveEdit = async (item) => {
        const title = editText.trim()
        setEditingId('')
        if (!title || title === item.title) return
        try {
          await call('todos.update', { id: item.id, patch: { title } })
          await loadTodos(true)
        } catch (failure) {
          setError(messageOf(failure))
        }
      }

      const saveDue = async (item, value) => {
        setDueEditingId('')
        if ((value || '') === (item.due || '')) return
        try {
          await call('todos.update', { id: item.id, patch: { due: value || '' } })
          await loadTodos(true)
        } catch (failure) {
          setError(messageOf(failure))
        }
      }

      /** Set a due date relative to today, in one click. */
      const quickSetDue = (item, offset) => {
        const date = new Date()
        date.setHours(0, 0, 0, 0)
        date.setDate(date.getDate() + Number(offset))
        const pad = (value) => String(value).padStart(2, '0')
        saveDue(item, `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`)
      }

      /** Hide at once, delete for real after five seconds unless undone. */
      const requestDelete = (item) => {
        setItems((current) => current.filter((entry) => entry.id !== item.id))
        setUndoItem(item)
        if (undoTimer.current) window.clearTimeout(undoTimer.current)
        undoTimer.current = window.setTimeout(async () => {
          setUndoItem(null)
          try {
            await call('todos.remove', { id: item.id })
          } catch {
            // already gone
          }
        }, 5000)
      }

      const undoDelete = () => {
        if (undoTimer.current) window.clearTimeout(undoTimer.current)
        const item = undoItem
        setUndoItem(null)
        if (item) {
          setItems((current) => [item, ...current])
          loadTodos(true)
        }
      }

      /** Cycle a todo through no-repeat → daily → weekly → monthly. */
      const cycleRecurring = async (item) => {
        const order = [null, { freq: 'daily' }, { freq: 'weekly' }, { freq: 'monthly' }]
        const current = item.recurring ? item.recurring.freq : ''
        const index = order.findIndex((entry) => (entry ? entry.freq : '') === current)
        const next = order[(index + 1) % order.length]
        try {
          await call('todos.update', { id: item.id, patch: { recurring: next } })
          await loadTodos(true)
        } catch (failure) {
          setError(messageOf(failure))
        }
      }

      /** Add a subtask under one todo. */
      const addChild = async (parent) => {
        const title = childText.trim()
        if (!title) return
        try {
          await call('todos.add', { title, parentId: parent.id, category: parent.category })
          setChildFor('')
          setChildText('')
          await loadTodos(true)
        } catch (failure) {
          setError(messageOf(failure))
        }
      }

      const fileInput = useRef(null)
      const quickInputRef = useRef(null)
      const searchRef = useRef(null)

      // "/" opens search; the box stays hidden until asked for, since searching is rare here.
      useEffect(() => {
        const onKey = (event) => {
          if (event.ctrlKey || event.metaKey || event.altKey) return
          const target = event.target
          const typing =
            target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
          if (typing) return
          if (event.key === '/') {
            event.preventDefault()
            setSearchOpen(true)
          }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [])
      const [showTrash, setShowTrash] = useState(false)
      const [trashItems, setTrashItems] = useState([])

      /** Load the trash and flip into it. */
      const toggleTrash = async () => {
        if (showTrash) {
          setShowTrash(false)
          return
        }
        try {
          const value = await call('todos.trash')
          setTrashItems(Array.isArray(value.items) ? value.items : [])
          setShowTrash(true)
        } catch (failure) {
          setError(messageOf(failure))
        }
      }

      const restoreTrash = async (id) => {
        try {
          await call('todos.restore', { id })
          const value = await call('todos.trash')
          setTrashItems(Array.isArray(value.items) ? value.items : [])
          await loadTodos(true)
        } catch (failure) {
          setError(messageOf(failure))
        }
      }

      const purgeTrash = async (id) => {
        try {
          await call('todos.purge', id ? { id } : {})
          const value = await call('todos.trash')
          setTrashItems(Array.isArray(value.items) ? value.items : [])
        } catch (failure) {
          setError(messageOf(failure))
        }
      }

      /** Download the whole list as a JSON file. */
      const exportTodos = async () => {
        try {
          const value = await call('todos.export')
          const stamp = new Date()
          const name = `todos-${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, '0')}${String(stamp.getDate()).padStart(2, '0')}-${String(stamp.getHours()).padStart(2, '0')}${String(stamp.getMinutes()).padStart(2, '0')}.json`
          const blob = new Blob([value.json], { type: 'application/json;charset=utf-8' })
          const url = URL.createObjectURL(blob)
          const anchor = document.createElement('a')
          anchor.href = url
          anchor.download = name
          document.body.appendChild(anchor)
          anchor.click()
          anchor.remove()
          URL.revokeObjectURL(url)
          setNotice(`已导出 ${value.count} 条到 ${name}`)
          window.setTimeout(() => setNotice(''), 3200)
        } catch (failure) {
          setError(messageOf(failure))
        }
      }

      /** Replace the list from a chosen file after one confirmation. */
      const importFile = async (event) => {
        const file = event.target.files && event.target.files[0]
        event.target.value = ''
        if (!file) return
        try {
          const text = await file.text()
          if (!window.confirm('导入会替换当前全部待办（原文件已留 .bak 备份），继续？')) return
          const value = await call('todos.import', { json: text })
          await loadTodos(true)
          setNotice(`已导入 ${value.imported} 条（替换 ${value.replaced} 条）`)
          window.setTimeout(() => setNotice(''), 4000)
        } catch (failure) {
          setError(messageOf(failure))
        }
      }

      const removeTodo = async (item) => {
        try {
          await call('todos.remove', { id: item.id })
          await loadTodos(true)
        } catch (failure) {
          setError(messageOf(failure))
        }
      }

      const clearDone = async () => {
        try {
          await call('todos.clearDone', {})
          await loadTodos(true)
        } catch (failure) {
          setError(messageOf(failure))
        }
      }

      /** The portal: open the folder that holds the linked file, or the linked folder itself. */
      const openPortalFor = async (item) => {
        if (!item || !item.link || !bridge) return
        try {
          const outcome = await bridge.openPath(item.link.path, item.link.kind)
          setNotice(t('portal.reveal', { name: outcome && outcome.folder ? outcome.folder : item.link.path }))
          window.setTimeout(() => setNotice(''), 6000)
        } catch (failure) {
          setError(messageOf(failure))
        }
      }

      /** The link: return to the conversation this todo was created from. */
      const openConversationFor = (item) => {
        const sessionId = item && item.origin && item.origin.sessionId
        if (!sessionId || !bridge) return
        bridge.openLinked(sessionId)
      }

      const sendMessage = async () => {
        const text = say.trim()
        if (!text) {
          setSendState({ status: 'error', error: t('say.empty') })
          return
        }
        if (sendState && sendState.status === 'sending') return
        if (!bridge) {
          setSendState({ status: 'error', error: t('say.unavailable') })
          return
        }
        setSendState({ status: 'sending', text })
        try {
          const outcome = await bridge.send(text)
          setSay('')
          setSendState(
            outcome && outcome.sessionId
              ? { status: 'sent', text, sessionId: outcome.sessionId }
              : { status: 'draft', text },
          )
          window.setTimeout(() => loadTodos(true), 1500)
        } catch (failure) {
          setSendState({ status: 'error', error: messageOf(failure) })
        }
      }

      const sayHint = () => {
        const status = sendState ? sendState.status : ''
        let text = t('say.hint')
        let action = null
        if (status === 'sending') text = t('say.sending')
        if (status === 'sent') {
          text = t('say.sent')
          action = sendState.sessionId
            ? h(
                'button',
                { type: 'button', className: 'dsh-tf-linkbtn', onClick: () => bridge && bridge.open(sendState.sessionId) },
                t('say.open'),
              )
            : null
        }
        if (status === 'draft') {
          text = t('say.draft')
          action = h(
            'button',
            { type: 'button', className: 'dsh-tf-linkbtn', onClick: () => bridge && bridge.openChat() },
            t('say.openChat'),
          )
        }
        if (status === 'error') text = sendState.error
        return h(
          'div',
          { className: `dsh-tf-sayhint${status === 'error' ? ' is-error' : ''}` },
          h('span', { className: 'dsh-tf-sayhint-text', title: text }, text),
          action,
        )
      }

      const row = (item, displayIndex) =>
        h(TodoRow, {
          key: item.id,
          item,
          t,
          index: typeof displayIndex === 'number' ? displayIndex : (orderIndex.get(item.id) || 0),
          editing: editingId === item.id,
          editText,
          dueEditing: dueEditingId === item.id,
          onToggle: toggleTodo,
          onRemove: requestDelete,
          onStartEdit: startEdit,
          onEditChange: setEditText,
          onSaveEdit: saveEdit,
          onCancelEdit: () => setEditingId(''),
          onStartDue: (entry) => setDueEditingId(entry.id),
          onSaveDue: saveDue,
          onQuickDue: quickSetDue,
          onCancelDue: () => setDueEditingId(''),
          onCycleRecurring: cycleRecurring,
          onTagClick: (tag) => setTagFilter((current) => (current === tag ? '' : tag)),
          onAddChild: (entry) => {
            setChildFor((current) => (current === entry.id ? '' : entry.id))
            setChildText('')
          },
          onPortal: openPortalFor,
          onOpenConversation: openConversationFor,
        })

      const scopeButton = (id, label, count) =>
        h(
          'button',
          {
            type: 'button',
            className: `dsh-tf-filter${scope === id ? ' is-active' : ''}`,
            'data-scope': id,
            'aria-pressed': scope === id,
            onClick: () => setScope(id),
          },
          label,
          count > 0 ? h('span', { className: 'dsh-tf-filter-count' }, count) : null,
        )

      // ------------------------------------------------------------ pet
      // A corgi lives in the panel. Frames are character grids (one char per pixel) so the
      // sprite stays crisp at any integer scale without shipping images.
      const PET_W = 44
      const PET_H = 40
      const PET_PALETTE = {
        '1': '#6B3F14', '2': '#F2A93B', '3': '#D98A28', '4': '#FFCB6B', '5': '#FFFDF7',
        '6': '#EFE4CE', '7': '#F2A0A0', '8': '#2A2118', '9': '#F7B0A8',
      }
      const PET_FRAMES = {
        idle: [
          "...........121................121...........",
          "..........12221..............12221..........",
          "..........12221......1.......12221..........",
          ".........122722111111211111.1227221.........",
          ".........12777212222222222211277721.........",
          "........1227722222222222222222777221........",
          "........1277222222222222222222277721........",
          ".......122222244444442222222222222221.......",
          ".......122224444444444422222222222221.......",
          "......13322444444444444422222222223331......",
          "......13224444444444444442222222222331......",
          ".......122244444444444442222222222231.......",
          ".......122224888444444422228882222231.......",
          ".......122228588844442222285888222231.......",
          "......1222228888822255522288888222221.......",
          ".......1222288888555555555888882222331......",
          ".......122222888555558555558882222231.......",
          ".......122222255555888885555522222231.......",
          "......1999222255555888885555522229991.......",
          ".....199999222555585585585555222999991......",
          "......1999222655555888885555562229991.......",
          ".......11112225555555555555552223311........",
          "...........12255555555555555522331..........",
          "............122555555555555522331...........",
          ".............1336555555555633331............",
          "............1222236666666333221.............",
          "...........122222222223222222221............",
          "..........122222222225222222222211111.......",
          "..........1222222255555552222222322221......",
          "..........12222225555555552222223222221.....",
          ".........1222222555555555552222222222231....",
          "..........1222225555555555522222332222331...",
          "..........122225555555555555222232222331....",
          "..........12222255555555555222223333331.....",
          "...........122225555555555522223311311......",
          "..........15555555555555555555551..1........",
          "..........15555555555555555555551...........",
          ".........1655555556225226555555561..........",
          "..........15555555333233355555551...........",
          "...........166666111113111666661............",
        ],
        blink: [
          "...........121................121...........",
          "..........12221..............12221..........",
          "..........12221......1.......12221..........",
          ".........122722111111211111.1227221.........",
          ".........12777212222222222211277721.........",
          "........1227722222222222222222777221........",
          "........1277222222222222222222277721........",
          ".......122222244444442222222222222221.......",
          ".......122224444444444422222222222221.......",
          "......13322444444444444422222222223331......",
          "......13224444444444444442222222222331......",
          ".......122244444444444442222222222231.......",
          ".......122224444444444422222222222231.......",
          ".......122222244444442222222222222231.......",
          "......1222228888822255522288888222221.......",
          ".......1222222222555555555222222222331......",
          ".......122222225555558555555222222231.......",
          ".......122222255555888885555522222231.......",
          "......1999222255555888885555522229991.......",
          ".....199999222555585585585555222999991......",
          "......1999222655555888885555562229991.......",
          ".......11112225555555555555552223311........",
          "...........12255555555555555522331..........",
          "............122555555555555522331...........",
          ".............1336555555555633331............",
          "............1222236666666333221.............",
          "...........122222222223222222221............",
          "..........122222222225222222222211111.......",
          "..........1222222255555552222222322221......",
          "..........12222225555555552222223222221.....",
          ".........1222222555555555552222222222231....",
          "..........1222225555555555522222332222331...",
          "..........122225555555555555222232222331....",
          "..........12222255555555555222223333331.....",
          "...........122225555555555522223311311......",
          "..........15555555555555555555551..1........",
          "..........15555555555555555555551...........",
          ".........1655555556225226555555561..........",
          "..........15555555333233355555551...........",
          "...........166666111113111666661............",
        ],
        happy: [
          "...........121................121...........",
          "..........12221..............12221..........",
          "..........12221......1.......12221..........",
          ".........122722111111211111.1227221.........",
          ".........12777212222222222211277721.........",
          "........1227722222222222222222777221........",
          "........1277222222222222222222277721........",
          ".......122222244444442222222222222221.......",
          ".......122224444444444422222222222221.......",
          "......13322444444444444422222222223331......",
          "......13224444444444444442222222222331......",
          ".......122244444444444442222222222231.......",
          ".......122224444444444422222222222231.......",
          ".......122228284444442222282822222231.......",
          "......1222222822222255522228222222221.......",
          ".......1222282822555555555828222222331......",
          ".......122222225555558555555222222231.......",
          ".......122222255555888885555522222231.......",
          "......1999222255555888885555522229991.......",
          ".....199999222555558888855555222999991......",
          "......1999222655555877785555562229991.......",
          ".......11112225555577777555552223311........",
          "...........12255555877785555522331..........",
          "............122555555555555522331...........",
          ".............1336555555555633331............",
          "............1222236666666333221.............",
          "...........122222222223222222221............",
          "..........122222222225222222222211111.......",
          "..........1222222255555552222222322221......",
          "..........12222225555555552222223222221.....",
          ".........1222222555555555552222222222231....",
          "..........1222225555555555522222332222331...",
          "..........122225555555555555222232222331....",
          "..........12222255555555555222223333331.....",
          "...........122225555555555522223311311......",
          "..........15555555555555555555551..1........",
          "..........15555555555555555555551...........",
          ".........1655555556225226555555561..........",
          "..........15555555333233355555551...........",
          "...........166666111113111666661............",
        ],
      }

      function PetSprite(props) {
        const rows = PET_FRAMES[props.frame] || PET_FRAMES.idle
        const px = props.size || 3
        const paths = {}
        rows.forEach((row, y) => {
          let x = 0
          while (x < row.length) {
            const ch = row[x]
            if (ch === '.') { x += 1; continue }
            let end = x
            while (end + 1 < row.length && row[end + 1] === ch) end += 1
            const w = end - x + 1
            paths[ch] = (paths[ch] || '') + `M${x} ${y}h${w}v1h-${w}z`
            x = end + 1
          }
        })
        const rects = Object.keys(paths).map((ch) =>
          React.createElement('path', { key: ch, fill: PET_PALETTE[ch] || '#F2A93B', d: paths[ch] }),
        )
        return React.createElement(
          'svg',
          {
            viewBox: `0 0 ${PET_W} ${PET_H}`,
            width: PET_W * px,
            height: PET_H * px,
            shapeRendering: 'crispEdges',
            style: { display: 'block' },
            'aria-hidden': true,
          },
          rects,
        )
      }

      function PetHeart(props) {
        return React.createElement(
          'svg',
          { viewBox: '0 0 10 9', width: 12, height: 11, style: props.style },
          React.createElement('path', {
            fill: props.color || '#F87171',
            d: 'M5 9 1.2 5.4A2.6 2.6 0 0 1 5 1.7a2.6 2.6 0 0 1 3.8 3.7z',
          }),
        )
      }

      /**
       * The corgi: breathes, blinks, reacts to a pet or a like, and says something useful now
       * and then. Affection and likes persist in this browser so the pet remembers you.
       * @param props - `{ open, overdue }` counts taken from the live list.
       */
      // Affection and progress live in this browser; nothing is sent anywhere.
      const PET_STORE = 'dsh-tf-pet-v3'
      const PET_BADGES = [
        { id: 'first', label: '第一条', need: (s) => s.completed >= 1 },
        { id: 'five', label: '5 条', need: (s) => s.completed >= 5 },
        { id: 'twenty', label: '20 条', need: (s) => s.completed >= 20 },
        { id: 'fifty', label: '50 条', need: (s) => s.completed >= 50 },
        { id: 'streak3', label: '连打 3 天', need: (s) => s.streak >= 3 },
        { id: 'streak7', label: '连打 7 天', need: (s) => s.streak >= 7 },
        { id: 'liked10', label: '被喜欢 10 次', need: (s) => s.likes >= 10 },
      ]

      const petDayKey = () => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      }
      const petYesterdayKey = () => {
        const d = new Date()
        d.setDate(d.getDate() - 1)
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      }

      /**
       * The corgi: grows with the todos you finish, unlocks badges at milestones, and reacts to a
       * pet or a like. Deliberately has no energy meter — the plugin should never make you feel
       * behind for not playing with it.
       * @param props - `{ items }`: the full list, used to count completions as they happen.
       */
      function PetDock(props) {
        const items = props.items || []
        // Count only top-level rows: subtasks live under their parent and must not inflate the
        // number the pet announces, or it disagrees with what the list shows.
        const open = items.filter((item) => !item.done && !item.parentId).length
        const today = petDayKey()
        const overdue = items.filter((item) => !item.done && !item.parentId && item.due && item.due < today).length

        const readStore = () => {
          const fallback = { pats: 0, likes: 0, completed: 0, streak: 0, lastDay: '', seenDone: [], seeded: false, taught: false }
          try {
            const raw = window.localStorage.getItem(PET_STORE)
            if (!raw) return fallback
            const parsed = JSON.parse(raw) || {}
            return {
              pats: Number(parsed.pats) || 0,
              likes: Number(parsed.likes) || 0,
              completed: Number(parsed.completed) || 0,
              streak: Number(parsed.streak) || 0,
              lastDay: typeof parsed.lastDay === 'string' ? parsed.lastDay : '',
              seenDone: Array.isArray(parsed.seenDone) ? parsed.seenDone.slice(-400) : [],
              seeded: Boolean(parsed.seeded) || (Array.isArray(parsed.seenDone) && parsed.seenDone.length > 0),
              taught: Boolean(parsed.taught),
            }
          } catch {
            return fallback
          }
        }
        const [stats, setStats] = useState(readStore)
        const [frame, setFrame] = useState('idle')
        const [say, setSay] = useState('')
        const [hearts, setHearts] = useState([])
        const [freshBadge, setFreshBadge] = useState('')
        const [teaching, setTeaching] = useState(false)
        const [narrow, setNarrow] = useState(false)
        const petRef = useRef(null)

        const save = (next) => {
          setStats(next)
          try {
            window.localStorage.setItem(PET_STORE, JSON.stringify(next))
          } catch {
            // blocked storage keeps progress for this page only
          }
        }

        // count todos that turn done while this panel is open
        useEffect(() => {
          const doneIds = items.filter((item) => item.done && item.id).map((item) => item.id)
          if (!doneIds.length) return
          setStats((current) => {
            // First run: the rows already done are history, not work finished just now.
            if (!current.seeded) {
              const seeded = { ...current, seeded: true, seenDone: doneIds.slice(-400) }
              try {
                window.localStorage.setItem(PET_STORE, JSON.stringify(seeded))
              } catch {
                // ignore
              }
              return seeded
            }
            const seen = new Set(current.seenDone)
            const added = doneIds.filter((id) => !seen.has(id))
            if (!added.length) return current
            const day = today
            const streak = current.lastDay === day ? current.streak : current.lastDay === petYesterdayKey() ? current.streak + 1 : 1
            const next = {
              ...current,
              completed: current.completed + added.length,
              streak,
              lastDay: day,
              seenDone: current.seenDone.concat(added).slice(-400),
            }
            try {
              window.localStorage.setItem(PET_STORE, JSON.stringify(next))
            } catch {
              // ignore
            }
            return next
          })
        }, [items])

        const unlocked = PET_BADGES.filter((badge) => badge.need(stats))
        const level = 1 + Math.min(9, Math.floor(stats.completed / 5))
        // Stay small on purpose: a mascot that covers the list is worse than no mascot.
        const size = narrow ? 2 : stats.completed >= 10 ? 3 : 2

        const lines = () => {
          const out = []
          if (open === 0) out.push('都清完了，我去睡一会儿')
          if (open > 0) out.push(`还有 ${open} 条没做完，慢慢来`)
          if (overdue > 0) out.push(`有 ${overdue} 条逾期了，先挑一条处理吧`)
          if (open > 3) out.push(`${open} 条有点多，挑最小的那条先做`)
          if (stats.completed > 0) out.push(`你已经完成 ${stats.completed} 条了`)
          out.push('摸摸头，今天也辛苦了')
          return out
        }
        const speak = (text) => setSay(text)
        const burst = () => {
          const id = Date.now()
          setHearts((list) => list.concat([{ id, dx: -8 + Math.random() * 18 }]))
          window.setTimeout(() => setHearts((list) => list.filter((h) => h.id !== id)), 1500)
        }
        const celebrate = () => {
          const before = new Set(unlocked.map((b) => b.id))
          const next = PET_BADGES.find((badge) => !before.has(badge.id) && badge.need(stats))
          if (next) {
            setFreshBadge(next.id)
            speak(`解锁成就：${next.label}`)
            window.setTimeout(() => setFreshBadge(''), 2200)
          }
        }
        const pat = () => {
          save({ ...stats, pats: stats.pats + 1 })
          setFrame('happy')
          burst()
          speak(lines()[(stats.pats + 1) % lines().length])
          window.setTimeout(() => setFrame('idle'), 1400)
        }
        const like = () => {
          save({ ...stats, likes: stats.likes + 1 })
          setFrame('happy')
          burst()
          speak('谢谢你，我今天心情很好')
          window.setTimeout(() => setFrame('idle'), 1400)
        }

        useEffect(() => {
          celebrate()
        }, [stats.completed, stats.streak, stats.likes])

        // Show the two buttons once, so they are discoverable without hovering.
        useEffect(() => {
          if (stats.taught) return
          setTeaching(true)
          save({ ...stats, taught: true })
          const stop = window.setTimeout(() => setTeaching(false), 5000)
          return () => window.clearTimeout(stop)
        }, [])

        // A narrow panel gets the small sprite so the list keeps its room.
        useEffect(() => {
          const el = petRef.current
          const root = el && el.closest ? el.closest('.dsh-tf-root') : null
          if (!root) return undefined
          const measure = () => setNarrow(root.clientWidth < 700)
          measure()
          if (typeof ResizeObserver === 'function') {
            const observer = new ResizeObserver(measure)
            observer.observe(root)
            return () => observer.disconnect()
          }
          window.addEventListener('resize', measure)
          return () => window.removeEventListener('resize', measure)
        }, [])

        useEffect(() => {
          const first = window.setTimeout(() => speak(lines()[0]), 2400)
          const blinkTimer = window.setInterval(() => {
            setFrame((current) => (current === 'happy' ? current : 'blink'))
            window.setTimeout(() => setFrame((current) => (current === 'happy' ? current : 'idle')), 160)
          }, 4200)
          const quiet = window.setInterval(() => setSay(''), 11000)
          return () => {
            window.clearTimeout(first)
            window.clearInterval(blinkTimer)
            window.clearInterval(quiet)
          }
        }, [])

        return React.createElement(
          'div',
          { className: `dsh-tf-pet${teaching ? ' is-teaching' : ''}`, ref: petRef },
          say ? React.createElement('div', { className: 'dsh-tf-pet-bubble' }, say) : null,
          React.createElement(
            'div',
            { className: 'dsh-tf-pet-stage' },
            React.createElement(
              'div',
              { className: 'dsh-tf-pet-hearts' },
              hearts.map((h) =>
                React.createElement(PetHeart, { key: h.id, style: { '--dx': `${h.dx}px` } }),
              ),
            ),
            React.createElement(
              'button',
              {
                type: 'button',
                className: `dsh-tf-pet-body${frame === 'happy' ? ' is-happy' : ''}` ,
                title: `Lv.${level} · 已完成 ${stats.completed} 条 · 摸过 ${stats.pats} 次` ,
                'aria-label': '摸摸柯基',
                onClick: pat,
              },
              React.createElement(PetSprite, { frame, size }),
            ),
            React.createElement(
              'div',
              { className: 'dsh-tf-pet-meta' },
              React.createElement('span', { className: 'dsh-tf-pet-level' }, `Lv.${level}`),
              unlocked.slice(-1).map((badge) =>
                React.createElement(
                  'span',
                  {
                    key: badge.id,
                    className: `dsh-tf-pet-badge${freshBadge === badge.id ? ' is-new' : ''}`,
                    title: `成就：${badge.label}` ,
                  },
                  badge.label,
                ),
              ),
            ),
            React.createElement(
              'div',
              { className: 'dsh-tf-pet-actions' },
              React.createElement(
                'button',
                { type: 'button', className: 'dsh-tf-pet-btn', onClick: pat },
                '🖐 抚摸',
                stats.pats > 0
                  ? React.createElement('span', { className: 'dsh-tf-pet-btn-num' }, stats.pats)
                  : null,
              ),
              React.createElement(
                'button',
                { type: 'button', className: 'dsh-tf-pet-btn', onClick: like },
                '👍 喜欢',
                stats.likes > 0
                  ? React.createElement('span', { className: 'dsh-tf-pet-btn-num' }, stats.likes)
                  : null,
              ),
            ),
          ),
        )
      }
      const composer = () =>
        h(
          'div',
          { className: 'dsh-tf-foot' },
          h(
            'div',
            { className: 'dsh-tf-composer' },
            h('textarea', {
              className: 'dsh-tf-say',
              rows: 1,
              value: say,
              placeholder: t('say.placeholder'),
              'aria-label': t('say.placeholder'),
              spellCheck: false,
              onChange: (event) => setSay(event.target.value),
              onKeyDown: (event) => {
                if (event.key !== 'Enter' || event.shiftKey) return
                const composing = event.nativeEvent && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)
                if (composing) return
                event.preventDefault()
                sendMessage()
              },
            }),
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-tf-send',
                title: t('say.send'),
                'aria-label': t('say.send'),
                disabled: !say.trim() || (sendState && sendState.status === 'sending'),
                onClick: sendMessage,
              },
              h(IconSend, { size: 15 }),
            ),
          ),
          sayHint(),
        )

      // One number everywhere: a subtask is a step inside its parent, not a todo of its own.
      const openTop = useMemo(() => openItems.filter((item) => !item.parentId), [openItems])
      const openCount = openTop.length

      return h(
        React.Fragment,
        null,
        h('style', { key: 'dsh-tf-style' }, CSS),
        h(
          'div',
          { className: 'dsh-tf-root' },
          h(PetDock, {
            key: 'pet',
            items,
          }),
          h(
            'header',
            { className: 'dsh-tf-head' },
            h(
              'div',
              { className: 'dsh-tf-headline' },
              h(
                'div',
                { className: 'dsh-tf-titlerow' },
                h('h1', { className: 'dsh-tf-title' }, t('panel.title')),
                updateInfo && updateInfo.available
                  ? h(
                      'button',
                      {
                        type: 'button',
                        className: 'dsh-tf-updatebtn',
                        title: `当前 v${updateInfo.current} → v${updateInfo.latest}，点一下更新`,
                        'aria-label': `有新版 v${updateInfo.latest}，点击更新`,
                        onClick: applyUpdate,
                        disabled: updating,
                      },
                      updating
                        ? null
                        : h(
                            'svg',
                            {
                              width: 12,
                              height: 12,
                              viewBox: '0 0 16 16',
                              fill: 'none',
                              stroke: 'currentColor',
                              'stroke-width': 1.7,
                              'stroke-linecap': 'round',
                              'stroke-linejoin': 'round',
                              'aria-hidden': 'true',
                            },
                            h('path', { d: 'M8 2.5v7.5' }),
                            h('path', { d: 'M4.8 7.2 8 10.4l3.2-3.2' }),
                            h('path', { d: 'M3.2 13.4h9.6' }),
                          ),
                      updating ? '更新中…' : '新版本',
                    )
                  : null,
              ),
              (() => {
                const overdue = items.filter((item) => !item.done && item.due && item.due < todayKey).length
                const today = items.filter((item) => !item.done && item.due === todayKey).length
                const parts = [`${openCount} 条未完成`]
                if (today) parts.push(`今天 ${today}`)
                if (overdue) parts.push(`逾期 ${overdue}`)
                return h('span', { className: 'dsh-tf-sub' }, parts.join(' · '))
              })(),
            ),
            trashCount > 0
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: `dsh-tf-trashbtn${showTrash ? ' is-on' : ''}`,
                    title: `回收站 · ${trashCount} 条`,
                    'aria-label': `回收站 · ${trashCount} 条`,
                    onClick: toggleTrash,
                  },
                  h(
                    'svg',
                    {
                      width: 17,
                      height: 17,
                      viewBox: '0 0 16 16',
                      fill: 'none',
                      stroke: 'currentColor',
                      'stroke-width': 1.6,
                      'stroke-linecap': 'round',
                      'stroke-linejoin': 'round',
                      'aria-hidden': 'true',
                    },
                    h('path', { d: 'M2.6 4.6h10.8' }),
                    h('path', { d: 'M6.4 4.6V3.3c0-.4.3-.7.7-.7h1.8c.4 0 .7.3.7.7v1.3' }),
                    h('path', { d: 'M4.2 4.6l.6 8.1c.05.6.55 1.05 1.15 1.05h4.1c.6 0 1.1-.45 1.15-1.05l.6-8.1' }),
                  ),
                  h('span', { className: 'dsh-tf-trashbtn-count' }, trashCount),
                )
              : null,
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-tf-btn is-solid',
                title: t('common.refresh'),
                onClick: () => loadTodos(),
              },
              h(IconRefresh, { size: 13 }),
              t('common.refresh'),
            ),
          ),
          h(
            'div',
            { className: 'dsh-tf-body' },
            h(
              'div',
              { className: 'dsh-tf-pane' },
              h(
                'div',
                { className: 'dsh-tf-toolbar' },
                h(
                  'div',
                  { className: 'dsh-tf-filters', role: 'group', 'aria-label': t('panel.title') },
                  scopeButton('all', '全部', scopeCounts.all),
                  scopeButton('work', '办公', scopeCounts.work),
                  scopeButton('life', '生活', scopeCounts.life),
                ),
                h('span', { className: 'dsh-tf-divider', 'aria-hidden': true }),
                h(
                  'div',
                  { className: 'dsh-tf-group' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dsh-tf-filter' + (quick === 'week' ? ' is-active' : ''),
                      'data-scope': 'quick',
                      title: weekRange.start + " → " + weekRange.end,
                      onClick: () => setQuick(quick === 'week' ? 'all' : 'week'),
                    },
                    '本周',
                  ),
                  h(
                    'button',
                    { type: 'button', className: `dsh-tf-filter${quick === 'today' ? ' is-active' : ''}`, 'data-scope': 'quick', onClick: () => setQuick(quick === 'today' ? 'all' : 'today') },
                    '今天',
                  ),
                  h(
                    'button',
                    { type: 'button', className: `dsh-tf-filter${quick === 'overdue' ? ' is-active' : ''}`, 'data-scope': 'quick', onClick: () => setQuick(quick === 'overdue' ? 'all' : 'overdue') },
                    '逾期',
                  ),
                ),
                searchOpen
                  ? h('input', {
                      className: 'dsh-tf-search',
                      ref: searchRef,
                      autoFocus: true,
                      value: query,
                      placeholder: t('search.placeholder'),
                      onChange: (event) => setQuery(event.target.value),
                      onKeyDown: (event) => {
                        if (event.key === 'Escape') {
                          setQuery('')
                          setSearchOpen(false)
                        }
                      },
                      onBlur: () => {
                        if (!query.trim()) setSearchOpen(false)
                      },
                    })
                  : h(
                      'button',
                      {
                        type: 'button',
                        className: 'dsh-tf-searchbtn',
                        title: '搜索（/）',
                        'aria-label': '搜索',
                        onClick: () => setSearchOpen(true),
                      },
                      '🔍',
                    ),
              ),
              (() => {
                const tags = [...new Set(items.flatMap((item) => item.tags || []))].slice(0, 14)
                if (!tags.length) return null
                return h(
                  'div',
                  { className: 'dsh-tf-tagfilter' },
                  tags.map((tag) =>
                    h(
                      'button',
                      {
                        type: 'button',
                        key: tag,
                        className: `dsh-tf-quickfilter${tagFilter === tag ? ' is-on' : ''}`,
                        onClick: () => setTagFilter((current) => (current === tag ? '' : tag)),
                      },
                      tag,
                    ),
                  ),
                )
              })(),
              error
                ? h(
                    'div',
                    { className: 'dsh-tf-error' },
                    h('span', { style: { flex: 1 } }, error),
                    h('button', { type: 'button', className: 'dsh-tf-btn', onClick: () => loadTodos() }, t('common.retry')),
                  )
                : notice
                  ? h('div', { className: 'dsh-tf-notice' }, notice)
                  : null,
              undoItem
                ? h(
                    'div',
                    { className: 'dsh-tf-undo' },
                    h('span', { style: { flex: 1 } }, `已删除：${undoItem.title}`),
                    h('button', { type: 'button', className: 'dsh-tf-btn', style: { color: 'inherit', borderColor: 'currentColor' }, onClick: undoDelete }, '撤销'),
                  )
                : null,
              showTrash
                ? h(
                    'section',
                    { className: 'dsh-tf-trash' },
                    h(
                      'div',
                      { className: 'dsh-tf-sec' },
                      '回收站 · 7 天内可恢复',
                      h('span', { className: 'dsh-tf-sec-count' }, trashItems.length),
                      trashItems.length
                        ? h(
                            'button',
                            {
                              type: 'button',
                              className: 'dsh-tf-linkbtn',
                              style: { marginLeft: 'auto' },
                              onClick: () => purgeTrash(),
                            },
                            '清空',
                          )
                        : null,
                    ),
                    trashItems.length
                      ? trashItems.map((item) =>
                          h(
                            'div',
                            { className: 'dsh-tf-row is-done', key: item.id },
                            h('span', { className: 'dsh-tf-text', style: { flex: 1 } }, item.title),
                            h('span', { className: 'dsh-tf-due' }, new Date(item.deletedAt).toLocaleDateString()),
                            h('button', { type: 'button', className: 'dsh-tf-linkbtn', onClick: () => restoreTrash(item.id) }, '恢复'),
                            h('button', { type: 'button', className: 'dsh-tf-linkbtn', onClick: () => purgeTrash(item.id) }, '彻底删'),
                          ),
                        )
                      : h('div', { className: 'dsh-tf-note' }, '回收站是空的。'),
                  )
                : null,
              h(
                'div',
                { className: 'dsh-tf-list', style: showTrash ? { display: 'none' } : undefined, onClick: refreshAfterClick },
                openItems.length === 0 && doneItems.length === 0 && !busy
                  ? h(
                      'div',
                      { className: 'dsh-tf-empty' },
                      scope === 'all'
                        ? h(
                            React.Fragment,
                            null,
                            h('strong', null, t('todo.empty.title')),
                            h('span', null, t('todo.empty.hint')),
                          )
                        : h('span', null, t('todo.emptyScope')),
                    )
                  : null,
                openItems.length > 0
                  ? h(
                      'section',
                      null,
                      h('h2', { className: 'dsh-tf-sec' }, t('todo.open'), h('span', { className: 'dsh-tf-sec-count' }, openItems.length)),
                      openTop
                        .map((item, position) =>
                          h(
                            'div',
                            { key: item.id },
                            row(item, position + 1),
                            (items.filter((child) => child.parentId === item.id)).map((child) =>
                              h('div', { className: 'dsh-tf-child', key: child.id }, row(child)),
                            ),
                            childFor === item.id
                              ? h(
                                  'div',
                                  { className: 'dsh-tf-child dsh-tf-childadd' },
                                  h('input', {
                                    className: 'dsh-tf-edit',
                                    autoFocus: true,
                                    value: childText,
                                    placeholder: '子任务内容，回车添加',
                                    onChange: (event) => setChildText(event.target.value),
                                    onKeyDown: (event) => {
                                      if (event.key === 'Enter') addChild(item)
                                      if (event.key === 'Escape') {
                                        setChildFor('')
                                        setChildText('')
                                      }
                                    },
                                    onBlur: () => {
                                      setChildFor('')
                                      setChildText('')
                                    },
                                  }),
                                )
                              : null,
                          ),
                        ),
                    )
                  : null,
                doneItems.length > 0
                  ? h(
                      'section',
                      null,
                      h(
                        'h2',
                        { className: 'dsh-tf-sec' },
                        h(
                          'button',
                          {
                            type: 'button',
                            className: 'dsh-tf-sec-toggle',
                            'aria-expanded': showDone,
                            onClick: () => setShowDone((value) => !value),
                          },
                          h('span', { className: `dsh-tf-chevron${showDone ? ' is-open' : ''}` }, '▸'),
                          t('todo.done'),
                          h('span', { className: 'dsh-tf-sec-count' }, doneItems.length),
                        ),
                        h('button', { type: 'button', className: 'dsh-tf-btn dsh-tf-sec-action', onClick: clearDone }, t('todo.clearDone')),
                      ),
                      showDone ? doneItems.map(row) : null,
                    )
                  : null,
              ),
            ),
          ),
          composer(),
        ),
      )
    }

    // -------------------------------------------------------------- plugin

    return {
      inject: ['slots'],
      apply(ctx) {
        const i18n = createI18n(ctx)
        const bridge = createBridge(ctx, i18n)

        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: PANEL_ID,
              order: ICON_ORDER,
              label: () => i18n.t('panel.title'),
            },
            (ownerProps) =>
              h(PanelGlyph, {
                size: (ownerProps && ownerProps.size) || 18,
                active: !!(ownerProps && ownerProps.active),
              }),
          ),
        )

        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: PANEL_ID }, (ownerProps) =>
            h(Panel, { ...(ownerProps || {}), i18n, bridge }),
          ),
        )

        ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register(
            { name: 'conversation.composer.dock', id: 'todo-files-session', order: 90 },
            (ownerProps) => h(SessionProbe, { sessionId: ownerProps && ownerProps.sessionId, bridge }),
          ),
        )
      },
    }
  },
})
