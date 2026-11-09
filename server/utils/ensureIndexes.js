const mongoose = require("mongoose")
const logger = require("./logger")

// In production autoIndex is off (config/mongoose.js), so indexes are built by
// `npm run db:indexes` as a deploy step, not by a surprise build at startup. This
// is the safety net for when that step was skipped:
//   - an empty or missing collection gets its indexes now. That's instant, and it
//     means a brand-new database never runs without its unique and TTL indexes
//     (duplicate emails, two payment records for one order, OTPs that never expire);
//   - a collection that already has data is only reported, loudly, because
//     building an index on a big collection belongs in a planned step.
// Nothing is ever dropped here; syncIndexes in the script does that.
async function ensureIndexes({ models = Object.values(mongoose.models) } = {}) {
  const created = []
  const missing = []
  for (const model of models) {
    if (model.schema.get("autoIndex") === false) continue
    try {
      const { toCreate } = await model.diffIndexes()
      if (!toCreate.length) continue
      const count = await model.estimatedDocumentCount()
      if (count === 0) {
        await model.createIndexes()
        created.push(model.modelName)
      } else {
        missing.push({ model: model.modelName, indexes: toCreate.map((spec) => JSON.stringify(spec)) })
      }
    } catch (error) {
      logger.error({ err: error.message, model: model.modelName }, "could not check indexes")
    }
  }
  if (created.length) logger.info({ models: created }, "created indexes for empty collections")
  if (missing.length) {
    logger.error({ missing }, "collections are missing indexes; run `npm run db:indexes` (unique and TTL rules are not enforced until then)")
  }
  return { created, missing }
}

module.exports = { ensureIndexes }
