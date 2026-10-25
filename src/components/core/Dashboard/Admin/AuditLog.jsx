import { useEffect, useState } from "react"
import { useSelector } from "react-redux"

import useDebouncedValue from "../../../../hooks/useDebouncedValue"
import { getAuditLogs } from "../../../../services/operations/adminAPI"

const when = (d) => new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" })

// Short readable summary of an entry's details.
function details(row) {
  const parts = []
  if (row.targetType) parts.push(`${row.targetType}${row.targetId ? ` ${row.targetId}` : ""}`)
  const meta = { ...(row.metadata || {}) }
  delete meta.status
  for (const [k, v] of Object.entries(meta)) {
    if (v !== undefined && v !== null && v !== "") parts.push(`${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
  }
  return parts.join(" · ")
}

export default function AuditLog() {
  const { token } = useSelector((state) => state.auth)
  const [rows, setRows] = useState([])
  const [actions, setActions] = useState([])
  const [nextCursor, setNextCursor] = useState(null)
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState("")
  const [outcome, setOutcome] = useState("")
  const [actor, setActor] = useState("")
  const debouncedActor = useDebouncedValue(actor, 300)

  const load = async (before = "") => {
    setLoading(true)
    const res = await getAuditLogs(token, { action, outcome, actor: debouncedActor, before })
    setRows((prev) => (before ? [...prev, ...res.items] : res.items))
    setNextCursor(res.nextCursor)
    if (res.actions.length) setActions(res.actions)
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, outcome, debouncedActor])

  return (
    <div>
      <h1 className="mb-2 font-display text-3xl font-bold text-richblack-5">Audit Log</h1>
      <p className="mb-8 text-sm text-richblack-300">
        Sign-ins, security changes and admin actions. Entries cannot be edited or deleted.
      </p>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <input
          value={actor}
          onChange={(e) => setActor(e.target.value)}
          placeholder="Filter by user email"
          className="form-style flex-1"
        />
        <select value={action} onChange={(e) => setAction(e.target.value)} className="form-style sm:w-64">
          <option value="">All actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className="form-style sm:w-40">
          <option value="">Any outcome</option>
          <option value="success">Success</option>
          <option value="failure">Failure</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-richblack-700">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-richblack-800 text-richblack-100">
            <tr>
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Who</th>
              <th className="px-4 py-3 font-medium">Details</th>
              <th className="px-4 py-3 font-medium">From</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-richblack-700">
            {rows.map((row) => (
              <tr key={row._id} className="align-top text-richblack-50">
                <td className="whitespace-nowrap px-4 py-3 text-richblack-300">{when(row.createdAt)}</td>
                <td className="px-4 py-3">
                  <span className="font-mono text-xs">{row.action}</span>
                  {row.outcome === "failure" && (
                    <span className="ml-2 rounded-full bg-pink-900 px-2 py-0.5 text-[11px] text-pink-100">failed</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {row.actorEmail || <span className="text-richblack-400">anonymous</span>}
                  {row.actorRole && <span className="block text-xs text-richblack-400">{row.actorRole}</span>}
                </td>
                <td className="max-w-[280px] break-words px-4 py-3 text-xs text-richblack-200">{details(row) || "-"}</td>
                <td className="px-4 py-3 text-xs text-richblack-300">{row.ip || "-"}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-richblack-300">
                  No entries match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex justify-center">
        {loading ? (
          <div className="spinner" />
        ) : (
          nextCursor && (
            <button
              onClick={() => load(nextCursor)}
              className="rounded-md border border-richblack-600 px-4 py-2 text-sm text-richblack-50 hover:border-yellow-50"
            >
              Load older entries
            </button>
          )
        )}
      </div>
    </div>
  )
}
