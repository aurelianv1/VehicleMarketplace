import { describe, expect, it } from 'vitest'

import { emptyListingForm, toPayload, validateListing } from './listingForm'
import type { ListingFormValues } from './listingForm'

const valid = (): ListingFormValues => ({
  ...emptyListingForm(),
  title: 'Dacia Logan 2015',
  brand: ' Dacia ',
  model: 'Logan',
  year: '2015',
  price: '4500,50',
  mileage_km: '120000',
  fuel_type: 'diesel',
  transmission: 'manual',
  city: 'Arad',
})

describe('validateListing', () => {
  it('nu găsește erori la un formular complet', () => {
    expect(validateListing(valid())).toEqual({})
  })

  it('cere câmpurile obligatorii, cu mesaje în română', () => {
    const errors = validateListing(emptyListingForm())
    expect(errors.brand).toBe('Marca este obligatoriu')
    expect(errors.price).toBe('Prețul este obligatoriu')
    expect(errors.fuel_type).toBe('Alege combustibilul')
    expect(errors.body_type).toBeUndefined() // opțional
  })

  it('respinge valori în afara intervalelor din backend', () => {
    const errors = validateListing({ ...valid(), year: '1850', mileage_km: '-5', price: '0' })
    expect(errors.year).toMatch(/între 1\.900/)
    expect(errors.mileage_km).toMatch(/număr întreg/)
    expect(errors.price).toMatch(/mai mare decât 0/)
  })

  it('respinge prețuri cu mai mult de două zecimale', () => {
    expect(validateListing({ ...valid(), price: '10.999' }).price).toMatch(/maxim 2 zecimale/)
  })
})

describe('toPayload', () => {
  it('transformă valorile din formular în corpul cererii', () => {
    const payload = toPayload(valid())
    expect(payload.brand).toBe('Dacia') // fără spațiile de la capete
    expect(payload.price).toBe('4500.50') // virgula devine punct; rămâne string, nu float
    expect(payload.year).toBe(2015)
    expect(payload.body_type).toBeNull() // câmp opțional gol → null
    expect(payload.color).toBeNull()
  })
})
