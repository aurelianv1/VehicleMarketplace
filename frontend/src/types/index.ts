// Tipurile oglindesc schemele Pydantic din backend (vezi CLAUDE.md).
// Obiectele sunt `interface` (pot fi extinse cu `extends`); valorile fixe sunt uniuni `type`.

export type FuelType = 'petrol' | 'diesel' | 'hybrid' | 'plugin_hybrid' | 'electric' | 'lpg'
export type Transmission = 'manual' | 'automatic' | 'semi_automatic'
export type BodyType =
  | 'sedan'
  | 'hatchback'
  | 'suv'
  | 'break'
  | 'coupe'
  | 'cabrio'
  | 'minivan'
  | 'pickup'
export type CarCondition = 'new' | 'used' | 'damaged'
export type ListingStatus = 'draft' | 'active' | 'sold' | 'inactive'
export type Currency = 'EUR' | 'RON'
export type SortOption = 'recent' | 'price_asc' | 'price_desc' | 'year_desc' | 'mileage_asc'

export interface User {
  id: number
  full_name: string
  created_at: string
  email: string
  phone: string | null
  is_admin: boolean
}

export interface TokenPair {
  access_token: string
  token_type: 'bearer'
  expires_in: number
  user: User
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  per_page: number
  pages: number
}

export interface ListingCard {
  id: number
  title: string
  brand: string
  model: string
  year: number
  price: string // Decimal serializat ca string: "18500.00"
  currency: Currency
  mileage_km: number
  fuel_type: FuelType
  transmission: Transmission
  city: string
  status: ListingStatus
  created_at: string
  main_image: string | null // cale relativă, se trece prin imageUrl()
  is_favorite: boolean
  promoted_until: string | null // setat doar dacă anunțul e promovat acum (plată Stripe)
}

export interface CarImage {
  id: number
  url: string
  url_medium: string | null
  url_thumb: string | null
  position: number
  is_main: boolean
}

/** Moștenire între interfețe: detaliul are tot ce are cardul (fără main_image), plus restul. */
export interface ListingDetail extends Omit<ListingCard, 'main_image'> {
  body_type: BodyType | null
  engine_capacity: number | null
  horsepower: number | null
  color: string | null
  condition: CarCondition
  description: string | null
  views: number
  updated_at: string
  owner: { id: number; full_name: string; created_at: string }
  images: CarImage[]
  seller_phone: string | null // null dacă vizitatorul nu e autentificat
}

/** Corpul pentru POST /listings și PATCH /listings/{id} */
export interface ListingPayload {
  title: string
  brand: string
  model: string
  year: number
  price: string
  currency: Currency
  mileage_km: number
  fuel_type: FuelType
  transmission: Transmission
  body_type: BodyType | null
  engine_capacity: number | null
  horsepower: number | null
  color: string | null
  condition: CarCondition
  description: string | null
  city: string
}

export interface Message {
  id: number
  conversation_id: number
  sender_id: number
  body: string
  created_at: string
  read_at: string | null // null = destinatarul nu l-a citit încă
}

export interface Conversation {
  id: number
  listing: {
    id: number
    title: string
    price: string
    currency: Currency
    status: ListingStatus
    main_image: string | null
  }
  other_user: { id: number; full_name: string }
  role: 'buyer' | 'seller'
  last_message: Message | null
  unread_count: number
  last_message_at: string
}

export interface ConversationDetail extends Conversation {
  messages: Message[]
}

/** Evenimentele primite pe WebSocket (vezi backend/app/routers/conversations.py) */
export type RealtimeEvent =
  | { type: 'message'; message: Message }
  | { type: 'read'; conversation_id: number; reader_id: number; message_ids: number[] }
  // generat local după o reconectare: paginile își reîncarcă datele, ca să prindă ce s-a pierdut
  | { type: 'reconnected' }

export type PaymentStatus = 'pending' | 'paid' | 'expired'

export interface Payment {
  id: number
  listing_id: number
  listing_title: string
  amount_cents: number
  currency: string
  status: PaymentStatus
  created_at: string
  paid_at: string | null
  promoted_until: string | null
}

export interface PaymentsConfig {
  enabled: boolean
  price_cents: number
  currency: string
  days: number
}
