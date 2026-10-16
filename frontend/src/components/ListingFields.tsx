import type { ReactNode } from 'react'

import { BODY_LABELS, CONDITION_LABELS, FUEL_LABELS, TRANSMISSION_LABELS, options } from '../lib/format'
import { MAX_YEAR } from '../lib/listingForm'
import type { ListingFormErrors, ListingFormValues } from '../lib/listingForm'

type Props = {
  values: ListingFormValues
  errors: ListingFormErrors
  onChange: (values: ListingFormValues) => void
}

const control = (hasError: boolean) =>
  `w-full rounded-md border bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none ${
    hasError ? 'border-red-400 focus:ring-red-200' : 'border-slate-300 focus:border-blue-500 focus:ring-blue-200'
  }`

function Field({ name, label, error, children, className = '' }: {
  name: string
  label: string
  error?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label htmlFor={name} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${name}-error`} className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}

/** Câmpurile anunțului, comune paginilor „Adaugă” și „Editează”. */
export default function ListingFields({ values, errors, onChange }: Props) {
  // Leagă un câmp de valoarea lui; păstrează id/name/aria pentru accesibilitate și teste
  const bind = <K extends keyof ListingFormValues>(key: K) => ({
    id: key,
    name: key,
    value: values[key],
    'aria-invalid': Boolean(errors[key]),
    'aria-describedby': errors[key] ? `${key}-error` : undefined,
    className: control(Boolean(errors[key])),
    onChange: (e: { target: { value: string } }) => onChange({ ...values, [key]: e.target.value }),
  })

  return (
    <div className="space-y-6">
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-lg font-semibold">Mașina</legend>
        <Field name="brand" label="Marcă *" error={errors.brand}>
          <input list="brand-suggestions" placeholder="ex. Volkswagen" {...bind('brand')} />
          <datalist id="brand-suggestions">
            {['Audi', 'BMW', 'Dacia', 'Ford', 'Hyundai', 'Mercedes-Benz', 'Opel', 'Renault', 'Skoda', 'Toyota', 'Volkswagen'].map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </Field>
        <Field name="model" label="Model *" error={errors.model}>
          <input placeholder="ex. Golf" {...bind('model')} />
        </Field>
        <Field name="year" label="An fabricație *" error={errors.year}>
          <input type="number" inputMode="numeric" min={1900} max={MAX_YEAR} placeholder="ex. 2018" {...bind('year')} />
        </Field>
        <Field name="mileage_km" label="Kilometraj (km) *" error={errors.mileage_km}>
          <input type="number" inputMode="numeric" min={0} placeholder="ex. 145000" {...bind('mileage_km')} />
        </Field>
        <Field name="fuel_type" label="Combustibil *" error={errors.fuel_type}>
          <select {...bind('fuel_type')}>
            <option value="">Alege…</option>
            {options(FUEL_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field name="transmission" label="Cutie de viteze *" error={errors.transmission}>
          <select {...bind('transmission')}>
            <option value="">Alege…</option>
            {options(TRANSMISSION_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field name="body_type" label="Caroserie" error={errors.body_type}>
          <select {...bind('body_type')}>
            <option value="">Nespecificat</option>
            {options(BODY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field name="condition" label="Stare" error={errors.condition}>
          <select {...bind('condition')}>
            {options(CONDITION_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field name="engine_capacity" label="Capacitate motor (cm³)" error={errors.engine_capacity}>
          <input type="number" inputMode="numeric" min={0} placeholder="ex. 1968" {...bind('engine_capacity')} />
        </Field>
        <Field name="horsepower" label="Putere (CP)" error={errors.horsepower}>
          <input type="number" inputMode="numeric" min={0} placeholder="ex. 150" {...bind('horsepower')} />
        </Field>
        <Field name="color" label="Culoare" error={errors.color}>
          <input placeholder="ex. Gri" {...bind('color')} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-lg font-semibold">Anunțul</legend>
        <Field name="title" label="Titlu *" error={errors.title} className="sm:col-span-2">
          <input placeholder="ex. Volkswagen Golf 7 2018, 1.6 TDI, întreținut" maxLength={160} {...bind('title')} />
        </Field>
        <div className="grid grid-cols-[1fr_6rem] gap-2">
          <Field name="price" label="Preț *" error={errors.price}>
            <input inputMode="decimal" placeholder="ex. 12500" {...bind('price')} />
          </Field>
          <Field name="currency" label="Monedă">
            <select {...bind('currency')}>
              <option value="EUR">EUR</option>
              <option value="RON">RON</option>
            </select>
          </Field>
        </div>
        <Field name="city" label="Oraș *" error={errors.city}>
          <input placeholder="ex. Cluj-Napoca" {...bind('city')} />
        </Field>
        <Field name="description" label="Descriere" error={errors.description} className="sm:col-span-2">
          <textarea rows={6} maxLength={5000} placeholder="Istoric service, dotări, defecte cunoscute…" {...bind('description')} />
          <p className="mt-1 text-right text-xs text-slate-400">{values.description.length} / 5000</p>
        </Field>
      </fieldset>
    </div>
  )
}
