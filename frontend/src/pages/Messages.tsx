import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { ApiError, imageUrl } from '../api/client'
import { MAX_MESSAGE_LENGTH, messagesApi } from '../api/messages'
import ErrorMessage from '../components/ErrorMessage'
import Spinner from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import { useRealtime, useRealtimeEvent } from '../context/RealtimeContext'
import { STATUS_LABELS, formatPrice } from '../lib/format'
import { usePageTitle } from '../lib/usePageTitle'
import type { Conversation, ConversationDetail, Message } from '../types'

/** „14:05” azi, „ieri 14:05”, „12 oct. 14:05” mai demult */
function formatTime(iso: string) {
  const d = new Date(iso)
  const time = d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return time
  if (d.toDateString() === yesterday.toDateString()) return `ieri ${time}`
  return `${d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' })} ${time}`
}

/** Adaugă mesajul doar dacă nu există: îl primim și din răspunsul POST, și pe WebSocket. */
const appendUnique = (messages: Message[], m: Message) =>
  messages.some((x) => x.id === m.id) ? messages : [...messages, m]

export default function Messages() {
  usePageTitle('Mesaje')
  const { id } = useParams()
  const activeId = id ? Number(id) : null
  const { refreshUnread, status } = useRealtime()

  const [conversations, setConversations] = useState<Conversation[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadList = useCallback(() => {
    messagesApi
      .list()
      .then(setConversations)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Nu am putut încărca mesajele'))
  }, [])

  useEffect(loadList, [loadList])

  // După ce firul deschis marchează mesajele ca citite, bulina din meniu și lista
  // trebuie recitite; altfel lista poate rămâne cu numărul vechi (cererile se pot încrucișa)
  const handleRead = useCallback(() => {
    refreshUnread()
    loadList()
  }, [refreshUnread, loadList])

  // Orice mesaj nou sau reconectare: lista se reordonează și își actualizează previzualizările
  useRealtimeEvent((e) => {
    if (e.type === 'message' || e.type === 'reconnected') loadList()
  })

  return (
    <div className="py-6">
      <h1 className="mb-4 text-2xl font-bold">Mesaje</h1>
      {status !== 'online' && conversations && (
        <p role="status" className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Se reconectează… mesajele noi vor apărea imediat ce revine legătura.
        </p>
      )}
      <ErrorMessage message={error} />

      {!conversations && !error && <Spinner />}

      {conversations?.length === 0 && (
        <div className="rounded-lg bg-white p-10 text-center ring-1 ring-slate-200">
          <p className="font-medium">Nu ai nicio conversație.</p>
          <p className="mt-1 text-sm text-slate-500">Deschide un anunț și scrie-i vânzătorului.</p>
          <Link to="/" className="mt-3 inline-block text-sm font-medium text-blue-600 hover:underline">
            Vezi anunțurile
          </Link>
        </div>
      )}

      {conversations && conversations.length > 0 && (
        <div className="grid overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200 md:h-[70vh] md:grid-cols-[20rem_1fr]">
          {/* Pe mobil: ori lista, ori conversația deschisă */}
          <ul
            data-testid="conversation-list"
            className={`overflow-y-auto border-slate-200 md:border-r ${activeId ? 'hidden md:block' : ''}`}
          >
            {conversations.map((c) => {
              // Conversația deschisă pe ecran e citită, chiar dacă lista n-a apucat să se reîncarce
              const unread = c.id === activeId ? 0 : c.unread_count
              return (
                <li key={c.id}>
                  <Link
                    to={`/messages/${c.id}`}
                    className={`flex gap-3 border-b border-slate-100 p-3 hover:bg-slate-50 ${c.id === activeId ? 'bg-blue-50' : ''}`}
                  >
                    <img src={imageUrl(c.listing.main_image)} alt="" className="h-12 w-16 shrink-0 rounded object-cover" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className={`truncate text-sm ${unread ? 'font-bold' : 'font-medium'}`}>{c.other_user.full_name}</p>
                        {c.last_message && <span className="shrink-0 text-xs text-slate-400">{formatTime(c.last_message.created_at)}</span>}
                      </div>
                      <p className="truncate text-xs text-slate-500">{c.listing.title}</p>
                      <div className="flex items-center justify-between gap-2">
                        <p className={`truncate text-sm ${unread ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>
                          {c.last_message?.body}
                        </p>
                        {unread > 0 && (
                          <span className="shrink-0 rounded-full bg-blue-600 px-2 text-xs font-semibold text-white" aria-label={`${unread} necitite`}>
                            {unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>

          <section className={`min-h-0 ${activeId ? '' : 'hidden md:flex'} md:flex md:flex-col`}>
            {activeId ? (
              <Thread key={activeId} conversationId={activeId} onRead={handleRead} onSent={loadList} />
            ) : (
              <p className="m-auto p-10 text-sm text-slate-500">Alege o conversație din stânga.</p>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

function Thread({ conversationId, onRead, onSent }: { conversationId: number; onRead: () => void; onSent: () => void }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [conversation, setConversation] = useState<ConversationDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const load = useCallback(() => {
    messagesApi
      .get(conversationId) // marchează și ca citite mesajele primite
      .then((c) => {
        setConversation(c)
        onRead()
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Conversația nu a putut fi încărcată'))
  }, [conversationId, onRead])

  useEffect(load, [load])

  useRealtimeEvent((e) => {
    if (e.type === 'reconnected') return load()
    if (e.type === 'message' && e.message.conversation_id === conversationId) {
      setConversation((c) => (c ? { ...c, messages: appendUnique(c.messages, e.message) } : c))
      // Conversația e deschisă pe ecran → mesajul primit e citit pe loc
      if (e.message.sender_id !== user?.id) messagesApi.markRead(conversationId).then(onRead).catch(() => {})
    }
    if (e.type === 'read' && e.conversation_id === conversationId) {
      const ids = new Set(e.message_ids)
      const now = new Date().toISOString()
      setConversation((c) =>
        c ? { ...c, messages: c.messages.map((m) => (ids.has(m.id) && !m.read_at ? { ...m, read_at: now } : m)) } : c,
      )
    }
  })

  // Derulare automată la ultimul mesaj (înainte de afișare, ca să nu se vadă săritura)
  const count = conversation?.messages.length ?? 0
  useLayoutEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [count])

  async function send(e?: FormEvent) {
    e?.preventDefault()
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    setSendError(null)
    try {
      const message = await messagesApi.send(conversationId, body)
      setConversation((c) => (c ? { ...c, messages: appendUnique(c.messages, message) } : c))
      setDraft('')
      onSent()
    } catch (err) {
      // Textul rămâne în câmp, ca utilizatorul să poată încerca din nou
      setSendError(err instanceof ApiError ? err.message : 'Mesajul nu a putut fi trimis')
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  // Enter trimite, Shift+Enter face rând nou (ca în aplicațiile de chat obișnuite)
  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send()
    }
  }

  if (error) return <div className="p-6"><ErrorMessage message={error} /></div>
  if (!conversation) return <Spinner />

  const { listing, other_user, messages } = conversation
  const lastOwn = [...messages].reverse().find((m) => m.sender_id === user?.id)

  return (
    <div className="flex h-[75vh] flex-col md:h-full" data-testid="thread">
      <header className="flex items-center gap-3 border-b border-slate-200 p-3">
        <button type="button" onClick={() => navigate('/messages')} className="text-xl text-slate-500 md:hidden" aria-label="Înapoi la conversații">
          ‹
        </button>
        <Link to={`/listings/${listing.id}`} className="flex min-w-0 flex-1 items-center gap-3 hover:opacity-80">
          <img src={imageUrl(listing.main_image)} alt="" className="h-10 w-14 shrink-0 rounded object-cover" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{listing.title}</p>
            <p className="text-xs text-slate-500">
              {formatPrice(listing.price, listing.currency)} · {conversation.role === 'buyer' ? 'vânzător' : 'interesat'}: {other_user.full_name}
              {listing.status !== 'active' && ` · ${STATUS_LABELS[listing.status]}`}
            </p>
          </div>
        </Link>
      </header>

      <ol className="flex-1 space-y-2 overflow-y-auto bg-slate-50 p-4" aria-live="polite" data-testid="messages">
        {messages.map((m) => {
          const mine = m.sender_id === user?.id
          return (
            <li key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`} data-mine={mine}>
              {/* Textul e afișat ca text de React (escapat automat), deci un <script> din mesaj nu rulează */}
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-line break-words ${
                  mine ? 'rounded-br-sm bg-blue-600 text-white' : 'rounded-bl-sm bg-white text-slate-900 ring-1 ring-slate-200'
                }`}
              >
                {m.body}
              </div>
              <span className="mt-0.5 text-[11px] text-slate-400">
                {formatTime(m.created_at)}
                {m.id === lastOwn?.id && (m.read_at ? ' · Văzut' : ' · Trimis')}
              </span>
            </li>
          )
        })}
        <div ref={bottomRef} />
      </ol>

      <form onSubmit={send} className="border-t border-slate-200 p-3">
        {sendError && <p role="alert" className="mb-2 text-sm text-red-600">{sendError}</p>}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKey}
            rows={1}
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder="Scrie un mesaj…"
            aria-label="Mesaj"
            className="max-h-32 min-h-10 flex-1 resize-y rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Trimite
          </button>
        </div>
        {draft.length > MAX_MESSAGE_LENGTH - 200 && (
          <p className="mt-1 text-right text-xs text-slate-400">{draft.length} / {MAX_MESSAGE_LENGTH}</p>
        )}
      </form>
    </div>
  )
}
