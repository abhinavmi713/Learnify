// Database backup: a gzipped `mongodump` archive with simple retention.
//
//   npm run backup                      -> backups/learnify-<timestamp>.gz
//   BACKUP_DIR=/mnt/backups BACKUP_RETENTION_DAYS=30 npm run backup
//
// Schedule it with cron / a platform scheduler (e.g. daily). If you host on
// MongoDB Atlas, its built-in continuous backups are the better primary
// mechanism — use this for self-hosted databases or as an extra off-site copy.
// Requires the `mongodump` binary (MongoDB Database Tools) on the PATH.
require("dotenv").config()
const fs = require("fs")
const path = require("path")
const { spawnSync } = require("child_process")

const uri = process.env.MONGODB_URL
if (!uri) {
  console.error("MONGODB_URL is not set")
  process.exit(1)
}

const dir = path.resolve(process.env.BACKUP_DIR || path.join(__dirname, "..", "backups"))
const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS) || 14
fs.mkdirSync(dir, { recursive: true })

const stamp = new Date().toISOString().replace(/[:.]/g, "-")
const archive = path.join(dir, `learnify-${stamp}.gz`)

// Passed as separate argv entries (no shell), so the URI can't be interpreted.
const result = spawnSync("mongodump", [`--uri=${uri}`, "--gzip", `--archive=${archive}`], {
  stdio: "inherit",
})

if (result.error) {
  console.error(
    result.error.code === "ENOENT"
      ? "mongodump not found — install the MongoDB Database Tools and make sure it is on the PATH."
      : `backup failed: ${result.error.message}`
  )
  process.exit(1)
}
if (result.status !== 0) process.exit(result.status || 1)

console.log(`Backup written to ${archive}`)

const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
for (const file of fs.readdirSync(dir)) {
  if (!/^learnify-.*\.gz$/.test(file)) continue
  const full = path.join(dir, file)
  if (fs.statSync(full).mtimeMs < cutoff) {
    fs.unlinkSync(full)
    console.log(`Pruned old backup ${file}`)
  }
}
