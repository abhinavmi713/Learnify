import { useEffect, useState } from "react"
import { useSelector } from "react-redux"

import useConfirm from "../../../hooks/useConfirm"
import {
  createWebhook,
  deleteWebhook,
  listDeliveries,
  listWebhookEvents,
  listWebhooks,
  redeliver,
  rotateWebhookSecret,
  sendTestWebhook,
  updateWebhook,
} from "../../../services/operations/webhookAPI"
import IconBtn from "../../Common/IconBtn"

const EVENT_LABELS = {
  "enrollment.created": "A student enrolls in one of your courses",
  "review.created": "A student reviews one of your courses",
  "course.published": "Your course is approved and published",
  "course.rejected": "Your course is not approved",
}

const when = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "never")

const VERIFY_SNIPPET = `// Node.js / Express: verify a Learnify webhook
const crypto = require("crypto")
app.post("/learnify", express.raw({ type: "application/json" }), (req, res) => {
  const { t, v1 } = Object.fromEntries(req.get("Learnify-Signature").split(",").map((p) => p.split("=")))
  const expected = crypto.createHmac("sha256", process.env.LEARNIFY_WEBHOOK_SECRET)
    .update(\`\${t}.\${req.body}\`).digest("hex")
  const fresh = Math.abs(Date.now() / 1000 - Number(t)) < 300
  if (!fresh || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1))) return res.sendStatus(400)
  const event = JSON.parse(req.body)  // { id, event, createdAt, data }
  // Use req.get("Learnify-Delivery") to ignore deliveries you already handled.
  res.sendStatus(200)
})`

function SecretNotice({ secret, onClose }) {
  return (
    <div className="mb-6 rounded-lg border border-yellow-100/40 bg-richblack-700 p-4">
      <p className="font-semibold text-richblack-5">Signing secret</p>
      <p className="mt-1 text-sm text-richblack-300">
        Copy it now and store it with your receiving app. It will not be shown again.
      </p>
      <code className="mt-3 block break-all rounded bg-richblack-800 px-3 py-2 text-sm text-yellow-50">{secret}</code>
      <div className="mt-3 flex gap-3">
        <button
          onClick={() => navigator.clipboard?.writeText(secret)}
          className="rounded-md border border-richblack-600 px-3 py-1.5 text-sm text-richblack-50"
        >
          Copy
        </button>
        <button onClick={onClose} className="text-sm text-richblack-300">
          Done
        </button>
      </div>
    </div>
  )
}

function Deliveries({ token, hookId, refresh }) {
  const [rows, setRows] = useState(null)
  const [cursor, setCursor] = useState(null)

  const load = async (before = "") => {
    const { items, nextCursor } = await listDeliveries(token, hookId, before)
    setRows((prev) => (before ? [...(prev || []), ...items] : items))
    setCursor(nextCursor)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hookId, refresh])

  if (rows === null) return <p className="py-3 text-sm text-richblack-300">Loading deliveries...</p>
  if (!rows.length) return <p className="py-3 text-sm text-richblack-300">No deliveries yet. Send a test to try it.</p>

  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-xs">
        <thead className="text-richblack-300">
          <tr>
            <th className="py-2 pr-3 font-medium">Event</th>
            <th className="py-2 pr-3 font-medium">Status</th>
            <th className="py-2 pr-3 font-medium">Response</th>
            <th className="py-2 pr-3 font-medium">Attempts</th>
            <th className="py-2 pr-3 font-medium">Time</th>
            <th />
          </tr>
        </thead>
        <tbody className="divide-y divide-richblack-700 text-richblack-50">
          {rows.map((d) => (
            <tr key={d._id}>
              <td className="py-2 pr-3 font-mono">{d.event}</td>
              <td className="py-2 pr-3">
                <span
                  className={`rounded-full px-2 py-0.5 ${
                    d.status === "succeeded"
                      ? "bg-caribbeangreen-700 text-caribbeangreen-50"
                      : d.status === "failed"
                        ? "bg-pink-900 text-pink-100"
                        : "bg-richblack-600 text-richblack-50"
                  }`}
                >
                  {d.status === "pending" && d.attempts > 0 ? "retrying" : d.status}
                </span>
              </td>
              <td className="max-w-[200px] truncate py-2 pr-3 text-richblack-300" title={d.error || d.responseBody}>
                {d.responseStatus ? `HTTP ${d.responseStatus}` : d.error || "-"}
                {d.durationMs != null ? ` · ${d.durationMs} ms` : ""}
              </td>
              <td className="py-2 pr-3">{d.attempts}</td>
              <td className="py-2 pr-3 text-richblack-300">{when(d.createdAt)}</td>
              <td className="py-2 text-right">
                <button onClick={async () => (await redeliver(token, d._id)) && setTimeout(() => load(), 1500)} className="text-blue-100 hover:underline">
                  Resend
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {cursor && (
        <button onClick={() => load(cursor)} className="mt-2 text-xs text-blue-100 hover:underline">
          Older deliveries
        </button>
      )}
    </div>
  )
}

export default function Webhooks() {
  const { token } = useSelector((state) => state.auth)
  const [hooks, setHooks] = useState(null)
  const [events, setEvents] = useState([])
  const [form, setForm] = useState({ url: "", description: "", events: [] })
  const [busy, setBusy] = useState(false)
  const [secret, setSecret] = useState(null)
  const [open, setOpen] = useState(null)
  const [showSnippet, setShowSnippet] = useState(false)
  // Bumped to reload the open deliveries list (e.g. after a test delivery).
  const [refresh, setRefresh] = useState(0)
  const [confirm, confirmModal] = useConfirm()

  const load = async () => setHooks(await listWebhooks(token))

  useEffect(() => {
    load()
    listWebhookEvents(token).then(setEvents)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleEvent = (e) =>
    setForm((f) => ({ ...f, events: f.events.includes(e) ? f.events.filter((x) => x !== e) : [...f.events, e] }))

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    const created = await createWebhook(token, { url: form.url.trim(), description: form.description.trim() || undefined, events: form.events })
    setBusy(false)
    if (!created) return
    setSecret(created.secret)
    setForm({ url: "", description: "", events: [] })
    load()
  }

  const remove = async (hook) => {
    const ok = await confirm({ title: "Delete this webhook?", body: `Deliveries to ${hook.url} will stop and its history is removed.` })
    if (ok && (await deleteWebhook(token, hook._id))) load()
  }

  const rotate = async (hook) => {
    const ok = await confirm({
      title: "Rotate the signing secret?",
      body: "Deliveries are signed with the new secret right away. Update your receiving app.",
      confirmText: "Rotate",
    })
    if (!ok) return
    const next = await rotateWebhookSecret(token, hook._id)
    if (next) setSecret(next)
  }

  const setActive = async (hook, active) => {
    if (await updateWebhook(token, hook._id, { active })) load()
  }

  return (
    <div>
      <h1 className="mb-2 font-display text-3xl font-bold text-richblack-5">Webhooks</h1>
      <p className="mb-8 max-w-2xl text-sm text-richblack-300">
        Get an HTTP request on your own server when students enroll in or review your courses, or when a course is
        reviewed by the team. Each request is signed so you can check it came from Learnify.
      </p>

      {secret && <SecretNotice secret={secret} onClose={() => setSecret(null)} />}

      <form onSubmit={submit} className="mb-10 rounded-md border border-richblack-700 bg-richblack-800 p-6">
        <h2 className="mb-4 text-lg font-semibold text-richblack-5">Add a webhook</h2>
        <div className="flex flex-col gap-4 lg:flex-row">
          <label className="flex flex-1 flex-col gap-1 text-sm text-richblack-100">
            Endpoint URL
            <input
              required
              type="url"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://example.com/learnify-webhook"
              className="form-style"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-richblack-100 lg:w-72">
            Description (optional)
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              maxLength={200}
              placeholder="e.g. CRM sync"
              className="form-style"
            />
          </label>
        </div>
        <fieldset className="mt-4">
          <legend className="mb-2 text-sm text-richblack-100">Events</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {events.map((e) => (
              <label key={e} className="flex items-start gap-2 text-sm text-richblack-50">
                <input type="checkbox" checked={form.events.includes(e)} onChange={() => toggleEvent(e)} className="mt-1" />
                <span>
                  <span className="font-mono text-xs text-yellow-50">{e}</span>
                  <span className="block text-richblack-300">{EVENT_LABELS[e]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <IconBtn type="submit" text={busy ? "Adding..." : "Add webhook"} disabled={busy || !form.events.length} />
          <button type="button" onClick={() => setShowSnippet((v) => !v)} className="text-sm text-blue-100 hover:underline">
            {showSnippet ? "Hide" : "How to verify signatures"}
          </button>
        </div>
        {showSnippet && (
          <pre className="mt-4 overflow-x-auto rounded bg-richblack-900 p-4 text-xs text-richblack-50">{VERIFY_SNIPPET}</pre>
        )}
      </form>

      {hooks === null ? (
        <div className="spinner" />
      ) : hooks.length === 0 ? (
        <p className="text-richblack-300">No webhooks yet.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {hooks.map((hook) => (
            <li key={hook._id} className="rounded-md border border-richblack-700 bg-richblack-800 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-all font-medium text-richblack-5">{hook.url}</p>
                  {hook.description && <p className="text-sm text-richblack-300">{hook.description}</p>}
                  <p className="mt-1 text-xs text-richblack-300">
                    {hook.events.join(", ")} · last delivery {when(hook.lastDeliveryAt)}
                  </p>
                  {!hook.active && (
                    <p className="mt-1 text-xs text-pink-200">{hook.disabledReason || "Paused"}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-3 text-sm">
                  <button
                    onClick={async () => {
                      if (!(await sendTestWebhook(token, hook._id))) return
                      setOpen(hook._id)
                      setTimeout(() => setRefresh((n) => n + 1), 1500)
                    }}
                    className="text-blue-100 hover:underline"
                  >
                    Send test
                  </button>
                  <button onClick={() => setOpen(open === hook._id ? null : hook._id)} className="text-blue-100 hover:underline">
                    {open === hook._id ? "Hide deliveries" : "Deliveries"}
                  </button>
                  <button onClick={() => setActive(hook, !hook.active)} className="text-richblack-100 hover:underline">
                    {hook.active ? "Pause" : "Resume"}
                  </button>
                  <button onClick={() => rotate(hook)} className="text-richblack-100 hover:underline">
                    Rotate secret
                  </button>
                  <button onClick={() => remove(hook)} className="text-pink-200 hover:underline">
                    Delete
                  </button>
                </div>
              </div>
              {open === hook._id && <Deliveries token={token} hookId={hook._id} refresh={refresh} />}
            </li>
          ))}
        </ul>
      )}
      {confirmModal}
    </div>
  )
}
