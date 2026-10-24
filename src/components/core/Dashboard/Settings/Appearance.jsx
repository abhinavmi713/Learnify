import { Check } from "lucide-react"

import useTheme from "../../../../hooks/useTheme"
import { THEMES } from "../../../../utils/theme"

export default function Appearance() {
  const [theme, setTheme] = useTheme()

  return (
    <div className="surface my-10 p-8 px-6 sm:px-12">
      <h2 className="font-display text-lg font-bold text-richblack-5">Appearance</h2>
      <p className="mt-1 text-sm text-richblack-300">
        Pick the look you like. It is saved on this device.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {THEMES.map((t) => {
          const active = theme === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              aria-pressed={active}
              className={`rounded-2xl border-2 p-3 text-left transition-all hover:-translate-y-0.5 ${
                active ? "border-yellow-50" : "border-richblack-600"
              }`}
            >
              <span
                className="relative flex h-20 overflow-hidden rounded-xl border border-richblack-600"
                style={{ background: t.swatch[0] }}
              >
                <span
                  className="m-3 h-5 w-14 rounded-full"
                  style={{ background: t.swatch[1] }}
                />
                <span
                  className="absolute bottom-3 right-3 h-6 w-6 rounded-full"
                  style={{ background: t.swatch[2] }}
                />
              </span>
              <span className="mt-3 flex items-center justify-between">
                <span>
                  <span className="block text-sm font-semibold text-richblack-5">{t.name}</span>
                  <span className="block text-xs text-richblack-300">{t.blurb}</span>
                </span>
                {active && <Check size={18} className="text-yellow-50" />}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
