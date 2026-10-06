import { startCluster } from './postgres-cluster.mjs'

await startCluster()

await new Promise(() => {})
