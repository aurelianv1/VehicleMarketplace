import type { ListingCard } from '../types'
import { api } from './client'

type FavoriteState = { is_favorite: boolean }

export const favoritesApi = {
  list: () => api<ListingCard[]>('/favorites'),

  add: (listingId: number) => api<FavoriteState>(`/favorites/${listingId}`, { method: 'POST' }),

  remove: (listingId: number) => api<FavoriteState>(`/favorites/${listingId}`, { method: 'DELETE' }),
}
