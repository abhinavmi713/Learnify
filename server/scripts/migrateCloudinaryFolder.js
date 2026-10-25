// Moves this app's Cloudinary assets from one folder to another and rewrites
// every database reference to them.
//
//   node scripts/migrateCloudinaryFolder.js                # dry run (default): prints the plan
//   node scripts/migrateCloudinaryFolder.js --apply        # performs it
//   FROM_FOLDER=CodeHelp TO_FOLDER=Learnify node scripts/migrateCloudinaryFolder.js --apply
//
// Safety:
//  * Only assets referenced by this app's database are moved. Anything else in
//    the source folder (e.g. from another project sharing the account) is left
//    untouched and merely reported.
//  * Each asset is renamed first, then the database is updated. If the run is
//    interrupted in between, re-running finds the asset already at its new name
//    and just finishes the database update. Nothing is ever deleted.
//  * overwrite:false, so an existing asset at the destination is never replaced.
require("dotenv").config()
const mongoose = require("mongoose")
const cloudinary = require("cloudinary").v2

const APPLY = process.argv.includes("--apply")
const FROM = process.env.FROM_FOLDER || "CodeHelp"
const TO = process.env.TO_FOLDER || "Learnify"
const CLOUD = process.env.CLOUD_NAME

cloudinary.config({ cloud_name: CLOUD, api_key: process.env.API_KEY, api_secret: process.env.API_SECRET })

// https://res.cloudinary.com/<cloud>/<image|video|raw>/upload/[v123/]<public_id>.<ext>
const URL_RE = new RegExp(`^https://res\\.cloudinary\\.com/${CLOUD}/(image|video|raw)/upload/(?:v\\d+/)?(${FROM}/[^?#]+?)(\\.[a-z0-9]+)?$`, "i")

function parse(url) {
  const m = typeof url === "string" && url.match(URL_RE)
  if (!m) return null
  return { resourceType: m[1], publicId: m[2], ext: m[3] || "" }
}

// Walks a document and yields [path, value] for every string field.
function* strings(value, path = []) {
  if (typeof value === "string") yield [path.join("."), value]
  else if (Array.isArray(value)) for (let i = 0; i < value.length; i++) yield* strings(value[i], [...path, i])
  else if (value && typeof value === "object" && !(value instanceof Date) && !(value instanceof mongoose.Types.ObjectId)) {
    for (const [k, v] of Object.entries(value)) if (k !== "_id") yield* strings(v, [...path, k])
  }
}

async function renameOrFind(asset) {
  const target = asset.publicId.replace(new RegExp(`^${FROM}/`), `${TO}/`)
  try {
    const result = await cloudinary.uploader.rename(asset.publicId, target, {
      resource_type: asset.resourceType,
      overwrite: false,
      invalidate: true,
    })
    return { url: result.secure_url, moved: true }
  } catch (error) {
    // Already moved by an earlier (interrupted) run? Then use the existing one.
    const existing = await cloudinary.api.resource(target, { resource_type: asset.resourceType }).catch(() => null)
    if (existing) return { url: existing.secure_url, moved: false }
    throw new Error(`rename ${asset.publicId} -> ${target} failed: ${error.message || error.error?.message}`)
  }
}

async function main() {
  if (!CLOUD || !process.env.API_KEY || !process.env.API_SECRET) throw new Error("Cloudinary credentials missing in .env")
  await mongoose.connect(process.env.MONGODB_URL)
  const db = mongoose.connection.db

  // 1. Every reference in every collection.
  const refs = [] // { collection, _id, path, url, asset }
  for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
    if (name.startsWith("system.")) continue
    const cursor = db.collection(name).find({})
    for await (const doc of cursor) {
      for (const [path, value] of strings(doc)) {
        const asset = parse(value)
        if (asset) refs.push({ collection: name, _id: doc._id, path, url: value, asset })
      }
    }
  }
  const unique = new Map(refs.map((r) => [r.url, r.asset]))
  console.log(`${refs.length} database references to ${unique.size} assets in "${FROM}/"`)
  for (const [url, a] of unique) console.log(`  ${a.resourceType.padEnd(5)} ${a.publicId}  (${refs.filter((r) => r.url === url).map((r) => `${r.collection}.${r.path}`).join(", ")})`)

  // 2. What else is in the folder (informational; never touched).
  for (const resourceType of ["image", "video"]) {
    const listed = await cloudinary.api.resources({ type: "upload", prefix: `${FROM}/`, resource_type: resourceType, max_results: 500 }).catch(() => ({ resources: [] }))
    const referenced = new Set([...unique.values()].map((a) => a.publicId))
    const others = listed.resources.filter((r) => !referenced.has(r.public_id))
    console.log(`${resourceType}: ${listed.resources.length} in "${FROM}/", ${others.length} not used by this app (left in place)`)
  }

  if (!APPLY) {
    console.log("\nDry run only. Re-run with --apply to move the assets above and update the database.")
    return
  }

  // 3. Move each asset, then rewrite every reference to it.
  let moved = 0
  let updated = 0
  for (const [oldUrl, asset] of unique) {
    const { url: newUrl, moved: didMove } = await renameOrFind(asset)
    if (didMove) moved++
    for (const ref of refs.filter((r) => r.url === oldUrl)) {
      const res = await db.collection(ref.collection).updateOne({ _id: ref._id, [ref.path]: oldUrl }, { $set: { [ref.path]: newUrl } })
      updated += res.modifiedCount
    }
    console.log(`  ${asset.publicId} -> ${newUrl}`)
  }
  console.log(`\nmoved ${moved} assets, updated ${updated} database references`)

  // 4. Cached catalog responses still hold old URLs; drop them.
  if (process.env.REDIS_URL) {
    const Redis = require("ioredis")
    const redis = new Redis(process.env.REDIS_URL)
    await redis.incr("cache:catalog:ver")
    await redis.quit()
    console.log("catalog cache invalidated")
  }
}

main()
  .catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
  .finally(() => mongoose.disconnect())
