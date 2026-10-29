import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createPlugin } from '../lib/index.js'

const NOW = new Date('2026-10-27T02:00:00.000Z').getTime()

function tempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dshf-plugin-'))
}

function response() {
  return {
    statusCode: 0,
    headers: null,
    body: '',
    writeHead(code, headers) {
      this.statusCode = code
      this.headers = headers || {}
      return this
    },
    end(body) {
      if (body === undefined || body === null) return
      this.body = Buffer.isBuffer(body) ? body.toString('utf8') : String(body)
    },
  }
}

function boot(home, extra = {}) {
  const routes = new Map()
  const taps = []
  const listeners = new Map()
  const disposers = []
  const rows = []
  let cleanup = null

  const webServer = {
    register(route) {
      routes.set(route.path, route)
      return () => routes.delete(route.path)
    },
    tapIndex(fn) {
      taps.push(fn)
      return () => {
        const index = taps.indexOf(fn)
        if (index >= 0) taps.splice(index, 1)
      }
    },
  }

  const services = extra.services || new Map([
    ['connection', { requestRejection: () => undefined }],
  ])

  const ctx = {
    webServer,
    get(name) {
      return services.get ? services.get(name) : undefined
    },
    on(event, cb) {
      listeners.set(event, cb)
      return () => listeners.delete(event)
    },
    effect(fn) {
      cleanup = fn()
    },
  }

  const root = {
    inject(names, cb) {
      assert.deepEqual(names, ['webServer'])
      cb(ctx)
    },
    on(event, cb) {
      if (event === 'webserver/index-inject') {
        cb(rows)
        return () => {}
      }
      listeners.set(event, cb)
      return () => listeners.delete(event)
    },
    effect(fn) {
      cleanup = fn()
    },
  }

  const plugin = createPlugin({ home, now: () => NOW, log: () => {}, ...extra })
  plugin.apply(root)

  return {
    plugin,
    routes,
    taps,
    listeners,
    rows,
    get route() {
      return routes.get('/dsh-fatfish-level/state.json')
    },
    get clientRoute() {
      return routes.get('/dsh-fatfish-level/client.js')
    },
    fire(event, session = { id: 's1' }) {
      const cb = listeners.get('session/event')
      assert.ok(cb, 'session/event listener registered')
      cb(session, event)
    },
    dispose() {
      if (cleanup) cleanup()
    },
  }
}

test('服务端注册状态接口、脚本与两条 index 注入通道', () => {
  const home = tempHome()
  const app = boot(home)

  assert.ok(app.route, 'state route registered')
  assert.ok(app.clientRoute, 'client route registered')
  assert.equal(app.rows.length, 1)
  assert.equal(app.rows[0].kind, 'script')
  assert.ok(app.rows[0].text.includes('/dsh-fatfish-level/client.js'))

  const html = app.taps[0]('<html><body><div id="app"></div></body></html>')
  assert.ok(html.includes('/dsh-fatfish-level/client.js'))
  // 幂等：再注入一次不会重复
  const again = app.taps[0](html)
  assert.equal(again.match(/dsh-fatfish-level\/client\.js/g).length, 1)
})

test('有 connection 服务时，两个只读路由都先过信任栅栏', () => {
  const home = tempHome()
  const services = new Map([
    ['connection', { requestRejection: () => 401 }],
  ])
  const app = boot(home, { services })

  for (const route of [app.route, app.clientRoute]) {
    const res = response()
    route.handler({ method: 'GET', headers: {} }, res)
    assert.equal(res.statusCode, 401)
    assert.equal(res.body, '')
  }
})

test('没有 connection 服务时失败关闭，不裸奔状态数据', () => {
  const home = tempHome()
  const app = boot(home, { services: new Map() })

  for (const route of [app.route, app.clientRoute]) {
    const res = response()
    route.handler({ method: 'GET', headers: {} }, res)
    assert.equal(res.statusCode, 503)
    assert.match(res.body, /connection trust unavailable/)
  }
})

test('状态接口吐等级、进度与阶梯，且拒绝写方法', () => {
  const home = tempHome()
  fs.writeFileSync(
    path.join(home, '.dshw-usage.json'),
    JSON.stringify({ events: [{ ts: 1, day: '2026-10-26', model: 'deepseek-flash', tokens: 420_000_000 }] }),
    'utf8'
  )
  const app = boot(home)

  const res = response()
  app.route.handler({ method: 'GET', url: '/dsh-fatfish-level/state.json' }, res)
  assert.equal(res.statusCode, 200)
  assert.match(res.headers['Content-Type'], /application\/json/)
  const payload = JSON.parse(res.body)
  assert.equal(payload.ok, true)
  assert.equal(payload.total, 420_000_000)
  assert.equal(payload.level.lv, 7)
  assert.equal(payload.level.name, '胖头鲸')
  assert.equal(payload.level.next.lv, 8)
  assert.equal(payload.ladder.length, 14)
  assert.equal(payload.ladder.filter((row) => row.current).length, 1)

  const denied = response()
  app.route.handler({ method: 'POST', url: '/dsh-fatfish-level/state.json' }, denied)
  assert.equal(denied.statusCode, 405)
})

test('实时事件进账，刷新状态立即可见', () => {
  const home = tempHome()
  const app = boot(home)

  app.fire({ type: 'assistant/message', data: { turn: 1, usage: { inputTokens: 1_200_000, outputTokens: 300_000 } } })
  app.fire({ type: 'assistant/message', data: { turn: 1, usage: { inputTokens: 500_000, outputTokens: 0 } } })
  app.fire({ type: 'assistant/message', data: { turn: 2, usage: { inputTokens: 1_000_000, outputTokens: 0 } } })

  const res = response()
  app.route.handler({ method: 'GET' }, res)
  const payload = JSON.parse(res.body)
  assert.equal(payload.total, 3_000_000)
  assert.equal(payload.turns, 2)
  assert.equal(payload.level.lv, 2)
  assert.equal(payload.today, 3_000_000)
})

test('脚本路由返回可执行客户端，HEAD 不返回正文', () => {
  const home = tempHome()
  const app = boot(home)

  const res = response()
  app.clientRoute.handler({ method: 'GET' }, res)
  assert.equal(res.statusCode, 200)
  assert.match(res.headers['Content-Type'], /javascript/)
  assert.ok(res.body.includes('dshf-root'))
  assert.ok(res.body.length > 5000)

  const head = response()
  app.clientRoute.handler({ method: 'HEAD' }, head)
  assert.equal(head.statusCode, 200)
  assert.equal(head.body, '')
})

test('卸载时清理路由与会话监听', () => {
  const home = tempHome()
  const app = boot(home)
  app.dispose()
  assert.equal(app.routes.size, 0)
  assert.equal(app.listeners.has('session/event'), false)
})
