import { useEffect, useState } from "react"
import { useDispatch, useSelector } from "react-redux"
import { useNavigate } from "react-router-dom"

import useConfirm from "../../../../hooks/useConfirm"
import { logout } from "../../../../services/operations/authAPI"
import {
  disableTwoFactor,
  enableTwoFactor,
  getSessions,
  logoutEverywhere,
  revokeSession,
  startTwoFactorSetup,
} from "../../../../services/operations/securityAPI"
import { setUser } from "../../../../slices/profileSlice"
import IconBtn from "../../../Common/IconBtn"

// Readable device name from a user-agent string.
function describeDevice(ua = "") {
  const browsers = [
    [/Edg\//, "Edge"],
    [/Chrome\//, "Chrome"],
    [/Firefox\//, "Firefox"],
    [/Safari\//, "Safari"],
  ]
  const systems = [
    [/Windows/, "Windows"],
    [/Android/, "Android"],
    [/iPhone|iPad/, "iOS"],
    [/Mac OS X/, "macOS"],
    [/Linux/, "Linux"],
  ]
  const browser = browsers.find(([re]) => re.test(ua))?.[1] || "Browser"
  const os = systems.find(([re]) => re.test(ua))?.[1]
  return os ? `${browser} on ${os}` : browser
}

const when = (d) => new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })

const outlineBtn =
  "rounded-md border border-richblack-600 px-4 py-2 text-sm text-richblack-50 hover:border-pink-200 hover:text-pink-200"

function TwoFactor() {
  const { token } = useSelector((state) => state.auth)
  const { user } = useSelector((state) => state.profile)
  const dispatch = useDispatch()
  const [setup, setSetup] = useState(null) // { qrCode, secret }
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [recoveryCodes, setRecoveryCodes] = useState(null)
  const [disabling, setDisabling] = useState(false)
  const [busy, setBusy] = useState(false)

  const enabled = Boolean(user?.twoFactorEnabled)
  const setEnabled = (value) => dispatch(setUser({ ...user, twoFactorEnabled: value }))

  const begin = async () => {
    setBusy(true)
    setSetup(await startTwoFactorSetup(token))
    setBusy(false)
  }

  const confirmSetup = async (e) => {
    e.preventDefault()
    setBusy(true)
    const codes = await enableTwoFactor(token, code.trim())
    setBusy(false)
    if (!codes) return
    setRecoveryCodes(codes)
    setSetup(null)
    setCode("")
    setEnabled(true)
  }

  const turnOff = async (e) => {
    e.preventDefault()
    setBusy(true)
    const ok = await disableTwoFactor(token, password, code.trim())
    setBusy(false)
    if (!ok) return
    setDisabling(false)
    setPassword("")
    setCode("")
    setRecoveryCodes(null)
    setEnabled(false)
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-richblack-5">Two-factor authentication</p>
          <p className="mt-1 text-sm text-richblack-300">
            {enabled
              ? "On. Signing in needs your password and a code from your authenticator app."
              : "Add a second sign-in step with an authenticator app such as Google Authenticator or 1Password."}
          </p>
          {!enabled && user?.accountType === "Admin" && (
            <p className="mt-1 text-sm text-yellow-100">Strongly recommended for admin accounts.</p>
          )}
        </div>
        {!enabled && !setup && <IconBtn text={busy ? "Starting..." : "Set up"} onclick={begin} disabled={busy} />}
        {enabled && !disabling && (
          <button onClick={() => setDisabling(true)} className={outlineBtn}>
            Turn off
          </button>
        )}
      </div>

      {setup && (
        <form onSubmit={confirmSetup} className="mt-6 flex flex-col gap-5 sm:flex-row">
          <img
            src={setup.qrCode}
            alt="QR code for your authenticator app"
            className="h-44 w-44 rounded-lg bg-white p-2"
          />
          <div className="flex flex-1 flex-col gap-3">
            <p className="text-sm text-richblack-100">
              1. Scan the QR code with your authenticator app, or enter this key manually:
            </p>
            <code className="break-all rounded bg-richblack-700 px-3 py-2 text-sm text-yellow-50">{setup.secret}</code>
            <label className="text-sm text-richblack-100" htmlFor="totp-code">
              2. Enter the 6-digit code it shows:
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                id="totp-code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                className="form-style w-36 tracking-widest"
              />
              <IconBtn type="submit" text={busy ? "Checking..." : "Turn on"} disabled={busy} />
              <button type="button" onClick={() => setSetup(null)} className="text-sm text-richblack-300">
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      {recoveryCodes && (
        <div className="mt-6 rounded-lg border border-yellow-100/40 bg-richblack-700 p-4">
          <p className="font-semibold text-richblack-5">Save your recovery codes</p>
          <p className="mt-1 text-sm text-richblack-300">
            Each code signs you in once if you lose your phone. They will not be shown again.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm text-yellow-50 sm:grid-cols-4">
            {recoveryCodes.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <div className="mt-4 flex gap-3">
            <button
              onClick={() => navigator.clipboard?.writeText(recoveryCodes.join("\n"))}
              className="rounded-md border border-richblack-600 px-3 py-1.5 text-sm text-richblack-50"
            >
              Copy
            </button>
            <button onClick={() => setRecoveryCodes(null)} className="text-sm text-richblack-300">
              I have saved them
            </button>
          </div>
        </div>
      )}

      {disabling && (
        <form onSubmit={turnOff} className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-col gap-1 text-sm text-richblack-100">
            Password
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="form-style"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-richblack-100">
            Code or recovery code
            <input required value={code} onChange={(e) => setCode(e.target.value)} className="form-style" />
          </label>
          <IconBtn type="submit" text={busy ? "Turning off..." : "Confirm"} disabled={busy} />
          <button type="button" onClick={() => setDisabling(false)} className="text-sm text-richblack-300">
            Cancel
          </button>
        </form>
      )}
    </div>
  )
}

function Sessions() {
  const { token } = useSelector((state) => state.auth)
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const [confirm, confirmModal] = useConfirm()
  const [sessions, setSessions] = useState(null)

  const load = async () => setSessions(await getSessions(token))

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const signOut = async (id) => {
    if (await revokeSession(token, id)) load()
  }

  const signOutEverywhere = async () => {
    const ok = await confirm({
      title: "Sign out everywhere?",
      body: "Every device, including this one, will need to log in again.",
      confirmText: "Sign out everywhere",
    })
    if (ok && (await logoutEverywhere(token))) dispatch(logout(navigate))
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-richblack-5">Where you are signed in</p>
          <p className="mt-1 text-sm text-richblack-300">Sign out of any device you do not recognise.</p>
        </div>
        <button onClick={signOutEverywhere} className={outlineBtn}>
          Sign out everywhere
        </button>
      </div>
      <ul className="mt-4 divide-y divide-richblack-700">
        {sessions === null && <li className="py-3 text-sm text-richblack-300">Loading...</li>}
        {sessions?.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div>
              <p className="text-sm text-richblack-5">
                {describeDevice(s.userAgent)}
                {s.current && (
                  <span className="ml-2 rounded-full bg-caribbeangreen-700 px-2 py-0.5 text-[11px] text-caribbeangreen-50">
                    This device
                  </span>
                )}
              </p>
              <p className="text-xs text-richblack-300">
                Signed in {when(s.startedAt)} · last active {when(s.lastActiveAt)}
                {s.ip ? ` · ${s.ip}` : ""}
              </p>
            </div>
            {!s.current && (
              <button onClick={() => signOut(s.id)} className="text-sm text-pink-200 hover:underline">
                Sign out
              </button>
            )}
          </li>
        ))}
      </ul>
      {confirmModal}
    </div>
  )
}

export default function AccountSecurity() {
  return (
    <div className="my-10 flex flex-col gap-y-8 rounded-md border-[1px] border-richblack-700 bg-richblack-800 p-8 px-6 sm:px-12">
      <h2 className="text-lg font-semibold text-richblack-5">Security</h2>
      <TwoFactor />
      <Sessions />
    </div>
  )
}
