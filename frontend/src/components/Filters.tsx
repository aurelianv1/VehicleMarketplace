import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'

import { LISTING_FILTER_KEYS } from '../api/listings'
import type { ListingFilterKey } from '../api/listings'
import { BODY_LABELS, FUEL_LABELS, TRANSMISSION_LABELS, options } from '../lib/format'

export type FilterValues = Record<ListingFilterKey, string>

export const emptyFilters = (): FilterValues =>
  Object.fromEntries(LISTING_FILTER_KEYS.map((k) => [k, ''])) as FilterValues

// Sugestii pentru autocompletare; utilizatorul poate scrie și altă marcă/alt oraș
const BRANDS = [
  'Audi', 'BMW', 'Dacia', 'Ford', 'Honda', 'Hyundai', 'Kia', 'Mazda', 'Mercedes-Benz',
  'Nissan', 'Opel', 'Peugeot', 'Renault', 'Skoda', 'Tesla', 'Toyota', 'Volkswagen', 'Volvo',
]
const CITIES = [
  'București', 'Cluj-Napoca', 'Iași', 'Timișoara', 'Constanța', 'Craiova', 'Brașov',
  'Oradea', 'Sibiu', 'Ploiești', 'Arad', 'Galați',
]

const currentYear = new Date().getFullYear()
const YEARS = Array.from({ length: currentYear - 1989 }, (_, i) => String(currentYear - i))

const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</span>
      {children}
    </label>
  )
}

type Props = {
  initial: FilterValues
  onApply: (values: FilterValues) => void
  onReset: () => void
}

/**
 * Formularul ține valorile local și le trimite doar la „Caută”, ca să nu facem
 * câte o cerere pentru fiecare tastă. Sursa de adevăr rămâne URL-ul: pagina
 * remontează componenta (prin `key`) când URL-ul se schimbă, de ex. la Back.
 */
export default function Filters({ initial, onApply, onReset }: Props) {
  const [values, setValues] = useState(initial)

  const bind = (key: ListingFilterKey) => ({
    value: values[key],
    onChange: (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value })),
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onApply(values)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <Field label="Caută">
        <input type="search" placeholder="ex. Golf, Octavia, xDrive" className={inputClass} {...bind('q')} />
      </Field>

      <Field label="Marcă">
        <input list="brand-options" placeholder="Orice marcă" className={inputClass} {...bind('brand')} />
        <datalist id="brand-options">
          {BRANDS.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
      </Field>

      <Field label="Model">
        <input placeholder="Orice model" className={inputClass} {...bind('model')} />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Preț min (€)">
          <input type="number" min={0} step={500} inputMode="numeric" className={inputClass} {...bind('price_min')} />
        </Field>
        <Field label="Preț max (€)">
          <input type="number" min={0} step={500} inputMode="numeric" className={inputClass} {...bind('price_max')} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="An de la">
          <select className={inputClass} {...bind('year_min')}>
            <option value="">Oricare</option>
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </Field>
        <Field label="An până la">
          <select className={inputClass} {...bind('year_max')}>
            <option value="">Oricare</option>
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Kilometraj maxim">
        <select className={inputClass} {...bind('mileage_max')}>
          <option value="">Oricât</option>
          {[10_000, 50_000, 100_000, 150_000, 200_000, 250_000].map((km) => (
            <option key={km} value={km}>
              {new Intl.NumberFormat('ro-RO').format(km)} km
            </option>
          ))}
        </select>
      </Field>

      <Field label="Combustibil">
        <select className={inputClass} {...bind('fuel_type')}>
          <option value="">Oricare</option>
          {options(FUEL_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Cutie de viteze">
        <select className={inputClass} {...bind('transmission')}>
          <option value="">Oricare</option>
          {options(TRANSMISSION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Caroserie">
        <select className={inputClass} {...bind('body_type')}>
          <option value="">Oricare</option>
          {options(BODY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Oraș">
        <input list="city-options" placeholder="Orice oraș" className={inputClass} {...bind('city')} />
        <datalist id="city-options">
          {CITIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>

      <div className="flex gap-2 pt-2">
        <button type="submit" className="flex-1 rounded-md bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          Caută
        </button>
        <button
          type="button"
          onClick={onReset}
          className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
        >
          Resetează
        </button>
      </div>
    </form>
  )
}
