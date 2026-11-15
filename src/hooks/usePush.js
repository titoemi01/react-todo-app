import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'

// The server sends its public key as URL-safe base64; the browser wants raw bytes.
function keyToBytes(base64) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(padded), (ch) => ch.charCodeAt(0))
}

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

// What this browser can do about alerts:
//   'unsupported'  - the browser has no push alerts at all
//   'needs-install' - iPhone/iPad: alerts only work once the site is added to the Home Screen
//   'blocked'      - the person said "Block" to notifications
//   'off' / 'on'   - can be turned on / is on
function detectState() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const installed = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
  if (ios && !installed) return 'needs-install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  return 'off'
}

export default function usePush() {
  const [state, setState] = useState(detectState)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  // On load: are alerts already on for this browser? If so, refresh the saved time zone too
  // (it follows you when you travel).
  useEffect(() => {
    if (detectState() !== 'off') return
    let cancelled = false
    ;(async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration()
        const subscription = await registration?.pushManager.getSubscription()
        if (subscription && Notification.permission === 'granted') {
          await api.pushSubscribe(subscription.toJSON(), timeZone())
          if (!cancelled) setState('on')
        }
      } catch {
        // not signed in yet, or offline: stay "off"; nothing to show
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const enable = useCallback(async () => {
    setBusy(true)
    setMessage('')
    try {
      const permission = await Notification.requestPermission() // must be called from a click
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'off')
        setMessage('Alerts were not allowed. You can change this in your browser settings for this site.')
        return
      }
      const { key } = await api.pushKey()
      const registration = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(key) }))
      await api.pushSubscribe(subscription.toJSON(), timeZone())
      setState('on')
      setMessage('Alerts are on for this device.')
    } catch (error) {
      setMessage(error.message || 'Could not turn alerts on.')
    } finally {
      setBusy(false)
    }
  }, [])

  const disable = useCallback(async () => {
    setBusy(true)
    setMessage('')
    try {
      const registration = await navigator.serviceWorker.getRegistration()
      const subscription = await registration?.pushManager.getSubscription()
      if (subscription) {
        await api.pushUnsubscribe(subscription.endpoint).catch(() => {})
        await subscription.unsubscribe()
      }
      setState('off')
      setMessage('Alerts are off for this device.')
    } catch (error) {
      setMessage(error.message || 'Could not turn alerts off.')
    } finally {
      setBusy(false)
    }
  }, [])

  const sendTest = useCallback(async () => {
    setBusy(true)
    setMessage('')
    try {
      await api.pushTest()
      setMessage('Test sent. It should appear in a few seconds.')
    } catch (error) {
      setMessage(error.message || 'Could not send the test.')
    } finally {
      setBusy(false)
    }
  }, [])

  return { state, busy, message, enable, disable, sendTest }
}
