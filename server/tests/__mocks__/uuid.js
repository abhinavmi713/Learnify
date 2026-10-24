// The real `uuid` package ships ESM-only, which Jest can't `require()`
// directly without extra transform config. Certificates only need *some*
// unique string in tests, so a trivial mock avoids pulling in babel just
// for this one dependency.
let counter = 0
module.exports = { v4: () => `test-uuid-${++counter}` }
