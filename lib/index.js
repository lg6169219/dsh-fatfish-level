/**
 * dsh-fatfish-level · DSH 插件服务端半区
 *
 * 做三件事：
 *  1. 监听本机所有会话的 assistant/message，把真实 token 用量记进账本；
 *  2. 只读 HTTP 接口 `/dsh-fatfish-level/state.json` 吐当前等级与进度；
 *  3. 往 index 页面注入一小段脚本，在右下角挂出「大肥鱼 Lv.N」铭牌。
 *
 * 注入走两条通道：Web 形态用 tapIndex；桌面壳的 index.html 不经过 tapIndex，
 * 用 `webserver/index-inject` 的结构化行（内联脚本自己建 script，加载失败静默）。
 */
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createStore } from './store.js'
import { formatTokens } from './levels.js'

const PLUGIN_NAME = 'dsh-fatfish-level'
const BASE = '/dsh-fatfish-level'
const SCRIPT_PATH = `${BASE}/client.js`
const STATE_PATH = `${BASE}/state.json`
const CLIENT_FILE = fileURLToPath(new URL('./client.js', import.meta.url))

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
}
const JS_HEADERS = {
  'Content-Type': 'text/javascript; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
}

// 桌面端结构化注入行：内联脚本自己建 script，路由不在时静默失败，绝不拖垮页面启动。
const DESKTOP_ROW_TEXT =
  'try{var s=document.createElement("script");s.defer=true;s.src="' + SCRIPT_PATH +
  '";s.onerror=function(){};document.body.appendChild(s)}catch(e){}'

const WEB_TAG = `<script defer src="${SCRIPT_PATH}"></script>`

function sendJson(res, status, payload) {
  let body
  try {
    body = JSON.stringify(payload)
  } catch (err) {
    body = JSON.stringify({ ok: false, error: 'encode failed' })
  }
  res.writeHead(status, { ...JSON_HEADERS, 'Content-Length': Buffer.byteLength(body) })
  res.end(body)
}

function sendScript(req, res, body) {
  res.writeHead(200, { ...JS_HEADERS, 'Content-Length': body.length })
  res.end(req.method === 'HEAD' ? undefined : body)
}

/**
 * 同源路由的信任栅栏：Web 形态有 connection 服务时，先过 Host/Origin 与浏览器凭据检查。
 * 测试/桌面 IPC 没有该服务时保持原来的只读行为，不额外拒绝。
 */
function rejectUntrusted(ctx, req, res, log) {
  try {
    const connection = typeof ctx.get === 'function' ? ctx.get('connection') : undefined
    if (!connection || typeof connection.requestRejection !== 'function') return false
    const rejection = connection.requestRejection(req)
    if (rejection) {
      res.writeHead(rejection)
      res.end()
      return true
    }
  } catch (err) {
    log('connection fence skipped:', err && err.message)
  }
  return false
}

/**
 * @param {{ home?: string, now?: () => number, log?: (...args: unknown[]) => void }} [options]
 */
export function createPlugin(options = {}) {
  const log = options.log || ((...args) => console.info(`[${PLUGIN_NAME}]`, ...args))

  return {
    name: PLUGIN_NAME,

    apply(root) {
      const store = createStore({ home: options.home, now: options.now, log })
      try {
        store.init()
      } catch (err) {
        log('store init failed:', err && err.message)
      }

      let clientCache = { mtime: 0, size: -1, body: null }

      function readClientBody() {
        try {
          const stat = fs.statSync(CLIENT_FILE)
          if (clientCache.body && clientCache.mtime === stat.mtimeMs && clientCache.size === stat.size) {
            return clientCache.body
          }
          const body = fs.readFileSync(CLIENT_FILE)
          clientCache = { mtime: stat.mtimeMs, size: stat.size, body }
          return body
        } catch (err) {
          log('client bundle missing:', err && err.message)
          clientCache = {
            mtime: 0,
            size: -1,
            body: Buffer.from('/* dsh-fatfish-level client missing */', 'utf8'),
          }
          return clientCache.body
        }
      }

      // 桌面壳唯一的注入通道；注册必须早，不等任何服务。
      const rowDisposers = []
      try {
        root.effect(() => () => {
          for (const dispose of rowDisposers) {
            try { dispose() } catch (err) { /* already disposed */ }
          }
        })
        rowDisposers.push(root.on('webserver/index-inject', (table) => {
          try {
            if (!Array.isArray(table)) return
            for (const row of table) {
              if (!row) continue
              if (row.kind === 'script-src' && row.src === SCRIPT_PATH) return
              if (row.kind === 'script' && typeof row.text === 'string' && row.text.includes(SCRIPT_PATH)) return
            }
            table.push({ kind: 'script', placement: 'body', text: DESKTOP_ROW_TEXT })
          } catch (err) { /* table is not ours */ }
        }))
      } catch (err) {
        log('index-inject unavailable:', err && err.message)
      }

      // 等 webServer 就绪后，注册路由、订阅会话事件、挂 Web 注入。
      root.inject(['webServer'], (ctx) => {
        const disposers = []

        try {
          disposers.push(ctx.webServer.register({
            kind: 'exact',
            path: STATE_PATH,
            handler: (req, res) => {
              if (rejectUntrusted(ctx, req, res, log)) return
              if (req.method !== 'GET' && req.method !== 'HEAD') {
                sendJson(res, 405, { ok: false, error: 'method not allowed' })
                return
              }
              try {
                const payload = store.snapshot()
                if (req.method === 'HEAD') {
                  res.writeHead(200, JSON_HEADERS)
                  res.end()
                  return
                }
                sendJson(res, 200, payload)
              } catch (err) {
                log('state failed:', err && err.message)
                sendJson(res, 500, { ok: false, error: 'state unavailable' })
              }
            },
          }))
        } catch (err) {
          log('state route failed:', err && err.message)
        }

        try {
          disposers.push(ctx.webServer.register({
            kind: 'exact',
            path: SCRIPT_PATH,
            handler: (req, res) => {
              if (rejectUntrusted(ctx, req, res, log)) return
              if (req.method !== 'GET' && req.method !== 'HEAD') {
                sendJson(res, 405, { ok: false, error: 'method not allowed' })
                return
              }
              try {
                sendScript(req, res, readClientBody())
              } catch (err) {
                log('client serve failed:', err && err.message)
                res.writeHead(500, JS_HEADERS)
                res.end('')
              }
            },
          }))
        } catch (err) {
          log('client route failed:', err && err.message)
        }

        try {
          disposers.push(ctx.webServer.tapIndex((html) => {
            if (typeof html !== 'string') return html
            if (html.includes(SCRIPT_PATH)) return html
            if (html.includes('</body>')) return html.replace('</body>', `${WEB_TAG}</body>`)
            return html + WEB_TAG
          }))
        } catch (err) {
          log('tapIndex unavailable:', err && err.message)
        }

        try {
          disposers.push(ctx.on('session/event', (session, event) => {
            try {
              store.record(session, event)
            } catch (err) {
              log('record failed:', err && err.message)
            }
          }))
        } catch (err) {
          log('session events unavailable:', err && err.message)
        }

        try {
          ctx.effect(() => () => {
            for (const dispose of disposers) {
              try { dispose() } catch (err) { /* already disposed */ }
            }
            store.flush()
          })
        } catch (err) {
          log('cleanup registration failed:', err && err.message)
        }

        try {
          const snap = store.snapshot()
          log(`ready · 累计 ${formatTokens(snap.total)} tokens · Lv.${snap.level.lv} ${snap.level.name}`)
        } catch (err) {
          log('ready (snapshot failed):', err && err.message)
        }
      })
    },
  }
}

export default createPlugin()
