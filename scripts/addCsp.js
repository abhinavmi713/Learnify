// Adds a Content-Security-Policy to the production build (runs as `postbuild`).
//
// A CSP tells the browser which sources a page may load scripts, styles, images
// and connections from, so injected markup can't load an attacker's script or
// send data to their server. Helmet sets one on the API's responses, but XSS
// happens in the page, which Vercel serves, so the page needs its own.
//
// It's written into build/index.html as a <meta> tag rather than a vercel.json
// header because the API's address (REACT_APP_BASE_URL) is only known at build
// time. Create React App inlines a small runtime script, which is allowed by its
// SHA-256 hash rather than by 'unsafe-inline'. frame-ancestors can't be set from a
// meta tag; vercel.json sends it as a header.
const crypto = require("crypto")
const fs = require("fs")
const path = require("path")

const file = path.join(__dirname, "..", "build", "index.html")

function origin(url) {
  try {
    return new URL(url).origin
  } catch (error) {
    return null
  }
}

function buildPolicy(html, apiUrl) {
  const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
    ([, body]) => `'sha256-${crypto.createHash("sha256").update(body).digest("base64")}'`
  )
  const api = origin(apiUrl)
  // Socket.IO upgrades to a WebSocket on the same host. Browsers don't reliably
  // treat an http(s) source as covering ws(s), so both are listed.
  const socket = api ? api.replace(/^http/, "ws") : null
  const policy = {
    "default-src": ["'self'"],
    "script-src": ["'self'", ...hashes, "https://checkout.razorpay.com"],
    // Toast and a few components inject <style> tags at run time.
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
    "img-src": ["'self'", "data:", "blob:", "https://res.cloudinary.com", "https://api.dicebear.com", "https://*.razorpay.com"],
    // Plyr, the video player, fetches its icon sprite and a blank video from its CDN.
    "media-src": ["'self'", "blob:", "https://res.cloudinary.com", "https://cdn.plyr.io"],
    // The API and its Socket.IO connection, direct video uploads to Cloudinary,
    // and Razorpay's checkout.
    "connect-src": ["'self'", ...(api ? [api, socket] : []), "https://api.cloudinary.com", "https://*.razorpay.com", "https://cdn.plyr.io"],
    "frame-src": ["https://api.razorpay.com", "https://checkout.razorpay.com"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
  }
  return Object.entries(policy).map(([key, values]) => `${key} ${values.join(" ")}`).join("; ")
}

function main() {
  if (!fs.existsSync(file)) return
  const html = fs.readFileSync(file, "utf8")
  if (html.includes('http-equiv="Content-Security-Policy"')) return
  const policy = buildPolicy(html, process.env.REACT_APP_BASE_URL)
  const tag = `<meta http-equiv="Content-Security-Policy" content="${policy}">`
  fs.writeFileSync(file, html.replace(/<head>/i, `<head>${tag}`))
  console.log("Content-Security-Policy added to build/index.html")
}

if (require.main === module) main()

module.exports = { buildPolicy }
