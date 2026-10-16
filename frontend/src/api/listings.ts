import type { ListingCard, ListingDetail, Page } from '../types'
import { api } from './client'

/** Parametrii acceptați de GET /listings; restul cheilor din URL sunt ignorate. */
export const LISTING_FILTER_KEYS = [
  'q',
  'brand',
  'model',
  'city',
  'price_min',
  'price_max',
  'year_min',
  'year_max',
  'mileage_max',
  'fuel_type',
  'transmission',
  'body_type',
] as const

export type ListingFilterKey = (typeof LISTING_FILTER_KEYS)[number]

export type ListingQuery = Partial<Record<ListingFilterKey | 'sort' | 'page' | 'per_page', string>>

// GET /listings/{id} incrementează `views` pe server. În dev, React StrictMode rulează
// efectele de două ori, deci fără asta fiecare deschidere s-ar număra dublu.
// Două cereri simultane pentru același anunț primesc aceeași promisiune.
const pendingDetails = new Map<string, Promise<ListingDetail>>()

function getListing(id: number | string) {
  const key = String(id)
  let request = pendingDetails.get(key)
  if (!request) {
    request = api<ListingDetail>(`/listings/${key}`).finally(() => pendingDetails.delete(key))
    pendingDetails.set(key, request)
  }
  return request
}

export const listingsApi = {
  search: (query: ListingQuery) => api<Page<ListingCard>>('/listings', { query }),

  get: getListing,

  mine: () => api<ListingCard[]>('/listings/mine'),
}
