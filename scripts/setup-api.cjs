// One-time backend setup: create the Python venv, install deps, seed the DB.
// Cross-platform, auto-detects the Python command. Run:  npm run setup:api
const { spawnSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const path = require('node:path')

const backend = path.join(__dirname, '..', 'backend')
const isWin = process.platform === 'win32'
const venvPython = isWin
  ? path.join(backend, '.venv', 'Scripts', 'python.exe')
  : path.join(backend, '.venv', 'bin', 'python')

// Python versions the pinned requirements have prebuilt wheels for. Anything
// newer makes pip fall back to building psycopg2-binary / pydantic-core from
// source, which needs pg_config + a Rust toolchain and fails on a clean box.
// 3.12 is also what Azure App Service runs, so local matches production.
const SUPPORTED = ['3.12', '3.13', '3.11']

// Find a working system Python to create the venv with. Override with e.g.
//   PYTHON="py -3.12" npm run setup:api
function findPython() {
  if (process.env.PYTHON) {
    const [cmd, ...pre] = process.env.PYTHON.trim().split(/\s+/)
    return [cmd, pre]
  }
  // Prefer a known-good version, then fall back to whatever is installed.
  const preferred = isWin
    ? SUPPORTED.map((v) => ['py', [`-${v}`]])
    : SUPPORTED.map((v) => [`python${v}`, []])
  const fallback = isWin
    ? [['py', ['-3']], ['py', []], ['python', []], ['python3', []]]
    : [['python3', []], ['python', []]]
  for (const [cmd, pre] of [...preferred, ...fallback]) {
    const r = spawnSync(cmd, [...pre, '--version'], { stdio: 'ignore' })
    if (r.status === 0) return [cmd, pre]
  }
  return null
}

// Warn when the chosen interpreter is newer than anything we have wheels for.
function warnIfUnsupported(cmd, pre) {
  const r = spawnSync(cmd, [...pre, '--version'], { encoding: 'utf8' })
  const ver = `${r.stdout || ''}${r.stderr || ''}`.match(/(\d+)\.(\d+)/)
  if (!ver) return
  const [major, minor] = [Number(ver[1]), Number(ver[2])]
  const newest = Math.max(...SUPPORTED.map((v) => Number(v.split('.')[1])))
  if (major === 3 && minor > newest) {
    console.warn(`\n[setup] WARNING: Python 3.${minor} is newer than the pinned dependencies support (3.${newest}).`)
    console.warn('[setup] pip will try to COMPILE psycopg2-binary and pydantic-core from source and will likely fail')
    console.warn('[setup] with "pg_config executable not found".')
    console.warn(`[setup] Fix: install Python 3.12 from https://www.python.org/downloads/release/python-3128/`)
    console.warn('[setup] then delete backend\\.venv and re-run:  npm run setup:api')
    console.warn('[setup] (or force one:  PYTHON="py -3.12" npm run setup:api)\n')
  }
}

function run(cmd, args) {
  console.log('>', cmd, args.join(' '))
  const r = spawnSync(cmd, args, { cwd: backend, stdio: 'inherit' })
  if (r.status !== 0) {
    console.error('\n[setup] command failed:', cmd, args.join(' '))
    process.exit(r.status ?? 1)
  }
}

if (!existsSync(venvPython)) {
  const py = findPython()
  if (!py) {
    console.error('\n[setup] No Python found. Install Python 3.12 from https://www.python.org/downloads/')
    console.error('[setup] During install, tick "Add python.exe to PATH", then re-run:  npm run setup:api\n')
    process.exit(1)
  }
  const [cmd, pre] = py
  console.log(`[setup] Using Python: ${cmd} ${pre.join(' ')}`)
  warnIfUnsupported(cmd, pre)
  run(cmd, [...pre, '-m', 'venv', '.venv'])
}

run(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip', '--quiet'])
run(venvPython, ['-m', 'pip', 'install', '-r', 'requirements.txt'])
run(venvPython, ['-m', 'app.seed'])
console.log('\n✅ Backend ready. Now run:  npm run dev   (starts API + web together)')
