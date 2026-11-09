// console.log for development only: API responses can contain personal data, so
// they must not be printed in the production console.
export const devLog = (...args) => {
  if (process.env.NODE_ENV !== "production") console.log(...args)
}
