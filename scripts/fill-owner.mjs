import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const owner = process.argv[2]
const repo = 'dsh-fatfish-level'

if (!owner) {
  console.error('usage: node scripts/fill-owner.mjs <github-owner>')
  process.exit(1)
}
if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner)) {
  console.error('owner 不合法：只允许字母、数字、连字符，且不能以连字符开头/结尾')
  process.exit(1)
}

const pkgPath = path.join(ROOT, 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
pkg.repository = { type: 'git', url: `git+https://github.com/${owner}/${repo}.git` }
pkg.homepage = `https://github.com/${owner}/${repo}#readme`
pkg.bugs = { url: `https://github.com/${owner}/${repo}/issues` }
if (!pkg.author) pkg.author = owner
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')

const readmePath = path.join(ROOT, 'README.md')
const readme = fs.readFileSync(readmePath, 'utf8').replaceAll('OWNER', owner)
fs.writeFileSync(readmePath, readme, 'utf8')

const template = fs.readFileSync(path.join(ROOT, 'scripts', 'market-entry.template.yml'), 'utf8')
const entry = template.replaceAll('OWNER', owner)
fs.writeFileSync(path.join(ROOT, 'market-entry.yml'), entry, 'utf8')

const targetName = `${owner}__${repo}.yml`
console.log(`owner: ${owner}`)
console.log(`repository: https://github.com/${owner}/${repo}`)
console.log(`market entry: market-entry.yml -> awesome-dsh-plugin/data/plugins/${targetName}`)
