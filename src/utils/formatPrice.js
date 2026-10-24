// One place for how prices read across the app: free courses say "Free".
export const formatPrice = (price) => (Number(price) > 0 ? `₹${price}` : "Free")
