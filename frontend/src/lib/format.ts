// Singurul loc cu etichete în română pentru valorile enum din API și cu formatări de afișare.
// Backend-ul trimite mereu valorile tehnice („petrol”), traducerea se face doar aici.

import type {
  BodyType,
  CarCondition,
  Currency,
  FuelType,
  ListingStatus,
  SortOption,
  Transmission,
} from '../types'

export const FUEL_LABELS: Record<FuelType, string> = {
  petrol: 'Benzină',
  diesel: 'Diesel',
  hybrid: 'Hibrid',
  plugin_hybrid: 'Hibrid plug-in',
  electric: 'Electric',
  lpg: 'GPL',
}

export const TRANSMISSION_LABELS: Record<Transmission, string> = {
  manual: 'Manuală',
  automatic: 'Automată',
  semi_automatic: 'Semi-automată',
}

export const BODY_LABELS: Record<BodyType, string> = {
  sedan: 'Sedan',
  hatchback: 'Hatchback',
  suv: 'SUV',
  break: 'Break',
  coupe: 'Coupé',
  cabrio: 'Cabrio',
  minivan: 'Monovolum',
  pickup: 'Pickup',
}

export const CONDITION_LABELS: Record<CarCondition, string> = {
  new: 'Nou',
  used: 'Second-hand',
  damaged: 'Avariat',
}

export const STATUS_LABELS: Record<ListingStatus, string> = {
  draft: 'Ciornă',
  active: 'Activ',
  sold: 'Vândut',
  inactive: 'Inactiv',
}

export const SORT_LABELS: Record<SortOption, string> = {
  recent: 'Cele mai noi',
  price_asc: 'Preț crescător',
  price_desc: 'Preț descrescător',
  year_desc: 'An fabricație (noi întâi)',
  mileage_asc: 'Kilometraj (mic întâi)',
}

/** Perechi [valoare, etichetă] pentru <select>, în ordinea din obiect. */
export const options = <T extends string>(labels: Record<T, string>) =>
  Object.entries(labels) as [T, string][]

const numberFormat = new Intl.NumberFormat('ro-RO')

/** `price` vine din API ca string („18500.00”), pentru că e Decimal în backend. */
export const formatPrice = (price: string | number, currency: Currency) =>
  `${numberFormat.format(Number(price))} ${currency === 'EUR' ? '€' : 'lei'}`

export const formatKm = (km: number) => `${numberFormat.format(km)} km`

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' })

/** Etichete corecte gramatical: 1 anunț, 2 anunțuri, 20 de anunțuri. */
export function pluralListings(n: number) {
  if (n === 1) return '1 anunț'
  const rest = n % 100
  return n > 0 && (rest === 0 || rest >= 20) ? `${n} de anunțuri` : `${n} anunțuri`
}
