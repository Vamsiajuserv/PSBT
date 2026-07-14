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

// Find a working system Python to create the venv with.
function findPython() {
  const candidates = isWin
    ? [['py', ['-3']], ['py', []], ['python', []], ['python3', []]]
    : [['python3', []], ['python', []]]
  for (const [cmd, pre] of candidates) {
    const r = spawnSync(cmd, [...pre, '--version'], { stdio: 'ignore' })
    if (r.status === 0) return [cmd, pre]
  }
  return null
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
    console.error('\n[setup] No Python found. Install Python 3.11+ from https://www.python.org/downloads/')
    console.error('[setup] During install, tick "Add python.exe to PATH", then re-run:  npm run setup:api\n')
    process.exit(1)
  }
  const [cmd, pre] = py
  console.log(`[setup] Using Python: ${cmd} ${pre.join(' ')}`)
  run(cmd, [...pre, '-m', 'venv', '.venv'])
}

run(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip', '--quiet'])
run(venvPython, ['-m', 'pip', 'install', '-r', 'requirements.txt'])
run(venvPython, ['-m', 'app.seed'])
console.log('\n✅ Backend ready. Now run:  npm run dev   (starts API + web together)')
