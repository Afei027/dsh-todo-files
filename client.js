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

    // ---------------------------------------------------------------- text

    const ZH = {
      'panel.title': '待办与文件',
      'panel.sub': '{open} 条待办未完成',
      'panel.subEmpty': '还没有待办',
      'todo.empty.title': '还没有待办',
      'todo.empty.hint': '在上面跟我说一句，或者直接让我加一条。',
      'todo.emptyScope': '这一类还没有待办。',
      'todo.badgeWork': '办公',
      'todo.badgeLife': '生活',
      'filter.all': '全部',
      'filter.work': '办公',
      'filter.life': '生活',
      'todo.open': '进行中',
      'todo.done': '已完成',
      'todo.markDone': '标记完成',
      'todo.markOpen': '标记未完成',
      'todo.remove': '删除这条待办',
      'todo.clearDone': '清除已完成',
      'todo.openFile': '在对话里打开 {name}',
      'todo.reveal': '在资源管理器中显示',
      'say.placeholder': '跟 DSH 说一句：帮我找找周报模板，加进待办…',
      'say.send': '发送给 DSH',
      'say.hint': '回车发送 · Shift+Enter 换行',
      'say.sending': '发送中…',
      'say.sent': '已发给 DSH，新待办会自动出现在上面',
      'say.open': '看回复',
      'say.draft': '已放进对话输入框，按回车发送',
      'say.openChat': '打开对话',
      'say.unavailable': '当前界面连不上会话服务，请刷新页面再试。',
      'say.empty': '先写点什么再发。',
      'common.retry': '重试',
      'common.refresh': '刷新',
    }

    const EN = {
      'panel.title': 'Todo & Files',
      'panel.sub': '{open} todo(s) open',
      'panel.subEmpty': 'Nothing open',
      'todo.empty.title': 'No todos yet',
      'todo.empty.hint': 'Say something above, or just ask me to add one.',
      'todo.emptyScope': 'Nothing in this list yet.',
      'todo.badgeWork': 'Work',
      'todo.badgeLife': 'Life',
      'filter.all': 'All',
      'filter.work': 'Work',
      'filter.life': 'Life',
      'todo.open': 'Open',
      'todo.done': 'Done',
      'todo.markDone': 'Mark done',
      'todo.markOpen': 'Mark open',
      'todo.remove': 'Delete this todo',
      'todo.clearDone': 'Clear done',
      'todo.openFile': 'Open {name} in the conversation',
      'todo.reveal': 'Show in file manager',
      'say.placeholder': 'Tell DSH what you need: find last week’s template and add it to my todos…',
      'say.send': 'Send to DSH',
      'say.hint': 'Enter to send · Shift+Enter for a new line',
      'say.sending': 'Sending…',
      'say.sent': 'Sent to DSH — new todos will appear above',
      'say.open': 'See reply',
      'say.draft': 'Put in the chat box — press Enter there to send',
      'say.openChat': 'Open chat',
      'say.unavailable': 'The chat service is unreachable from this page; refresh and retry.',
      'say.empty': 'Write something first.',
      'common.retry': 'Retry',
      'common.refresh': 'Refresh',
    }

    // ---------------------------------------------------------------- css

    const CSS = `
.dsh-tf-root, .dsh-tf-root * { box-sizing: border-box; }
.dsh-tf-root {
  display: flex; flex-direction: column; height: 100%; min-height: 0;
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
  font-family: inherit; font-size: 13px; line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}
.dsh-tf-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; padding: 18px 22px 12px; flex: none; }
.dsh-tf-headline { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.dsh-tf-title { margin: 0; font-size: 16px; font-weight: 600; letter-spacing: .2px; line-height: 1.3; }
.dsh-tf-sub { font-size: 12px; color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-tf-body { flex: 1; min-height: 0; overflow: auto; padding: 0 22px 20px; }
.dsh-tf-pane { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.dsh-tf-error {
  margin: 8px 0 4px; padding: 8px 12px; border-radius: 9px; font-size: 12px; line-height: 1.6;
  border: 1px solid var(--dsw-alias-state-error-primary); color: var(--dsw-alias-label-primary);
  display: flex; align-items: center; gap: 10px;
}
.dsh-tf-list { display: flex; flex-direction: column; margin-top: 4px; }
.dsh-tf-filters { display: flex; align-items: center; gap: 6px; margin: 0 0 8px; flex: none; }
.dsh-tf-filter {
  display: inline-flex; align-items: center; height: 26px; padding: 0 10px;
  border-radius: 7px; border: 1px solid var(--dsw-alias-border-l1); background: transparent;
  color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; cursor: pointer;
  transition: background .15s ease, color .15s ease, border-color .15s ease;
}
.dsh-tf-filter:hover { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-border-l2); }
.dsh-tf-filter.is-active { background: var(--dsw-alias-bg-layer-2); border-color: transparent; color: var(--dsw-alias-label-primary); }
.dsh-tf-filter-count { margin-left: 6px; font-size: 11px; font-variant-numeric: tabular-nums; opacity: .7; }
.dsh-tf-badge {
  display: inline-block; margin-right: 6px; padding: 0 5px; border-radius: 4px;
  font-size: 10.5px; line-height: 16px; vertical-align: 1px;
  border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary);
}
.dsh-tf-badge.is-work { color: var(--dsw-alias-brand-primary); border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, transparent); }
.dsh-tf-badge.is-life { color: var(--dsw-alias-state-success-primary); border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 45%, transparent); }
.dsh-tf-sec { display: flex; align-items: center; gap: 8px; margin: 16px 0 4px; font-size: 11px; font-weight: 600; letter-spacing: .5px; color: var(--dsw-alias-label-secondary); }
.dsh-tf-sec:first-child { margin-top: 2px; }
.dsh-tf-sec-count { font-variant-numeric: tabular-nums; }
.dsh-tf-sec-action { margin-left: auto; }
.dsh-tf-row { display: flex; align-items: flex-start; gap: 10px; padding: 9px 8px; border-radius: 9px; transition: background .12s ease; }
.dsh-tf-index {
  flex: none; width: 18px; margin-top: 1px; text-align: right;
  font-size: 11px; line-height: 18px; color: var(--dsw-alias-label-secondary);
  font-variant-numeric: tabular-nums;
}
.dsh-tf-row:hover { background: var(--dsw-alias-bg-layer-1); }
.dsh-tf-main { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
.dsh-tf-text { font-size: 13px; line-height: 1.55; word-break: break-word; }
.dsh-tf-row.is-done .dsh-tf-text { color: var(--dsw-alias-label-secondary); text-decoration: line-through; text-decoration-thickness: 1px; }
.dsh-tf-check {
  flex: none; width: 18px; height: 18px; margin-top: 2px; padding: 0; border-radius: 6px;
  border: 1.5px solid var(--dsw-alias-border-l2); background: transparent; color: transparent;
  display: grid; place-items: center; cursor: pointer;
  transition: background .15s ease, border-color .15s ease, color .15s ease;
}
.dsh-tf-check:hover { border-color: var(--dsw-alias-brand-primary); }
.dsh-tf-check[aria-checked="true"] { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); color: #fff; }
.dsh-tf-check:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dsh-tf-chip {
  display: inline-flex; align-items: center; gap: 5px; max-width: 100%;
  padding: 2px 9px 2px 7px; margin-top: 1px; border-radius: 7px;
  border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary); font: inherit; font-size: 11.5px; cursor: pointer;
  transition: color .15s ease, border-color .15s ease;
}
.dsh-tf-chip:hover { color: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
.dsh-tf-chip-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-tf-chip-icon { display: inline-flex; flex: none; }
.dsh-tf-actions { display: flex; gap: 2px; flex: none; }
.dsh-tf-icon-btn {
  width: 26px; height: 26px; padding: 0; border: 0; border-radius: 7px; background: transparent;
  color: var(--dsw-alias-label-secondary); display: grid; place-items: center; cursor: pointer;
  opacity: 0; transition: opacity .12s ease, background .12s ease, color .12s ease;
}
.dsh-tf-row:hover .dsh-tf-icon-btn { opacity: 1; }
.dsh-tf-icon-btn:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.dsh-tf-icon-btn:focus-visible { opacity: 1; outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.dsh-tf-icon-btn.is-visible { opacity: 1; }
.dsh-tf-empty {
  margin-top: 12px; padding: 30px 18px; border-radius: 12px; text-align: center;
  border: 1px dashed var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary);
  font-size: 12.5px; line-height: 1.9;
}
.dsh-tf-empty strong { display: block; color: var(--dsw-alias-label-primary); font-size: 13px; font-weight: 600; margin-bottom: 2px; }
.dsh-tf-btn {
  height: 26px; padding: 0 9px; border-radius: 7px; border: 1px solid transparent;
  background: transparent; color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 12px; cursor: pointer; flex: none;
  transition: background .15s ease, color .15s ease;
}
.dsh-tf-btn:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.dsh-tf-btn.is-solid {
  height: 28px; padding: 0 13px; border-radius: 8px; font-weight: 500;
  background: var(--dsw-alias-label-primary); color: var(--dsw-alias-bg-base);
}
.dsh-tf-btn.is-solid:hover { background: var(--dsw-alias-label-primary); color: var(--dsw-alias-bg-base); opacity: .86; }
.dsh-tf-foot { flex: none; padding: 10px 22px 14px; border-top: 1px solid var(--dsw-alias-border-l1); }
.dsh-tf-composer {
  display: flex; align-items: flex-end; gap: 8px; padding: 8px 8px 8px 12px;
  border-radius: 12px; border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  transition: border-color .15s ease, box-shadow .15s ease;
}
.dsh-tf-composer:hover { border-color: var(--dsw-alias-border-l2); }
.dsh-tf-composer:focus-within { border-color: var(--dsw-alias-brand-primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent); }
.dsh-tf-say {
  flex: 1; min-width: 0; max-height: 108px; padding: 4px 0; border: 0; outline: none;
  background: transparent; color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 13px; line-height: 1.55; resize: none;
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
  font-size: 11.5px; line-height: 1.5; color: var(--dsw-alias-label-secondary);
}
.dsh-tf-sayhint-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-tf-sayhint.is-error .dsh-tf-sayhint-text { color: var(--dsw-alias-state-error-primary); }
.dsh-tf-linkbtn {
  flex: none; padding: 0; border: 0; background: transparent; cursor: pointer;
  font: inherit; font-size: 11.5px; color: var(--dsw-alias-brand-primary);
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
      const query = `op=${encodeURIComponent(op)}&args=${encodeURIComponent(JSON.stringify(payload || {}))}&key=${encodeURIComponent(PANEL_KEY)}`
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
     * Build the workspace file address the Sidebar's preview claims.
     *
     * The grammar is `dsh-resource://file/session/<sessionId>/<path>`; the Session authorizes the
     * Host read, and a path outside that Session's workspace stays absolute. Every segment is
     * component-encoded with `:` kept literal.
     * @param sessionId - the Session whose authority the read uses.
     * @param target - absolute path on this computer.
     */
    function fileAddress(sessionId, target) {
      if (!sessionId) return ''
      const path = String(target || '').replace(/\\/g, '/').replace(/^\.\//, '')
      if (!path) return ''
      const encode = (part) => encodeURIComponent(part).replace(/%3A/gi, ':')
      const encoded = path.split('/').map(encode).join('/')
      return `dsh-resource://file/session/${encode(sessionId)}/${encoded}`
    }

    /**
     * Read the active locale and hand components a translate function that follows it.
     * @param ctx - the plugin context.
     */
    function createI18n(ctx) {
      const locale = typeof ctx.get === 'function' ? ctx.get('locale') : undefined
      const listeners = new Set()
      let active = 'en'
      const read = () => {
        try {
          const snapshot = locale && typeof locale.getLocale === 'function' ? locale.getLocale() : null
          if (snapshot && typeof snapshot.active === 'string' && snapshot.active) active = snapshot.active
        } catch {
          // keep the previous value
        }
      }
      read()
      if (locale && typeof locale.subscribe === 'function' && typeof ctx.effect === 'function') {
        ctx.effect(() => {
          const off = locale.subscribe(() => {
            read()
            listeners.forEach((fn) => fn())
          })
          return () => {
            try {
              off()
            } catch {
              // a disposed locale service needs no cleanup
            }
          }
        })
      }
      const translate = (key, vars) => {
        const dict = String(active).toLowerCase().indexOf('zh') === 0 ? ZH : EN
        let text = dict[key] != null ? dict[key] : EN[key] != null ? EN[key] : key
        if (vars) {
          for (const name of Object.keys(vars)) text = text.split(`{${name}}`).join(String(vars[name]))
        }
        return text
      }
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
     * Bridge to the agent: remembers the Session the Conversation is showing (so a typed sentence
     * and a file link both address that Session) and sends sentences into it.
     * @param ctx - the plugin context.
     * @param i18n - the translator created in `apply`.
     */
    function createBridge(ctx, i18n) {
      let lastSessionId = null
      const service = (name) => (typeof ctx.get === 'function' ? ctx.get(name) : undefined)
      return {
        remember(sessionId) {
          if (typeof sessionId === 'string' && sessionId) lastSessionId = sessionId
        },
        sessionId() {
          return lastSessionId
        },
        async send(text) {
          const sessions = service('sessions')
          if (sessions && typeof sessions.retain === 'function' && lastSessionId) {
            try {
              const reference = sessions.retain(lastSessionId, { source: 'controllerOperation' })
              try {
                const binding = await reference.ready
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
         * Return to the Conversation and open one linked path there.
         * @param target - absolute path of the linked file or folder.
         * @param kind - `'file'` opens the preview; anything else is revealed.
         */
        async openPath(target, kind) {
          const path = String(target || '')
          if (!path) return
          if (kind !== 'file' || !lastSessionId) {
            await call('fs.reveal', { path })
            return
          }
          const layout = service('layout')
          const column = service('sidebarRight')
          if (layout && typeof layout.selectPanel === 'function') layout.selectPanel('conversation')
          window.setTimeout(() => {
            try {
              if (column && typeof column.openResource === 'function') {
                column.openResource(fileAddress(lastSessionId, path))
                return
              }
            } catch (error) {
              if (typeof console !== 'undefined' && console.error) console.error('[todo-files] openResource failed', error)
            }
            call('fs.reveal', { path }).catch(() => {})
          }, 0)
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

    function IconFile(props) {
      const size = props.size || 14
      return h(
        'svg',
        { viewBox: '0 0 20 20', width: size, height: size, 'aria-hidden': true },
        h('path', { ...stroke, d: 'M5 2.9h6.1l3.9 3.9v10.1c0 .5-.4.9-.9.9H5.9c-.5 0-.9-.4-.9-.9V3.8c0-.5.4-.9.9-.9z' }),
        h('path', { ...stroke, d: 'M11 3.1v4h3.9' }),
      )
    }

    function IconFolder(props) {
      const size = props.size || 14
      return h(
        'svg',
        { viewBox: '0 0 20 20', width: size, height: size, 'aria-hidden': true },
        h('path', { ...stroke, d: 'M2.6 6.1c0-.9.7-1.6 1.6-1.6h3.2l1.7 1.7h6.7c.9 0 1.6.7 1.6 1.6v6.1c0 .9-.7 1.6-1.6 1.6H4.2c-.9 0-1.6-.7-1.6-1.6z' }),
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
     * @param props - `{ item, t, onToggle, onRemove, onOpenLink }`.
     */
    function TodoRow(props) {
      const { item, t } = props
      return h(
        'div',
        { className: `dsh-tf-row${item.done ? ' is-done' : ''}` },
        props.index > 0 ? h('span', { className: 'dsh-tf-index' }, props.index) : null,
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
          h(
            'div',
            { className: 'dsh-tf-text' },
            props.showCategory
              ? h(
                  'span',
                  { className: `dsh-tf-badge is-${item.category === 'life' ? 'life' : 'work'}` },
                  item.category === 'life' ? t('todo.badgeLife') : t('todo.badgeWork'),
                )
              : null,
            item.title,
          ),
          item.link
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-tf-chip',
                  title: t('todo.openFile', { name: item.link.path }),
                  onClick: () => props.onOpenLink(item.link),
                },
                h(
                  'span',
                  { className: 'dsh-tf-chip-icon' },
                  item.link.kind === 'dir' ? h(IconFolder, { size: 12 }) : h(IconFile, { size: 12 }),
                ),
                h('span', { className: 'dsh-tf-chip-name' }, item.link.name),
              )
            : null,
        ),
        h(
          'div',
          { className: 'dsh-tf-actions' },
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
      const [busy, setBusy] = useState(true)
      const [error, setError] = useState('')
      const [say, setSay] = useState('')
      const [sendState, setSendState] = useState(null)
      const [scope, setScope] = useState('all')

      const loadTodos = useCallback(async (silent) => {
        if (!silent) setBusy(true)
        try {
          const value = await call('todos.list', {})
          setItems(Array.isArray(value.items) ? value.items : [])
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

      const visibleItems = useMemo(
        () => (scope === 'all' ? items : items.filter((item) => (item.category === 'life' ? 'life' : 'work') === scope)),
        [items, scope],
      )
      const openItems = useMemo(() => visibleItems.filter((item) => !item.done), [visibleItems])
      const doneItems = useMemo(() => visibleItems.filter((item) => item.done), [visibleItems])
      const scopeCounts = useMemo(() => {
        const open = items.filter((item) => !item.done)
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

      const openLink = (link) => {
        if (!bridge) return
        bridge.openPath(link.path, link.kind).catch((failure) => setError(messageOf(failure)))
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

      const row = (item) =>
        h(TodoRow, {
          key: item.id,
          item,
          t,
          index: orderIndex.get(item.id) || 0,
          showCategory: scope === 'all',
          onToggle: toggleTodo,
          onRemove: removeTodo,
          onOpenLink: openLink,
        })

      const scopeButton = (id, label, count) =>
        h(
          'button',
          {
            type: 'button',
            className: `dsh-tf-filter${scope === id ? ' is-active' : ''}`,
            'aria-pressed': scope === id,
            onClick: () => setScope(id),
          },
          label,
          count > 0 ? h('span', { className: 'dsh-tf-filter-count' }, count) : null,
        )

      const composer = () =>
        h(
          'div',
          { className: 'dsh-tf-foot' },
          h(
            'div',
            { className: 'dsh-tf-composer' },
            h('textarea', {
              className: 'dsh-tf-say',
              rows: 2,
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

      const openCount = openItems.length

      return h(
        React.Fragment,
        null,
        h('style', { key: 'dsh-tf-style' }, CSS),
        h(
          'div',
          { className: 'dsh-tf-root' },
          h(
            'header',
            { className: 'dsh-tf-head' },
            h(
              'div',
              { className: 'dsh-tf-headline' },
              h('h1', { className: 'dsh-tf-title' }, t('panel.title')),
              h('span', { className: 'dsh-tf-sub' }, openCount ? t('panel.sub', { open: openCount }) : t('panel.subEmpty')),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-tf-btn is-solid',
                title: t('common.refresh'),
                onClick: () => loadTodos(),
              },
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
                { className: 'dsh-tf-filters', role: 'group', 'aria-label': t('panel.title') },
                scopeButton('all', t('filter.all'), scopeCounts.all),
                scopeButton('work', t('filter.work'), scopeCounts.work),
                scopeButton('life', t('filter.life'), scopeCounts.life),
              ),
              error
                ? h(
                    'div',
                    { className: 'dsh-tf-error' },
                    h('span', { style: { flex: 1 } }, error),
                    h('button', { type: 'button', className: 'dsh-tf-btn', onClick: () => loadTodos() }, t('common.retry')),
                  )
                : null,
              h(
                'div',
                { className: 'dsh-tf-list', onClick: refreshAfterClick },
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
                      openItems.map(row),
                    )
                  : null,
                doneItems.length > 0
                  ? h(
                      'section',
                      null,
                      h(
                        'h2',
                        { className: 'dsh-tf-sec' },
                        t('todo.done'),
                        h('span', { className: 'dsh-tf-sec-count' }, doneItems.length),
                        h('button', { type: 'button', className: 'dsh-tf-btn dsh-tf-sec-action', onClick: clearDone }, t('todo.clearDone')),
                      ),
                      doneItems.map(row),
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
