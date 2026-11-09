// Average of populated reviews. Lists that only carry review ids (not objects)
// have nothing to average, so they count as no rating rather than NaN.
export default function GetAvgRating(ratingArr) {
  const rated = (ratingArr || []).filter((r) => r && typeof r === "object" && typeof r.rating === "number")
  if (!rated.length) return 0
  ratingArr = rated
  const totalReviewCount = ratingArr?.reduce((acc, curr) => {
    acc += curr.rating
    return acc
  }, 0)

  const multiplier = Math.pow(10, 1)
  const avgReviewCount =
    Math.round((totalReviewCount / ratingArr?.length) * multiplier) / multiplier

  return avgReviewCount
}
