import { Moon, Sun } from 'lucide-react'

// Shows the icon of the theme you would switch TO: a moon in light mode, a sun in dark mode.
function ThemeToggle({ theme, onToggle }) {
  const goingDark = theme !== 'dark'
  const label = goingDark ? 'Switch to dark mode' : 'Switch to light mode'

  return (
    <button type="button" className="theme-toggle" onClick={onToggle} aria-label={label} title={label}>
      {goingDark ? <Moon size={20} /> : <Sun size={20} />}
    </button>
  )
}

export default ThemeToggle
