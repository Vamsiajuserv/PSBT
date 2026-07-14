// Launch the FastAPI backend using the project's Python venv.
// Cross-platform: resolves the venv interpreter for Windows vs macOS/Linux so
// `npm run dev` works without manually activating the venv.
const { spawn } = require('node:child_process')
const { existsSync } = require('node:fs')
const path = require('node:path')

const backend = path.join(__dirname, '..', 'backend')
const isWin = process.platform === 'win32'
const venvPython = isWin
  ? path.join(backend, '.venv', 'Scripts', 'python.exe')
  : path.join(backend, '.venv', 'bin', 'python')

if (!existsSync(venvPython)) {
  console.error('\n[API] Python virtual environment not found at backend/.venv')
  console.error('[API] Run first-time setup:  npm run setup:api\n')
  process.exit(1)
}

const port = process.env.API_PORT || '8099'
const args = ['-m', 'uvicorn', 'app.main:app', '--reload', '--port', port]
const child = spawn(venvPython, args, {
  cwd: backend,
  stdio: 'inherit',
  env: { ...process.env, PYTHONUTF8: '1' },
})
child.on('exit', (code) => process.exit(code ?? 0))
