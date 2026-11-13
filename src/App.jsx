import './App.css'
import Header from './components/Header'
import ThemeToggle from './components/ThemeToggle'
import AuthForm from './components/AuthForm'
import TaskApp from './components/TaskApp'
import useAuth from './hooks/useAuth'
import useTheme from './hooks/useTheme'

// App decides WHAT to show: a loading message, the sign-in form, or the signed-in task list.
function App() {
  const { theme, toggleTheme } = useTheme()
  const { user, loading, problem, signIn, signUp, signOut, removeAccount, expire } = useAuth()

  return (
    <div className="app-container">
      <div className="app-topbar">
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </div>

      <Header title="My Tasks" subtitle="Organize your day, one task at a time." />

      {loading ? (
        <main className="todo-content">
          <p className="empty-message">Loading...</p>
        </main>
      ) : user ? (
        // key={user.id}: signing in as someone else starts from a clean screen
        <TaskApp
          key={user.id}
          user={user}
          onSignOut={signOut}
          onDeleteAccount={removeAccount}
          onUnauthorized={expire}
        />
      ) : (
        <main className="todo-content">
          {problem && (
            <p className="error-message" role="alert">
              {problem}
            </p>
          )}
          <AuthForm onSignIn={signIn} onSignUp={signUp} />
        </main>
      )}
    </div>
  )
}

export default App
