import type { Payment, PaymentsConfig } from '../types'
import { api } from './client'

export const paymentsApi = {
  config: () => api<PaymentsConfig>('/payments/config'),

  /** Întoarce adresa paginii de plată Stripe; aplicația redirecționează acolo. */
  promote: (listingId: number) => api<{ checkout_url: string }>(`/listings/${listingId}/promote`, { method: 'POST' }),

  /** După întoarcerea de pe Stripe: serverul verifică plata direct la Stripe. */
  confirm: (sessionId: string) => api<Payment>('/payments/confirm', { method: 'POST', body: { session_id: sessionId } }),

  mine: () => api<Payment[]>('/payments'),
}
