// Tipurile oglindesc schemele Pydantic din backend (vezi CLAUDE.md)

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

export type User = {
  id: number
  full_name: string
  created_at: string
  email: string
  phone: string | null
  is_admin: boolean
}

export type TokenPair = {
  access_token: string
  token_type: 'bearer'
  expires_in: number
  user: User
}

export type Page<T> = {
  items: T[]
  total: number
  page: number
  per_page: number
  pages: number
}

export type ListingCard = {
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
}

export type CarImage = {
  id: number
  url: string
  url_medium: string | null
  url_thumb: string | null
  position: number
  is_main: boolean
}

export type ListingDetail = Omit<ListingCard, 'main_image'> & {
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
export type ListingPayload = {
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

export type Message = {
  id: number
  conversation_id: number
  sender_id: number
  body: string
  created_at: string
  read_at: string | null // null = destinatarul nu l-a citit încă
}

export type Conversation = {
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

export type ConversationDetail = Conversation & { messages: Message[] }

/** Evenimentele primite pe WebSocket (vezi backend/app/routers/conversations.py) */
export type RealtimeEvent =
  | { type: 'message'; message: Message }
  | { type: 'read'; conversation_id: number; reader_id: number; message_ids: number[] }
  // generat local după o reconectare: paginile își reîncarcă datele, ca să prindă ce s-a pierdut
  | { type: 'reconnected' }
