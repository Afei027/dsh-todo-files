/**
 * Host half of the `@local/todo-files` bundle.
 *
 * Owns three things and nothing else:
 *  - the personal todo list, persisted as JSON under `$DSH_HOME/data/dsh-todo-files/todos.json`;
 *  - read-only access to this computer's files for the sidebar panel (list / preview / reveal);
 *  - one HTTP endpoint plus one agent tool, both calling the same operations.
 *
 * The panel in `client.js` is the only consumer of the endpoint; the endpoint is mounted on the
 * owner's browser session (`ctx.connection.requestRejection`) so another local process cannot read
 * files through it.
 *
 * @module @local/todo-files
 */
import { spawn } from 'node:child_process'
import { promises as fsp } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import path from 'node:path'

export const name = 'todo-files'

/** Route mounted on the web carrier for the panel. */
const ROUTE_PATH = '/todo-files/api'
/**
 * Loopback panel token. The bundled client sends it, so the endpoint keeps answering for the
 * desktop window (whose page has no browser session cookie) while a page from another origin still
 * cannot drive it.
 */
const PANEL_TOKEN = 'tf-2f7c9a1e6b8d4c05'
/** Upper bound for one request body. */
const MAX_BODY_BYTES = 1 << 20

const DEFAULTS = {
  dataDir: '',
  requireAuth: true,
}

/**
 * Attach the panel endpoint, the todo store and the agent tool to the live runtime.
 * @param ctx - the plugin context.
 * @param rawConfig - row configuration from `cordis.patch.yml`.
 */
export function apply(ctx, rawConfig) {
  const config = { ...DEFAULTS, ...(rawConfig && typeof rawConfig === 'object' ? rawConfig : {}) }
  const dshHome = process.env.DSH_HOME && String(process.env.DSH_HOME).trim()
    ? path.resolve(String(process.env.DSH_HOME))
    : path.join(os.homedir(), '.dsh')
  const dataDir = config.dataDir ? path.resolve(String(config.dataDir)) : path.join(dshHome, 'data', 'dsh-todo-files')
  const storeFile = path.join(dataDir, 'todos.json')

  /** @type {{ version: number, items: TodoItem[] } | null} */
  let state = null
  /** Tail of the serialized write queue; never rejects. */
  let writeQueue = Promise.resolve()

  // ---------------------------------------------------------------- store

  /**
   * Coerce one stored record into the canonical item shape, dropping unusable rows.
   * @param raw - one decoded record.
   * @returns the normalized item, or null when the record is unusable.
   */
  function normalizeItem(raw) {
    if (!raw || typeof raw !== 'object') return null
    const title = typeof raw.title === 'string' ? raw.title.trim() : ''
    if (!title) return null
    const item = {
      id: typeof raw.id === 'string' && raw.id ? raw.id : randomUUID(),
      title,
      done: raw.done === true,
      category: normalizeCategory(raw.category),
      createdAt: Number(raw.createdAt) || Date.now(),
      updatedAt: Number(raw.updatedAt) || Date.now(),
    }
    const link = normalizeLink(raw.link)
    if (link) item.link = link
    const origin = normalizeOrigin(raw.origin)
    if (origin) item.origin = origin
    const due = normalizeDue(raw.due)
    if (due) item.due = due
    const recurring = normalizeRecurring(raw.recurring)
    if (recurring) item.recurring = recurring
    const tags = normalizeTags(raw.tags)
    if (tags) item.tags = tags
    const parentId = typeof raw.parentId === 'string' && raw.parentId ? raw.parentId : ''
    if (parentId) item.parentId = parentId
    return item
  }

  /**
   * Coerce a tag list: trimmed, de-duplicated, at most six short labels.
   * @param raw - candidate array.
   */
  function normalizeTags(raw) {
    if (!Array.isArray(raw)) return undefined
    const clean = [...new Set(raw.map((tag) => String(tag || '').trim().slice(0, 12)).filter(Boolean))].slice(0, 6)
    return clean.length ? clean : undefined
  }

  /**
   * Coerce a repeat rule: which unit and how many of them.
   * @param raw - `{ freq, interval? }`.
   * @returns `{ freq, interval }`, or null.
   */
  function normalizeRecurring(raw) {
    const source = typeof raw === 'string' ? { freq: raw } : raw && typeof raw === 'object' ? raw : null
    if (!source) return null
    const freq = ['daily', 'weekly', 'monthly'].includes(source.freq) ? source.freq : ''
    if (!freq) return null
    return { freq, interval: Math.max(1, Math.min(12, Number(source.interval) || 1)) }
  }

  /**
   * The next due date after one repeat step, always in the future.
   * @param due - current due date, may be empty.
   * @param recurring - the rule.
   */
  function advanceDue(due, recurring) {
    const pad = (value) => String(value).padStart(2, '0')
    const valid = /^\d{4}-\d{2}-\d{2}$/.test(String(due || ''))
    const base = valid ? new Date(`${due}T00:00:00`) : new Date()
    base.setHours(0, 0, 0, 0)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const step = recurring.interval || 1
    const stepOnce = () => {
      if (recurring.freq === 'daily') base.setDate(base.getDate() + step)
      else if (recurring.freq === 'weekly') base.setDate(base.getDate() + 7 * step)
      else base.setMonth(base.getMonth() + step)
    }
    stepOnce()
    let guard = 0
    while (base.getTime() <= today.getTime() && guard < 60) {
      stepOnce()
      guard += 1
    }
    return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`
  }

  /**
   * Coerce a due date into `YYYY-MM-DD`.
   *
   * A due date is a field, not a phrase inside the title: the panel formats it, colours it by
   * urgency and can sort on it later. Anything unparseable is dropped rather than guessed.
   * @param value - `YYYY-MM-DD`, `YYYY/MM/DD`, or an ISO timestamp.
   * @returns the normalized day, or ''.
   */
  function normalizeDue(value) {
    const text = typeof value === 'string' ? value.trim() : ''
    if (!text) return ''
    const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(text)
    if (!match) return ''
    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    if (month < 1 || month > 12 || day < 1 || day > 31) return ''
    const date = new Date(year, month - 1, day)
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return ''
    const pad = (part) => String(part).padStart(2, '0')
    return `${year}-${pad(month)}-${pad(day)}`
  }

  /**
   * Coerce a category: office work is the default, because every record written before categories
   * existed is an office task.
   * @param value - candidate category.
   * @returns `'work'` or `'life'`.
   */
  function normalizeCategory(value) {
    return value === 'life' ? 'life' : 'work'
  }

  /**
   * Coerce an origin: the Session the todo was created from, so its link can return there.
   * @param raw - candidate origin.
   * @returns `{ sessionId }`, or null.
   */
  function normalizeOrigin(raw) {
    if (!raw || typeof raw !== 'object') return null
    const sessionId = typeof raw.sessionId === 'string' ? raw.sessionId.trim() : ''
    return sessionId ? { sessionId } : null
  }

  /**
   * Coerce a link payload (an absolute path plus its display name and kind).
   * @param raw - candidate link.
   * @returns the normalized link, or null.
   */
  function normalizeLink(raw) {
    if (!raw || typeof raw !== 'object') return null
    const target = typeof raw.path === 'string' ? raw.path.trim() : ''
    if (!target) return null
    const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : path.basename(target) || target
    return { path: target, name, kind: raw.kind === 'dir' ? 'dir' : 'file' }
  }

  /** Deleted items are kept this long so a mistake can be undone the next day. */
  const TRASH_DAYS = 7

  /** The published repository this bundle updates itself from. */
  const REPO_SPEC = 'github:Afei027/dsh-todo-files'
  const REPO_RAW = 'https://raw.githubusercontent.com/Afei027/dsh-todo-files/main/package.json'
  const UPDATE_TTL = 30 * 60 * 1000
  const updateCache = { at: 0, value: null, error: '' }

  /** Compare two dotted numeric versions; positive when `a` is newer. */
  function compareVersions(a, b) {
    const left = String(a || '0').split('.').map((part) => Number(part) || 0)
    const right = String(b || '0').split('.').map((part) => Number(part) || 0)
    for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
      const delta = (left[index] || 0) - (right[index] || 0)
      if (delta) return delta
    }
    return 0
  }

  /**
   * Run one git command inside a checkout.
   * @param cwd - repository directory.
   * @param args - git arguments.
   */
  function runGit(cwd, args) {
    return new Promise((resolve) => {
      let output = ''
      const child = spawn('git', args, { cwd, windowsHide: true })
      child.stdout.on('data', (chunk) => {
        output += chunk
      })
      child.stderr.on('data', (chunk) => {
        output += chunk
      })
      child.on('error', (error) => resolve({ code: -1, output: String(error.message || error) }))
      child.on('close', (code) => resolve({ code, output }))
    })
  }

  /** This package's own version, read once. */
  let ownVersion = ''
  async function localVersion() {
    if (ownVersion) return ownVersion
    try {
      const text = await fsp.readFile(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8')
      ownVersion = String(JSON.parse(text).version || '')
    } catch {
      ownVersion = ''
    }
    return ownVersion
  }

  /** Where this package is installed, resolved once through the plugin manager. */
  const install = { resolved: false, source: '', dir: '', repo: false, enabled: true, version: '' }

  /** Read the installed bundle row (source, version) and whether a linked copy is a git checkout. */
  async function detectInstall() {
    if (install.resolved) return install
    try {
      const manager = ctx.get('pluginManager')
      if (manager && typeof manager.listBundles === 'function') {
        const bundles = await manager.listBundles()
        const row = Array.isArray(bundles) ? bundles.find((entry) => entry && entry.name === 'dsh-todo-files') : null
        if (row) {
          install.source = row.source || (row.installTarget && row.installTarget.spec) || ''
          install.enabled = row.enabled !== false
          install.version = row.version || ''
        }
      }
    } catch (error) {
      warn('could not read the installed bundle row', error)
    }
    if (!install.version) install.version = await localVersion()
    if (/^(link|file|path):/i.test(install.source)) {
      install.dir = install.source.replace(/^(link|file|path):/i, '')
      const gitHead = await fsp.stat(path.join(install.dir, '.git')).catch(() => null)
      install.repo = Boolean(gitHead)
    }
    install.resolved = true
    return install
  }

  /**
   * Answer from the cache; start a background refresh when it is cold or stale, so a panel read
   * never waits on a `git fetch`. The panel polls every six seconds and picks the result up.
   */
  function updateSnapshot() {
    const fresh = updateCache.value && Date.now() - updateCache.at < UPDATE_TTL
    if (!fresh && !updateCache.pending) {
      updateCache.pending = true
      detectInstall()
        .then((found) => remoteVersion(found.repo ? found.dir : ''))
        .catch(() => {})
        .finally(() => {
          updateCache.pending = false
        })
    }
    const latest = updateCache.value || ''
    const current = install.version || ownVersion || ''
    return {
      current,
      latest,
      available: Boolean(latest) && compareVersions(latest, current) > 0 && (!install.dir || install.repo),
      pending: !latest,
    }
  }

  /** The version published on the repository's default branch, cached for a while. */
  async function remoteVersion(gitDir) {
    if (updateCache.value && Date.now() - updateCache.at < UPDATE_TTL) return updateCache
    // A local checkout can ask git, which is the same transport an update would use and is
    // reachable where raw.githubusercontent.com is not.
    if (gitDir) {
      const fetched = await runGit(gitDir, ['fetch', '--quiet', 'origin', 'main'])
      if (fetched.code === 0) {
        const shown = await runGit(gitDir, ['show', 'origin/main:package.json'])
        if (shown.code === 0) {
          try {
            const parsed = JSON.parse(shown.output)
            updateCache.at = Date.now()
            updateCache.value = String(parsed.version || '')
            updateCache.error = ''
            return updateCache
          } catch {
            // fall through to the HTTP route
          }
        }
      }
    }
    try {
      const response = await fetch(REPO_RAW, { signal: AbortSignal.timeout(10000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const parsed = await response.json()
      updateCache.at = Date.now()
      updateCache.value = String(parsed.version || '')
      updateCache.error = ''
    } catch (error) {
      updateCache.error = String((error && error.message) || error)
    }
    return updateCache
  }

  /** Load the store once per process generation. */
  async function loadState() {
    if (state) return state
    let items = []
    let trash = []
    try {
      const text = await fsp.readFile(storeFile, 'utf8')
      const parsed = JSON.parse(text)
      if (parsed && Array.isArray(parsed.items)) {
        items = parsed.items.map(normalizeItem).filter(Boolean)
      }
      if (parsed && Array.isArray(parsed.trash)) {
        const cutoff = Date.now() - TRASH_DAYS * 86400000
        trash = parsed.trash
          .map((entry) => (entry && normalizeItem(entry) ? { ...normalizeItem(entry), deletedAt: Number(entry.deletedAt) || Date.now() } : null))
          .filter((entry) => entry && entry.deletedAt > cutoff)
      }
    } catch (error) {
      if (!error || error.code !== 'ENOENT') warn('could not read the todo store', error)
    }
    state = { version: 2, items: sortItems(items), trash }
    return state
  }

  /** Write the store atomically, keeping the previous generation beside it. */
  async function persist() {
    const payload = JSON.stringify(
      { version: 2, items: state ? state.items : [], trash: state && Array.isArray(state.trash) ? state.trash : [] },
      null,
      2,
    )
    await fsp.mkdir(dataDir, { recursive: true })
    // Keep one previous generation so a bad write or a mistaken import can be rolled back.
    try {
      await fsp.copyFile(storeFile, `${storeFile}.bak`)
    } catch (error) {
      if (!error || error.code !== 'ENOENT') warn('could not refresh the backup', error)
    }
    const temp = `${storeFile}.${process.pid}.tmp`
    await fsp.writeFile(temp, payload, 'utf8')
    await fsp.rename(temp, storeFile)
  }

  /**
   * Run one store mutation after every earlier one, so concurrent panel clicks and tool calls
   * cannot interleave a read-modify-write.
   * @param task - the mutation.
   * @returns the mutation's own result.
   */
  function enqueue(task) {
    const next = writeQueue.then(task, task)
    writeQueue = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }

  /**
   * Sort open items first (newest first), completed items last (most recently touched first).
   * @param items - items to order.
   */
  function sortItems(items) {
    return items.slice().sort((left, right) => {
      if (left.done !== right.done) return left.done ? 1 : -1
      const key = left.done ? right.updatedAt - left.updatedAt : right.createdAt - left.createdAt
      if (key !== 0) return key
      return left.title.localeCompare(right.title)
    })
  }

  /**
   * Find one item by id.
   * @param id - item id.
   */
  function findItem(id) {
    const key = typeof id === 'string' ? id : ''
    return state ? state.items.find((item) => item.id === key) : undefined
  }

  // ---------------------------------------------------------------- errors

  /**
   * Build a failure carrying a friendly message and an optional HTTP status.
   * @param message - user-facing text.
   * @param status - HTTP status the route should answer with.
   */
  function fail(message, status = 400) {
    const error = new Error(message)
    error.status = status
    return error
  }

  /**
   * Report a host-side problem without taking the plugin down.
   * @param message - what failed.
   * @param error - the underlying error.
   */
  function warn(message, error) {
    try {
      const logger = typeof ctx.get === 'function' ? ctx.get('logger') : undefined
      if (logger && typeof logger.warn === 'function') logger.warn(`[todo-files] ${message}`, error)
    } catch {
      // logging must never be the reason a request fails
    }
  }

  /**
   * Turn any thrown value into one line of text.
   * @param error - the thrown value.
   */
  function messageOf(error) {
    if (!error) return 'unknown error'
    if (error.code === 'ENOENT') return '路径不存在'
    if (error.code === 'ENOTDIR') return '这不是文件夹'
    if (error.code === 'EACCES' || error.code === 'EPERM') return '没有权限访问这个位置'
    if (error.code === 'EBUSY') return '文件被其他程序占用'
    if (typeof error.message === 'string' && error.message) return error.message
    return String(error)
  }

  // ---------------------------------------------------------------- todos

  const ops = {
    /** @returns every todo in display order. */
    async 'todos.list'() {
      await loadState()
      return {
        items: state.items.map((item) => ({ ...item })),
        trashCount: Array.isArray(state.trash) ? state.trash.length : 0,
        update: updateSnapshot(),
      }
    },

    /**
     * Append one todo.
     * @param payload - `{ title, link?, category?, origin?, due? }`.
     */
    async 'todos.add'(payload) {
      const title = String((payload && payload.title) || '').trim()
      if (!title) throw fail('待办内容不能为空')
      const link = normalizeLink(payload && payload.link)
      const origin = normalizeOrigin(payload && payload.origin)
      const category = normalizeCategory(payload && payload.category)
      const due = normalizeDue(payload && payload.due)
      const recurring = normalizeRecurring(payload && payload.recurring)
      const tags = normalizeTags(payload && payload.tags)
      const parentId = typeof (payload && payload.parentId) === 'string' ? payload.parentId : ''
      return enqueue(async () => {
        await loadState()
        const now = Date.now()
        const item = { id: randomUUID(), title: title.slice(0, 800), done: false, category, createdAt: now, updatedAt: now }
        if (parentId && !state.items.some((entry) => entry.id === parentId)) throw fail('父任务已经不在了', 404)
        if (parentId) item.parentId = parentId
        if (link) item.link = link
        if (origin) item.origin = origin
        if (due) item.due = due
        if (recurring) item.recurring = recurring
        if (tags) item.tags = tags
        state.items = sortItems([...state.items, item])
        await persist()
        return { item: { ...item } }
      })
    },

    /**
     * Patch one todo (title, done, category, due, or the linked path).
     * @param payload - `{ id, patch: { title?, done?, category?, due?, link? } }`.
     */
    async 'todos.update'(payload) {
      const id = String((payload && payload.id) || '')
      const patch = (payload && payload.patch) || {}
      return enqueue(async () => {
        await loadState()
        const item = findItem(id)
        if (!item) throw fail('这条待办已经不在了', 404)
        if (typeof patch.title === 'string') {
          const title = patch.title.trim()
          if (!title) throw fail('待办内容不能为空')
          item.title = title.slice(0, 800)
        }
        if (typeof patch.done === 'boolean') {
          const wasDone = item.done
          item.done = patch.done
          // Completing a repeating todo spawns the next occurrence instead of losing the habit.
          if (!wasDone && item.done && item.recurring) {
            const now = Date.now()
            const next = { ...item, id: randomUUID(), done: false, createdAt: now, updatedAt: now }
            next.due = advanceDue(item.due, item.recurring)
            state.items.push(next)
          }
        }
        if (typeof patch.category === 'string') item.category = normalizeCategory(patch.category)
        if (Object.prototype.hasOwnProperty.call(patch, 'due')) {
          const due = normalizeDue(patch.due)
          if (due) item.due = due
          else delete item.due
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'recurring')) {
          const recurring = normalizeRecurring(patch.recurring)
          if (recurring) item.recurring = recurring
          else delete item.recurring
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'tags')) {
          const tags = normalizeTags(patch.tags)
          if (tags) item.tags = tags
          else delete item.tags
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'parentId')) {
          const parentId = typeof patch.parentId === 'string' ? patch.parentId : ''
          if (parentId && parentId !== item.id && state.items.some((entry) => entry.id === parentId)) item.parentId = parentId
          else delete item.parentId
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'origin')) {
          const origin = normalizeOrigin(patch.origin)
          if (origin) item.origin = origin
          else delete item.origin
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'link')) {
          if (patch.link === null) delete item.link
          else {
            const link = normalizeLink(patch.link)
            if (!link) throw fail('附件路径无效')
            item.link = link
          }
        }
        item.updatedAt = Date.now()
        state.items = sortItems(state.items)
        await persist()
        return { item: { ...item } }
      })
    },

    /**
     * Soft-delete one todo: it moves to the trash and stays recoverable for seven days.
     * @param payload - `{ id }`.
     */
    async 'todos.remove'(payload) {
      const id = String((payload && payload.id) || '')
      return enqueue(async () => {
        await loadState()
        const item = state.items.find((entry) => entry.id === id)
        if (!item) throw fail('这条待办已经不在了', 404)
        // A parent takes its subtasks with it, so the tree never loses its root.
        const doomed = new Set()
        const collect = (target) => {
          doomed.add(target)
          for (const child of state.items) if (child.parentId === target) collect(child.id)
        }
        collect(id)
        const now = Date.now()
        const removed = state.items.filter((entry) => doomed.has(entry.id)).map((entry) => ({ ...entry, deletedAt: now }))
        state.items = state.items.filter((entry) => !doomed.has(entry.id))
        state.trash = [...removed, ...(state.trash || [])].slice(0, 200)
        await persist()
        return { removed: id, trashed: true, cascaded: removed.length - 1 }
      })
    },

    /** List what is currently in the trash. */
    async 'todos.trash'() {
      await loadState()
      const cutoff = Date.now() - TRASH_DAYS * 86400000
      state.trash = (state.trash || []).filter((entry) => entry.deletedAt > cutoff)
      return { items: state.trash.slice(), days: TRASH_DAYS }
    },

    /**
     * Put one trashed todo back on the list.
     * @param payload - `{ id }`.
     */
    async 'todos.restore'(payload) {
      const id = String((payload && payload.id) || '')
      return enqueue(async () => {
        await loadState()
        const entry = (state.trash || []).find((item) => item.id === id)
        if (!entry) throw fail('回收站里没有这条', 404)
        state.trash = (state.trash || []).filter((item) => item.id !== id)
        const { deletedAt, ...restored } = entry
        state.items = sortItems([{ ...restored, updatedAt: Date.now() }, ...state.items])
        await persist()
        return { item: restored }
      })
    },

    /**
     * Delete permanently: one entry when `id` is given, the whole trash otherwise.
     * @param payload - `{ id? }`.
     */
    async 'todos.purge'(payload) {
      const id = String((payload && payload.id) || '')
      return enqueue(async () => {
        await loadState()
        const before = (state.trash || []).length
        state.trash = id ? (state.trash || []).filter((item) => item.id !== id) : []
        if (id && state.trash.length === before) throw fail('回收站里没有这条', 404)
        await persist()
        return { removed: before - state.trash.length }
      })
    },

    /**
     * Report whether the published repository carries a newer version than the one installed.
     * A locally linked install (development) never reports an update, because applying one would
     * replace the working copy with a downloaded tarball.
     */
    async 'update.check'() {
      const install = await detectInstall()
      const latest = (await remoteVersion(install.repo ? install.dir : '')).value || ''
      return {
        current: install.version,
        latest,
        source: install.source,
        linked: Boolean(install.dir),
        linkedRepo: install.repo,
        enabled: install.enabled,
        available: Boolean(latest) && compareVersions(latest, install.version) > 0 && (!install.dir || install.repo),
        error: latest ? '' : updateCache.error,
      }
    },

    /** Install the published version over the current one (a git checkout is pulled instead). */
    async 'update.apply'() {
      const install = await detectInstall()
      if (install.repo && install.dir) {
        const result = await runGit(install.dir, ['pull', '--ff-only'])
        if (result.code !== 0) throw fail(`拉取失败：${String(result.output || 'git 拒绝了这次更新').slice(-400)}`, 409)
        ownVersion = ''
        install.version = await localVersion()
        updateCache.at = 0
        return { application: 'restart-required', version: install.version, warnings: [], via: 'git-pull' }
      }
      const manager = ctx.get('pluginManager')
      if (!manager || typeof manager.installBundle !== 'function') throw fail('这个版本的 DSH 不支持插件自更新', 501)
      const result = await manager.installBundle(REPO_SPEC, { enabled: true })
      updateCache.at = 0
      return {
        application: result && result.application,
        version: result && result.version,
        warnings: (result && result.warnings) || [],
        error: result && result.error,
        via: 'installBundle',
      }
    },

    /** Drop every completed todo. */
    async 'todos.clearDone'() {
      return enqueue(async () => {
        await loadState()
        const before = state.items.length
        state.items = state.items.filter((item) => !item.done)
        await persist()
        return { removed: before - state.items.length }
      })
    },

    /** Hand the whole list out as portable JSON. */
    async 'todos.export'() {
      await loadState()
      return {
        json: JSON.stringify({ version: 1, exportedAt: Date.now(), items: state.items }, null, 2),
        count: state.items.length,
      }
    },

    /**
     * Replace the list from exported JSON, after validating every record.
     * @param payload - `{ json }`.
     */
    async 'todos.import'(payload) {
      const text = String((payload && payload.json) || '')
      let decoded
      try {
        decoded = JSON.parse(text)
      } catch {
        throw fail('这个文件不是有效的 JSON')
      }
      const raw = Array.isArray(decoded) ? decoded : decoded && Array.isArray(decoded.items) ? decoded.items : null
      if (!raw) throw fail('文件里没有 items 数组')
      const incoming = raw.map(normalizeItem).filter(Boolean)
      if (!incoming.length) throw fail('文件里没有任何可用的待办')
      return enqueue(async () => {
        await loadState()
        const previous = state.items.length
        state.items = sortItems(incoming)
        await persist()
        return { imported: state.items.length, replaced: previous }
      })
    },

    // -------------------------------------------------------------- files

    /**
     * Reveal one file or folder in the operating system's file manager.
     * @param payload - `{ path }`.
     */
    async 'fs.reveal'(payload) {
      const target = resolvePath(payload && payload.path)
      const stat = await safeStat(target)
      if (!stat) throw fail('路径不存在', 404)
      const isDirectory = stat.isDirectory()
      const outcome = await revealInFileManager(target, isDirectory)
      return { path: target, kind: isDirectory ? 'dir' : 'file', via: outcome.via }
    },
  }

  /**
   * Hand one path to the operating system's file manager.
   *
   * Inside the desktop app the Host belongs to an Electron process, whose own `shell` API is the
   * reliable route: it resolves the Explorer quirks a bare spawn runs into. Plain Node — a `dsh web`
   * profile — falls back to the platform launcher, and this time failure is reported instead of
   * being swallowed by an unobserved child event.
   * @param target - absolute path.
   * @param isDirectory - whether the path is a folder.
   * @returns which route performed the reveal.
   */
  async function revealInFileManager(target, isDirectory) {
    try {
      const electron = await import('electron').catch(() => null)
      const shell = electron && (electron.shell || (electron.default && electron.default.shell))
      if (shell && typeof shell.showItemInFolder === 'function') {
        if (isDirectory && typeof shell.openPath === 'function') {
          const failure = await shell.openPath(target)
          if (!failure) return { via: 'electron.openPath' }
          warn('electron openPath refused the folder', failure)
        } else {
          shell.showItemInFolder(target)
          return { via: 'electron.showItemInFolder' }
        }
      }
    } catch (error) {
      warn('the electron shell was unavailable', error)
    }
    const command =
      process.platform === 'win32'
        ? { file: 'explorer.exe', args: [isDirectory ? target : `/select,${target}`] }
        : process.platform === 'darwin'
          ? { file: 'open', args: [isDirectory ? target : path.dirname(target)] }
          : { file: 'xdg-open', args: [isDirectory ? target : path.dirname(target)] }
    await new Promise((resolve, reject) => {
      const child = spawn(command.file, command.args, { detached: true, stdio: 'ignore' })
      child.once('error', reject)
      child.once('spawn', () => {
        child.unref()
        resolve()
      })
    })
    return { via: command.file }
  }

  /**
   * Resolve a user-supplied path; omitted or blank means the home directory.
   * @param value - raw path from the panel or a tool argument.
   */
  function resolvePath(value) {
    const text = typeof value === 'string' ? value.trim() : ''
    if (!text) return os.homedir()
    return path.resolve(text)
  }

  /**
   * Stat a path without throwing for a missing or unreadable one.
   * @param target - absolute path.
   */
  async function safeStat(target) {
    try {
      return await fsp.stat(target)
    } catch {
      return null
    }
  }

  // ---------------------------------------------------------------- HTTP

  /**
   * Read and decode one JSON request body. A request whose body an upstream already drained
   * resolves empty instead of waiting for events that will never fire again.
   * @param request - the incoming request.
   */
  function readJson(request) {
    return new Promise((resolve, reject) => {
      if (request.readableEnded) {
        resolve({})
        return
      }
      const chunks = []
      let size = 0
      request.on('data', (chunk) => {
        size += chunk.length
        if (size > MAX_BODY_BYTES) {
          reject(fail('请求内容过大', 413))
          request.destroy()
          return
        }
        chunks.push(chunk)
      })
      request.on('end', () => {
        if (!chunks.length) {
          resolve({})
          return
        }
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          resolve(parsed && typeof parsed === 'object' ? parsed : {})
        } catch {
          reject(fail('请求内容不是有效的 JSON', 400))
        }
      })
      request.on('error', reject)
    })
  }

  /**
   * Answer one `POST <ROUTE_PATH>` request from the panel.
   *
   * The operation and its arguments ride the query string, so the handler never depends on the
   * request body arriving; a body is still accepted for callers that send one.
   * @param request - the incoming request.
   * @param response - the outgoing response.
   */
  async function handleHttp(request, response) {
    const send = (status, body) => {
      try {
        response.writeHead(status, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        })
        response.end(JSON.stringify(body))
      } catch {
        // the client may already be gone
      }
    }
    const trace = (line) => {
      fsp.appendFile(path.join(dataDir, 'access.log'), `${new Date().toISOString()} ${line}\n`).catch(() => {})
    }
    let op = ''
    try {
      if (request.method === 'OPTIONS') {
        response.writeHead(204, { 'cache-control': 'no-store' })
        response.end()
        return
      }
      trace(`hit ${request.method} ${request.url}`)
      // The bundled key is public in a shared plugin, so refuse a browser request that says it came
      // from another site before the key is even considered. The desktop bridge sends no such header.
      const fetchSite = request.headers['sec-fetch-site']
      if (typeof fetchSite === 'string' && fetchSite.toLowerCase() === 'cross-site') {
        trace('reject cross-site')
        send(403, { ok: false, error: '这个请求来自其他站点，已拒绝' })
        return
      }
      let url = null
      try {
        url = new URL(request.url || '/', 'http://127.0.0.1')
      } catch {
        url = null
      }
      const keyOk = !!url && url.searchParams.get('key') === PANEL_TOKEN
      if (config.requireAuth !== false && !keyOk) {
        const connection = typeof ctx.get === 'function' ? ctx.get('connection') : undefined
        if (connection && typeof connection.requestRejection === 'function') {
          const rejection = connection.requestRejection({ headers: request.headers })
          if (rejection) {
            trace(`reject auth ${rejection}`)
            send(rejection, { ok: false, error: '这个请求没有通过当前浏览器会话的校验' })
            return
          }
        }
      }
      if (request.method !== 'POST') {
        send(405, { ok: false, error: '只接受 POST' })
        return
      }
      op = url ? url.searchParams.get('op') || '' : ''
      const rawArgs = url ? url.searchParams.get('args') : null
      let payload = {}
      if (rawArgs) {
        try {
          const decoded = JSON.parse(rawArgs)
          if (decoded && typeof decoded === 'object') payload = decoded
        } catch {
          throw fail('参数不是有效的 JSON', 400)
        }
        payload.op = op
      } else {
        payload = await readJson(request)
        op = typeof payload.op === 'string' ? payload.op : ''
      }
      const run = Object.prototype.hasOwnProperty.call(ops, op) ? ops[op] : undefined
      if (!run) {
        trace(`miss ${op || '(空)'}`)
        send(404, { ok: false, error: `未知操作：${op || '(空)'}` })
        return
      }
      const value = await run(payload)
      const count = value && Array.isArray(value.items) ? value.items.length : undefined
      const via = value && typeof value.via === 'string' ? ` via=${value.via}` : ''
      trace(`ok ${op}${count === undefined ? '' : ` items=${count}`}${via}`)
      send(200, { ok: true, value })
    } catch (error) {
      trace(`error ${op} ${messageOf(error)}`)
      const status = error && typeof error.status === 'number' ? error.status : 400
      send(status, { ok: false, error: messageOf(error) })
    }
  }

  const route = { kind: 'prefix', path: ROUTE_PATH, handler: handleHttp }
  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], (inner) => {
      inner.effect(() => inner.webServer.register(route))
    })
  } else {
    const server = typeof ctx.get === 'function' ? ctx.get('webServer') : undefined
    if (server) ctx.effect(() => server.register(route))
  }

  // Warm the update check once at startup, so the panel learns about a new version on first open
  // instead of waiting for the fetch after the user has already looked at the header.
  detectInstall()
    .then((found) => remoteVersion(found.repo ? found.dir : ''))
    .catch(() => {})

  // ---------------------------------------------------------------- tool

  const todoTool = {
    name: 'personal_todos',
    description: [
      'Read and change the personal todo list that the DSH sidebar panel shows.',
      'This list is shared with the user and separate from the session-scoped todo_write plan.',
      'Use `action: "list"` before claiming what is on it, and "add" when the user asks to be reminded of something.',
      'Every item belongs to `work` (办公任务) or `life` (个人生活); pick the one the user implies, and ask only when it is genuinely unclear.',
      'An item may carry ONE linked path — a file or folder on this computer.',
      'An item may carry a `due` date (YYYY-MM-DD). Put the deadline there, never inside the title: the panel renders it as a dated label and colours it by urgency.',
    ].join(' '),
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'add', 'update', 'remove', 'clear_done'],
          description: 'list | add | update | remove | clear_done.',
        },
        title: {
          type: 'string',
          description: 'The todo text. Required for `add`, optional for `update`.',
        },
        id: {
          type: 'string',
          description: 'The item id from `list`. Required for `update` and `remove`.',
        },
        done: {
          type: 'boolean',
          description: 'New completion state for `update`.',
        },
        category: {
          type: 'string',
          enum: ['work', 'life'],
          description: 'work = 办公任务, life = 个人生活. Required for `add`; optional for `update`.',
        },
        path: {
          type: 'string',
          description: 'Absolute path to a file or folder on this computer to link. Empty string clears the link.',
        },
        kind: {
          type: 'string',
          enum: ['file', 'dir'],
          description: 'What the linked path is; `file` when omitted.',
        },
        due: {
          type: 'string',
          description:
            'Deadline as YYYY-MM-DD (empty string clears it). Pass the day here instead of writing it inside the title — the panel renders it as a dated label.',
        },
        recurring: {
          type: 'string',
          enum: ['', 'daily', 'weekly', 'monthly'],
          description:
            'Repeat rule for habits: daily / weekly / monthly (empty string clears it). Completing the todo then creates the next occurrence automatically.',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Free-form labels (at most six, 12 chars each) for grouping, e.g. ["引隆", "招标"].',
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['text'],
        properties: {
          text: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: String(value && value.text ? value.text : '') }],
    },
    presentCall: (args) => ({
      card: 'generic',
      title: 'Personal todos',
      kind: 'other',
      rawInput: args,
    }),
    async execute(args, exec) {
      const input = args && typeof args === 'object' ? args : {}
      const action = typeof input.action === 'string' ? input.action : 'list'
      // The calling agent's Session is the todo's origin, so its card can send the user back there.
      const origin = exec && exec.agent && exec.agent.id ? { sessionId: String(exec.agent.id) } : undefined
      const text = (value) => ({ text: value })
      const describe = (item) => {
        const mark = item.done ? '[x]' : '[ ]'
        const scope = item.category === 'life' ? '[生活]' : '[办公]'
        const due = item.due ? ` 截止 ${item.due}` : ''
        const link = item.link ? ` → ${item.link.path}` : ''
        return `${mark} ${scope} ${item.title}${due}${link}${item.done ? '' : `  (id: ${item.id})`}`
      }
      if (action === 'list') {
        const value = await ops['todos.list']()
        if (!value.items.length) return text('The personal todo list is empty.')
        const open = value.items.filter((item) => !item.done)
        const done = value.items.filter((item) => item.done)
        const work = open.filter((item) => item.category !== 'life').length
        const life = open.length - work
        const lines = [`Personal todos — ${open.length} open (${work} work, ${life} life), ${done.length} done.`]
        for (const item of [].concat(open, done)) lines.push(describe(item))
        return text(lines.join('\n'))
      }
      if (action === 'add') {
        const value = await ops['todos.add']({
          title: input.title,
          category: input.category === 'life' ? 'life' : 'work',
          origin,
          due: typeof input.due === 'string' ? input.due : undefined,
          recurring: typeof input.recurring === 'string' ? input.recurring : undefined,
          tags: Array.isArray(input.tags) ? input.tags : undefined,
          link: typeof input.path === 'string' && input.path.trim()
            ? { path: input.path.trim(), kind: input.kind === 'dir' ? 'dir' : 'file' }
            : undefined,
        })
        return text(`Added: ${describe(value.item)}`)
      }
      if (action === 'update') {
        const patch = {}
        if (typeof input.title === 'string' && input.title.trim()) patch.title = input.title
        if (typeof input.done === 'boolean') patch.done = input.done
        if (input.category === 'work' || input.category === 'life') patch.category = input.category
        if (typeof input.due === 'string') patch.due = input.due
        if (typeof input.recurring === 'string') patch.recurring = input.recurring
        if (Array.isArray(input.tags)) patch.tags = input.tags
        if (typeof input.path === 'string') {
          patch.link = input.path.trim()
            ? { path: input.path.trim(), kind: input.kind === 'dir' ? 'dir' : 'file' }
            : null
        }
        if (!Object.keys(patch).length) return text('Nothing to update: pass title, done, category, due, or path.')
        const value = await ops['todos.update']({ id: input.id, patch })
        return text(`Updated: ${describe(value.item)}`)
      }
      if (action === 'remove') {
        await ops['todos.remove']({ id: input.id })
        return text(`Removed todo ${String(input.id || '')}.`)
      }
      if (action === 'clear_done') {
        const value = await ops['todos.clearDone']()
        return text(`Removed ${value.removed} completed todo(s).`)
      }
      return text(`Unknown action: ${action}`)
    },
  }

  if (typeof ctx.inject === 'function') {
    ctx.inject(['tools'], (inner) => {
      inner.effect(() => inner.tools.register(todoTool))
    })
  } else {
    const tools = typeof ctx.get === 'function' ? ctx.get('tools') : undefined
    if (tools) ctx.effect(() => tools.register(todoTool))
  }
}
