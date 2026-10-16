import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { API_URL, getAccessToken, refreshSession } from '../api/client'
import { messagesApi } from '../api/messages'
import type { RealtimeEvent } from '../types'
import { useAuth } from './AuthContext'

type Status = 'offline' | 'connecting' | 'online'
type Listener = (event: RealtimeEvent) => void

type RealtimeContextValue = {
  status: Status
  unreadCount: number
  refreshUnread: () => void
  /** Întoarce funcția de dezabonare (de pus în cleanup-ul unui useEffect). */
  subscribe: (listener: Listener) => () => void
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null)

const WS_URL = API_URL.replace(/^http/, 'ws') + '/ws' // http→ws, https→wss
const PING_EVERY_MS = 25_000
const MAX_RETRY_MS = 15_000
const CLOSE_UNAUTHORIZED = 4401 // trebuie să coincidă cu backend/app/routers/ws.py

/**
 * O singură conexiune WebSocket pentru toată aplicația, deschisă cât timp
 * utilizatorul e logat. Prin ea vin doar notificări; mesajele se trimit prin REST.
 *
 * - autentificare: access token-ul în primul mesaj (nu în URL, ar ajunge în log-uri)
 * - token expirat (cod 4401): refresh din cookie, apoi reconectare
 * - conexiune căzută: reconectare cu pauze tot mai mari (1s, 2s, 4s … max 15s)
 * - după reconectare: eveniment „reconnected”, ca paginile să-și reîncarce datele
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const userId = user?.id ?? null

  // Starea ține minte utilizatorul căruia îi aparține: după logout sau schimbarea
  // contului, valorile vechi nu se mai afișează nici măcar pentru o clipă
  const [connection, setConnection] = useState<{ userId: number | null; status: Status }>({ userId: null, status: 'offline' })
  const [unread, setUnread] = useState<{ userId: number | null; count: number }>({ userId: null, count: 0 })
  const status: Status = connection.userId === userId ? connection.status : 'offline'
  const unreadCount = unread.userId === userId ? unread.count : 0
  const listeners = useRef(new Set<Listener>())

  const emit = useCallback((event: RealtimeEvent) => listeners.current.forEach((l) => l(event)), [])

  const refreshUnread = useCallback(() => {
    if (userId === null) return
    messagesApi
      .unreadCount()
      .then((r) => setUnread({ userId, count: r.count }))
      .catch(() => {})
  }, [userId])

  useEffect(() => {
    if (userId === null) return
    const setStatus = (s: Status) => setConnection({ userId, status: s })

    let ws: WebSocket | null = null
    let stopped = false
    let attempt = 0
    let connectedBefore = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let pingTimer: ReturnType<typeof setInterval> | undefined

    function scheduleReconnect() {
      if (stopped) return
      const delay = Math.min(1000 * 2 ** attempt, MAX_RETRY_MS)
      attempt += 1
      retryTimer = setTimeout(connect, delay)
    }

    async function connect() {
      if (stopped) return
      setStatus('connecting')
      // Tokenul din memorie poate lipsi sau fi expirat; refresh-ul îl reînnoiește din cookie
      let token = getAccessToken()
      if (!token) token = (await refreshSession())?.access_token ?? null
      if (stopped) return
      if (!token) {
        setStatus('offline')
        return scheduleReconnect()
      }

      const socket = new WebSocket(WS_URL)
      ws = socket
      socket.onopen = () => socket.send(JSON.stringify({ type: 'auth', token }))

      socket.onmessage = (e) => {
        if (e.data === 'pong') return
        const data = JSON.parse(e.data)
        if (data.type === 'ready') {
          attempt = 0
          setStatus('online')
          refreshUnread()
          if (connectedBefore) emit({ type: 'reconnected' })
          connectedBefore = true
          clearInterval(pingTimer)
          pingTimer = setInterval(() => socket.readyState === WebSocket.OPEN && socket.send('ping'), PING_EVERY_MS)
          return
        }
        emit(data as RealtimeEvent)
        refreshUnread() // un mesaj nou sau citit schimbă numărul de necitite
      }

      socket.onclose = async (e) => {
        clearInterval(pingTimer)
        if (stopped) return
        setStatus('offline')
        if (e.code === CLOSE_UNAUTHORIZED) await refreshSession() // token expirat → unul nou
        scheduleReconnect()
      }
    }

    connect()

    return () => {
      // Logout sau demontare (inclusiv dublul montaj din StrictMode): oprim tot
      stopped = true
      clearTimeout(retryTimer)
      clearInterval(pingTimer)
      ws?.close()
    }
  }, [userId, emit, refreshUnread])

  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener)
    return () => {
      listeners.current.delete(listener)
    }
  }, [])

  const value = useMemo(
    () => ({ status, unreadCount, refreshUnread, subscribe }),
    [status, unreadCount, refreshUnread, subscribe],
  )
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>
}

export function useRealtime() {
  const ctx = useContext(RealtimeContext)
  if (!ctx) throw new Error('useRealtime trebuie folosit în interiorul <RealtimeProvider>')
  return ctx
}

/** Ascultă evenimentele WebSocket cât timp componenta e afișată. */
export function useRealtimeEvent(listener: Listener) {
  const { subscribe } = useRealtime()
  const latest = useRef(listener)
  useEffect(() => {
    latest.current = listener
  })
  useEffect(() => subscribe((e) => latest.current(e)), [subscribe])
}
