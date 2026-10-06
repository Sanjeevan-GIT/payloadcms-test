import fs from 'fs'
import net from 'net'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import EmbeddedPostgres from 'embedded-postgres'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

dotenv.config({ path: path.join(root, '.env') })

export function readDatabaseConfig() {
  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    throw new Error('DATABASE_URL is missing. Add it to .env before starting the app.')
  }

  let url
  try {
    url = new URL(connectionString)
  } catch {
    throw new Error('DATABASE_URL is not a valid Postgres connection string.')
  }

  const database = decodeURIComponent(url.pathname.replace(/^\//, ''))

  if (!database) {
    throw new Error('DATABASE_URL must include a database name, for example postgres://user:pass@127.0.0.1:5432/payloadcms-test')
  }

  return {
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    databaseDir: path.join(root, '.pgdata'),
  }
}

export function isLocalHost(host) {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1'
}

export function portAcceptsConnections(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host })
    const finish = (open) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(open)
    }

    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
  })
}

export async function startCluster() {
  const config = readDatabaseConfig()

  if (!isLocalHost(config.host)) {
    throw new Error(
      `DATABASE_URL points at ${config.host}, so this script will not start a local database.`,
    )
  }

  if (await portAcceptsConnections(config.port)) {
    console.log(`Postgres is already accepting connections on 127.0.0.1:${config.port}`)
    return null
  }

  const pg = new EmbeddedPostgres({
    databaseDir: config.databaseDir,
    user: config.user,
    password: config.password,
    port: config.port,
    persistent: true,
  })

  if (!fs.existsSync(path.join(config.databaseDir, 'PG_VERSION'))) {
    console.log('Initializing local Postgres data directory...')
    await pg.initialise()
  }

  console.log(`Starting Postgres on 127.0.0.1:${config.port}...`)
  try {
    await pg.start()
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    throw new Error(message || 'Postgres exited before it was ready to accept connections.')
  }

  try {
    await pg.createDatabase(config.database)
    console.log(`Created database "${config.database}"`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('already exists')) {
      throw error
    }
  }

  console.log(`Postgres is ready on 127.0.0.1:${config.port}`)
  return pg
}
