import type { Conversation, ConversationDetail, Message } from '../types'
import { api } from './client'

export const MAX_MESSAGE_LENGTH = 2000 // aceeași limită ca în schemas/message.py

export const messagesApi = {
  list: () => api<Conversation[]>('/conversations'),

  /** Deschiderea unei conversații marchează ca citite mesajele primite. */
  get: (id: number | string) => api<ConversationDetail>(`/conversations/${id}`),

  /** Primul mesaj către vânzător; dacă discuția există deja, o continuă. */
  start: (listingId: number, body: string) =>
    api<ConversationDetail>('/conversations', { method: 'POST', body: { listing_id: listingId, body } }),

  send: (conversationId: number, body: string) =>
    api<Message>(`/conversations/${conversationId}/messages`, { method: 'POST', body: { body } }),

  markRead: (conversationId: number) => api<void>(`/conversations/${conversationId}/read`, { method: 'POST' }),

  unreadCount: () => api<{ count: number }>('/conversations/unread-count'),
}
