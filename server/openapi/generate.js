const { z } = require("zod")

// Builds the OpenAPI 3.1 document from the running Express app instead of a
// hand-written spec, so it cannot drift from the code:
//   - every mounted route and method,
//   - request bodies/queries from the route's zod schema (validate()),
//   - auth, permissions/roles, idempotency and internal-token requirements from
//     metadata the middleware carries (middleware.openapi).
// Served at /api/docs (Swagger UI) and /api/openapi.json.

const TAGS = {
  auth: "Authentication, sessions and two-factor",
  profile: "Profile, enrolled courses and dashboards",
  course: "Courses, sections, lectures, categories, search and reviews",
  payment: "Checkout and payments",
  coupon: "Coupons",
  notes: "Lecture notes",
  quiz: "Quizzes",
  certificate: "Certificates",
  admin: "Administration",
  notification: "Notifications",
  discussion: "Lecture Q&A",
  "live-class": "Live classes",
  internal: "Service-to-service (internal token)",
  "learning-path": "Learning paths",
  reach: "Contact",
  chatbot: "AI study assistant",
  webhooks: "Instructor webhooks",
}

// Express 4 stores a mount path only as a regexp; recover the literal prefix.
function mountPath(layer) {
  if (!layer.regexp || layer.regexp.fast_slash) return ""
  const match = layer.regexp.source
    .replace("\\/?(?=\\/|$)", "")
    .replace(/^\^/, "")
    .replace(/\\\//g, "/")
  return /^[/\w\-.]*$/.test(match) ? match : ""
}

const merge = (into, meta) => {
  if (!meta) return into
  return {
    ...into,
    ...meta,
    permissions: [...(into.permissions || []), ...(meta.permissions || [])],
    roles: [...(into.roles || []), ...(meta.roles || [])],
  }
}

function collect(stack, prefix, inherited, out) {
  let context = { ...inherited }
  for (const layer of stack) {
    if (layer.route) {
      let meta = { ...context }
      let schema = null
      for (const handler of layer.route.stack) {
        const tag = handler.handle.openapi
        if (!tag) continue
        if (tag.schema) schema = tag
        else meta = merge(meta, tag)
      }
      for (const method of Object.keys(layer.route.methods)) {
        out.push({ method, path: prefix + layer.route.path, meta, schema })
      }
    } else if (layer.name === "router" && layer.handle?.stack) {
      collect(layer.handle.stack, prefix + mountPath(layer), context, out)
    } else if (layer.handle?.openapi) {
      // router.use(auth) etc.: applies to every route registered after it.
      context = merge(context, layer.handle.openapi)
    }
  }
  return out
}

function toJsonSchema(schema) {
  try {
    return z.toJSONSchema(schema, { io: "input", unrepresentable: "any" })
  } catch (error) {
    return { type: "object" }
  }
}

function describe(meta) {
  const lines = []
  if (meta.internal) lines.push("Service-to-service only: requires the `X-Internal-Token` header.")
  if (meta.auth === "required") lines.push("Requires a bearer access token.")
  if (meta.auth === "optional") lines.push("Bearer token optional.")
  if (meta.roles?.length) lines.push(`Role: ${[...new Set(meta.roles)].join(", ")}.`)
  if (meta.permissions?.length) lines.push(`Permission: \`${[...new Set(meta.permissions)].join("`, `")}\`.`)
  if (meta.idempotent) lines.push("Supports an `Idempotency-Key` header: a repeat returns the first response.")
  if (meta.xhr) lines.push("Requires `X-Requested-With: XMLHttpRequest` (CSRF protection for cookie-based calls).")
  return lines.join(" ")
}

function buildSpec(app, { version = "1.0.0", serverUrl = "/" } = {}) {
  const routes = collect(app._router.stack, "", {}, [])
  const paths = {}
  const usedTags = new Set()

  for (const { method, path, meta, schema } of routes) {
    if (!path.startsWith("/api/") && !["/health", "/metrics"].includes(path)) continue
    const openapiPath = path.replace(/:(\w+)/g, "{$1}")
    const segment = path.split("/")[3] || "system"
    const tag = TAGS[segment] ? segment : "system"
    usedTags.add(tag)

    const op = {
      tags: [tag],
      summary: `${method.toUpperCase()} ${path.replace(/^\/api\/v1/, "")}`,
      description: describe(meta) || undefined,
      parameters: [...path.matchAll(/:(\w+)/g)].map(([, name]) => ({ name, in: "path", required: true, schema: { type: "string" } })),
      responses: {
        200: { description: "Success" },
        400: { description: "Invalid input" },
        ...(meta.auth === "required" ? { 401: { description: "Missing or expired access token" } } : {}),
        ...(meta.permissions?.length || meta.roles?.length ? { 403: { description: "Not allowed for this account" } } : {}),
        ...(meta.idempotent ? { 409: { description: "Same Idempotency-Key still in progress" }, 422: { description: "Idempotency-Key reused with a different body" } } : {}),
        429: { description: "Rate limited" },
      },
    }
    const security = []
    if (meta.auth === "required") security.push({ bearerAuth: [] })
    if (meta.internal) security.push({ internalToken: [] })
    if (security.length) op.security = security
    if (meta.idempotent) {
      op.parameters.push({ name: "Idempotency-Key", in: "header", required: Boolean(meta.idempotent.required), schema: { type: "string", minLength: 8, maxLength: 128 } })
    }
    if (schema) {
      const json = toJsonSchema(schema.schema)
      if (schema.source === "query") {
        for (const [name, prop] of Object.entries(json.properties || {})) {
          op.parameters.push({ name, in: "query", required: (json.required || []).includes(name), schema: prop })
        }
      } else {
        op.requestBody = { required: true, content: { "application/json": { schema: json } } }
      }
    } else if (["post", "put", "patch"].includes(method)) {
      op.requestBody = { required: false, content: { "application/json": { schema: { type: "object" } } } }
    }
    if (!op.parameters.length) delete op.parameters
    paths[openapiPath] = { ...(paths[openapiPath] || {}), [method]: op }
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Learnify API",
      version,
      description:
        "Generated from the running Express routes and their zod validators (server/openapi/generate.js). " +
        "Log in with POST /api/v1/auth/login, then use the returned token with Authorize.",
    },
    servers: [{ url: serverUrl }],
    tags: [...usedTags].sort().map((name) => ({ name, description: TAGS[name] || "Health and metrics" })),
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        internalToken: { type: "apiKey", in: "header", name: "X-Internal-Token" },
      },
    },
    paths: Object.fromEntries(Object.entries(paths).sort(([a], [b]) => a.localeCompare(b))),
  }
}

module.exports = { buildSpec, collect, mountPath }
