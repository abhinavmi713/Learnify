// Buckets a list of dates into a fixed number of trailing calendar-month
// buckets, returning [{ month: "YYYY-MM", count }] oldest first.
exports.bucketByMonth = (dates, monthsBack = 6) => {
  const buckets = []
  const now = new Date()
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    buckets.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      count: 0,
    })
  }
  const index = new Map(buckets.map((b) => [b.key, b]))
  dates.forEach((date) => {
    const d = new Date(date)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    const bucket = index.get(key)
    if (bucket) bucket.count += 1
  })
  return buckets.map(({ key, count }) => ({ month: key, count }))
}
