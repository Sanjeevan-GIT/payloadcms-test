import path from 'path'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { portAcceptsConnections, readDatabaseConfig, startCluster } from './postgres-cluster.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const config = readDatabaseConfig()

if (!(await portAcceptsConnections(config.port))) {
  await startCluster()
} else {
  console.log(`Postgres is already accepting connections on 127.0.0.1:${config.port}`)
}

const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next')
const child = spawn(process.execPath, [nextBin, 'dev'], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})
