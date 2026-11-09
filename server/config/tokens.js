// Every signed token says what it is for. Tokens share one signing key, so a
// valid signature only proves "we issued this"; the audience proves its purpose.
// Without this check, the short-lived 2FA challenge worked as an access token,
// and a password alone was enough to use the API.
const ALGORITHM = "HS256"
const ACCESS_AUDIENCE = "learnify:access"
const TWO_FACTOR_AUDIENCE = "learnify:2fa"

module.exports = { ALGORITHM, ACCESS_AUDIENCE, TWO_FACTOR_AUDIENCE }
