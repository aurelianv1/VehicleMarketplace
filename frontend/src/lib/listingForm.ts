// Valorile formularului de anunț și validarea lor.
// Regulile oglindesc ListingBase din backend (schemas/listing.py), ca utilizatorul
// să primească mesaje clare în română înainte ca serverul să răspundă cu 422.

import type { BodyType, CarCondition, Currency, FuelType, ListingDetail, ListingPayload, Transmission } from '../types'

/** În formular totul e string (așa lucrează <input>); conversia se face în toPayload(). */
export type ListingFormValues = {
  title: string
  brand: string
  model: string
  year: string
  price: string
  currency: Currency
  mileage_km: string
  fuel_type: FuelType | ''
  transmission: Transmission | ''
  body_type: BodyType | ''
  engine_capacity: string
  horsepower: string
  color: string
  condition: CarCondition
  description: string
  city: string
}

export type ListingFormErrors = Partial<Record<keyof ListingFormValues, string>>

export const MAX_YEAR = new Date().getFullYear() + 1

export const emptyListingForm = (): ListingFormValues => ({
  title: '',
  brand: '',
  model: '',
  year: '',
  price: '',
  currency: 'EUR',
  mileage_km: '',
  fuel_type: '',
  transmission: '',
  body_type: '',
  engine_capacity: '',
  horsepower: '',
  color: '',
  condition: 'used',
  description: '',
  city: '',
})

export const formFromListing = (l: ListingDetail): ListingFormValues => ({
  title: l.title,
  brand: l.brand,
  model: l.model,
  year: String(l.year),
  price: String(Number(l.price)), // "18500.00" → "18500"
  currency: l.currency,
  mileage_km: String(l.mileage_km),
  fuel_type: l.fuel_type,
  transmission: l.transmission,
  body_type: l.body_type ?? '',
  engine_capacity: l.engine_capacity?.toString() ?? '',
  horsepower: l.horsepower?.toString() ?? '',
  color: l.color ?? '',
  condition: l.condition,
  description: l.description ?? '',
  city: l.city,
})

const isInt = (v: string) => /^\d+$/.test(v.trim())

function intInRange(v: string, min: number, max: number, label: string, required: boolean): string | undefined {
  if (!v.trim()) return required ? `${label} este obligatoriu` : undefined
  if (!isInt(v)) return `${label} trebuie să fie un număr întreg`
  const n = Number(v)
  if (n < min || n > max) return `${label} trebuie să fie între ${min.toLocaleString('ro-RO')} și ${max.toLocaleString('ro-RO')}`
}

function length(v: string, min: number, max: number, label: string): string | undefined {
  const len = v.trim().length
  if (len < min) return min === 1 ? `${label} este obligatoriu` : `${label} trebuie să aibă minim ${min} caractere`
  if (len > max) return `${label} poate avea maxim ${max} caractere`
}

export function validateListing(v: ListingFormValues): ListingFormErrors {
  const errors: ListingFormErrors = {
    title: length(v.title, 5, 160, 'Titlul'),
    brand: length(v.brand, 1, 60, 'Marca'),
    model: length(v.model, 1, 60, 'Modelul'),
    city: length(v.city, 2, 80, 'Orașul'),
    year: intInRange(v.year, 1900, MAX_YEAR, 'Anul', true),
    mileage_km: intInRange(v.mileage_km, 0, 2_000_000, 'Kilometrajul', true),
    engine_capacity: intInRange(v.engine_capacity, 0, 10_000, 'Capacitatea', false),
    horsepower: intInRange(v.horsepower, 0, 2_000, 'Puterea', false),
    fuel_type: v.fuel_type ? undefined : 'Alege combustibilul',
    transmission: v.transmission ? undefined : 'Alege cutia de viteze',
    color: v.color.trim().length > 40 ? 'Culoarea poate avea maxim 40 de caractere' : undefined,
    description: v.description.length > 5000 ? 'Descrierea poate avea maxim 5.000 de caractere' : undefined,
  }

  const price = v.price.trim().replace(',', '.')
  if (!price) errors.price = 'Prețul este obligatoriu'
  else if (!/^\d+(\.\d{1,2})?$/.test(price)) errors.price = 'Prețul trebuie să fie un număr (maxim 2 zecimale)'
  else if (Number(price) <= 0) errors.price = 'Prețul trebuie să fie mai mare decât 0'
  else if (Number(price) > 99_999_999.99) errors.price = 'Prețul este prea mare'

  // Scoatem cheile fără eroare, ca Object.keys(errors).length să însemne „câte erori”
  return Object.fromEntries(Object.entries(errors).filter(([, msg]) => msg)) as ListingFormErrors
}

const optionalInt = (v: string) => (v.trim() ? Number(v) : null)
const optionalText = (v: string) => v.trim() || null

/** Se apelează doar după validateListing() fără erori. */
export function toPayload(v: ListingFormValues): ListingPayload {
  return {
    title: v.title.trim(),
    brand: v.brand.trim(),
    model: v.model.trim(),
    year: Number(v.year),
    // Prețul pleacă ca string, ca să nu treacă prin float (backend-ul îl citește ca Decimal)
    price: v.price.trim().replace(',', '.'),
    currency: v.currency,
    mileage_km: Number(v.mileage_km),
    fuel_type: v.fuel_type as FuelType,
    transmission: v.transmission as Transmission,
    body_type: v.body_type || null,
    engine_capacity: optionalInt(v.engine_capacity),
    horsepower: optionalInt(v.horsepower),
    color: optionalText(v.color),
    condition: v.condition,
    description: optionalText(v.description),
    city: v.city.trim(),
  }
}
