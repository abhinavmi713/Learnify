import { useCallback, useEffect, useState } from "react"

import { applyTheme, getStoredTheme } from "../utils/theme"

export default function useTheme() {
  const [theme, setThemeState] = useState(getStoredTheme)

  useEffect(() => {
    const onChange = (e) => setThemeState(e.detail)
    window.addEventListener("learnify-theme", onChange)
    return () => window.removeEventListener("learnify-theme", onChange)
  }, [])

  const setTheme = useCallback((id) => applyTheme(id), [])
  return [theme, setTheme]
}
