import { Check, Palette } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import useTheme from "../../hooks/useTheme"
import { THEMES } from "../../utils/theme"

function Swatch({ colors }) {
  return (
    <span className="flex h-8 w-12 shrink-0 overflow-hidden rounded-lg border border-richblack-600">
      <span className="h-full flex-1" style={{ background: colors[0] }} />
      <span className="h-full w-3" style={{ background: colors[1] }} />
      <span className="h-full w-3" style={{ background: colors[2] }} />
    </span>
  )
}

// `inline` renders the options as a plain list (used inside the mobile drawer).
export default function ThemeSwitcher({ inline = false }) {
  const [theme, setTheme] = useTheme()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const esc = (e) => e.key === "Escape" && setOpen(false)
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", esc)
    return () => {
      document.removeEventListener("mousedown", close)
      document.removeEventListener("keydown", esc)
    }
  }, [open])

  const options = (
    <ul role="listbox" aria-label="Colour theme" className="flex flex-col gap-1">
      {THEMES.map((t) => (
        <li key={t.id}>
          <button
            role="option"
            aria-selected={theme === t.id}
            onClick={() => {
              setTheme(t.id)
              setOpen(false)
            }}
            className={`flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-richblack-700 ${
              theme === t.id ? "bg-richblack-700" : ""
            }`}
          >
            <Swatch colors={t.swatch} />
            <span className="flex-1">
              <span className="block text-sm font-semibold text-richblack-5">{t.name}</span>
              <span className="block text-xs text-richblack-300">{t.blurb}</span>
            </span>
            {theme === t.id && <Check size={16} className="text-yellow-50" />}
          </button>
        </li>
      ))}
    </ul>
  )

  if (inline) return options

  return (
    <div className="relative" ref={ref}>
      <button
        aria-label="Change theme"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="grid h-9 w-9 place-items-center rounded-full border border-richblack-600 text-richblack-100 transition-colors hover:border-yellow-50 hover:text-yellow-50"
      >
        <Palette size={18} />
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-[1000] w-64 rounded-2xl border border-richblack-700 bg-richblack-800 p-2 shadow-card">
          <p className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-richblack-300">
            Theme
          </p>
          {options}
        </div>
      )}
    </div>
  )
}
