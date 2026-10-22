import { describe, expect, it } from 'vitest'

import { FUEL_LABELS, formatKm, formatPrice, options, pluralListings } from './format'

describe('formatPrice', () => {
  it('formatează prețul venit ca string din API, în stil românesc', () => {
    expect(formatPrice('18500.00', 'EUR')).toBe('18.500 €')
  })

  it('păstrează zecimalele și afișează „lei” pentru RON', () => {
    expect(formatPrice('15750.50', 'RON')).toBe('15.750,5 lei')
  })
})

describe('formatKm', () => {
  it('folosește punctul ca separator de mii', () => {
    expect(formatKm(148216)).toBe('148.216 km')
  })
})

describe('pluralListings', () => {
  it.each([
    [0, '0 anunțuri'],
    [1, '1 anunț'],
    [2, '2 anunțuri'],
    [19, '19 anunțuri'],
    [20, '20 de anunțuri'],
    [101, '101 anunțuri'],
    [120, '120 de anunțuri'],
  ])('%i → „%s”', (n, expected) => {
    expect(pluralListings(n)).toBe(expected)
  })
})

describe('etichete', () => {
  it('traduce valorile tehnice din API în română', () => {
    expect(FUEL_LABELS.petrol).toBe('Benzină')
    expect(FUEL_LABELS.lpg).toBe('GPL')
  })

  it('options() păstrează ordinea pentru <select>', () => {
    expect(options(FUEL_LABELS)[0]).toEqual(['petrol', 'Benzină'])
  })
})
