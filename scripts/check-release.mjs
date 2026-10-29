import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const failures = []
const notes = []

function fail(message) {
  failures.push(message)
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel))
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, entry.name)
    if (entry.isDirectory()) walk(rel, out)
    else out.push(rel)
  }
  return out
}

const pkg = JSON.parse(read('package.json'))

if (pkg.name !== 'dsh-fatfish-level') fail(`包名应为 dsh-fatfish-level，当前 ${pkg.name}`)
if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) fail(`版本不是稳定 semver：${pkg.version}`)
if (pkg.license !== 'MIT') fail('license 应为 MIT')

const repo = String(pkg.repository?.url || '')
if (!repo.includes('github.com')) fail('repository 必须指向 GitHub')
if (repo.includes('OWNER')) fail('repository 里还有 OWNER 占位符，先运行 node scripts/fill-owner.mjs <owner>')
if (pkg.homepage?.includes('OWNER') || pkg.bugs?.url?.includes('OWNER')) fail('homepage / bugs 里还有 OWNER')

if (!pkg.dsh?.bundle?.patch) fail('缺少 dsh.bundle.patch，市场无法安装')
else if (!exists(pkg.dsh.bundle.patch)) fail(`dsh.bundle.patch 指向的文件不存在：${pkg.dsh.bundle.patch}`)

const exactReleases = pkg.dsh?.compatibility?.dshReleases || {}
for (const version of ['0.2.0-rc.2', '0.2.1-rc.2', '0.2.1-rc.3', '0.2.1-rc.4', '0.2.2-alpha.2']) {
  if (exactReleases[version] !== 'compatible') {
    fail(`dsh.compatibility.dshReleases 缺少 ${version}: compatible`)
  }
}

for (const required of [
  'lib/index.js',
  'lib/client.js',
  'lib/levels.js',
  'lib/store.js',
  'cordis.patch.yml',
  'icon.png',
  'assets/icon-180.png',
  'README.md',
  'SECURITY.md',
  'LICENSE',
  'screenshots.json',
]) {
  if (!exists(required)) fail(`缺少文件：${required}`)
}

let shots = []
try {
  shots = JSON.parse(read('screenshots.json'))
} catch (err) {
  fail(`screenshots.json 解析失败：${err.message}`)
}
if (!Array.isArray(shots) || shots.length < 1 || shots.length > 8) fail('screenshots.json 应为 1–8 张图')
for (const shot of shots) {
  if (typeof shot !== 'string' || shot.startsWith('/') || shot.includes('..')) {
    fail(`screenshots.json 路径不合法：${shot}`)
  } else if (!exists(shot)) {
    fail(`截图不存在：${shot}`)
  }
}

const files = pkg.files || []
for (const required of ['lib', 'cordis.patch.yml', 'README.md', 'LICENSE']) {
  if (!files.includes(required)) fail(`package.json files 缺少：${required}`)
}
if (files.some((entry) => entry === 'preview' || entry.startsWith('preview/'))) {
  fail('package.json files 不应包含 preview/')
}

const readme = read('README.md')
if (/(?:^|\s)[A-Za-z]:[\\/]/m.test(readme)) fail('README.md 含本机绝对路径')
if (readme.includes('deepseekharness')) fail('README.md 含开发机路径')
if (readme.includes('OWNER')) notes.push('README.md 仍有 OWNER（fill-owner 会替换）')

const localPathPattern = /(?:[A-Za-z]:[\\/](?:Users|deepseekharness)|file:\/\/\/[A-Za-z]:\/)/
for (const rel of walk('lib')) {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8')
  if (localPathPattern.test(text)) fail(`${rel} 含本机绝对路径`)
}

const patch = read('cordis.patch.yml')
if (!patch.includes('insert:') || !patch.includes('dsh-fatfish-level')) {
  fail('cordis.patch.yml 没有把 dsh-fatfish-level 插进 loader 树')
}

if (failures.length) {
  console.error('release check FAILED:')
  for (const message of failures) console.error(' -', message)
  if (notes.length) for (const note of notes) console.error(' !', note)
  process.exit(1)
}

console.log(`release check OK · ${pkg.name}@${pkg.version} · ${shots.length} screenshots`)
for (const note of notes) console.log(' note:', note)
