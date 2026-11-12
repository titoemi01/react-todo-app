import { useState, useEffect } from 'react'

const STORAGE_KEY = 'theme'

// Start from the saved choice; if there is none, follow the device's light/dark setting.
function getInitialTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // localStorage can be blocked (private mode); fall through to the device setting
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export default function useTheme() {
  const [theme, setTheme] = useState(getInitialTheme)

  // The CSS reads <html data-theme="dark|light">, so keep that attribute in sync with state.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // not saved, but the toggle still works for this visit
    }
  }

  return { theme, toggleTheme }
}
