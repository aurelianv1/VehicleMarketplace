import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { imageUrl } from '../api/client'
import { FUEL_LABELS, formatKm, formatPrice } from '../lib/format'
import type { ListingCard } from '../types'

const INTERVAL_MS = 5000

/** `prefers-reduced-motion`: cine a cerut mai puțină mișcare nu primește derulare automată. */
const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * Slideshow cu anunțuri recomandate: trece singur la următorul la 5 secunde,
 * se oprește cât timp mouse-ul sau focusul e pe el, are săgeți și buline.
 * Stilurile sunt în styles/components.css (.carousel-*).
 */
export default function FeaturedCarousel({ listings, title }: { listings: ListingCard[]; title: string }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const count = listings.length

  const go = useCallback((i: number) => setIndex(((i % count) + count) % count), [count])

  useEffect(() => {
    if (paused || count < 2 || prefersReducedMotion()) return
    const timer = setTimeout(() => go(index + 1), INTERVAL_MS)
    return () => clearTimeout(timer)
  }, [index, paused, count, go])

  if (count === 0) return null

  return (
    <section
      className="carousel mb-6"
      aria-roledescription="carusel"
      aria-label={title}
      data-testid="carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="carousel-track" style={{ transform: `translateX(-${index * 100}%)` }}>
        {listings.map((l, i) => (
          <div
            key={l.id}
            className="carousel-slide"
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} din ${count}`}
            aria-hidden={i !== index}
          >
            <Link to={`/listings/${l.id}`} tabIndex={i === index ? 0 : -1}>
              <img src={imageUrl(l.main_image)} alt={l.title} loading={i === 0 ? 'eager' : 'lazy'} />
              <div className="carousel-caption">
                <p className="mb-1 text-xs font-semibold tracking-wide text-amber-400 uppercase">{title}</p>
                <h2>{l.title}</h2>
                <p className="mt-1 text-sm text-slate-200">
                  {l.year} · {formatKm(l.mileage_km)} · {FUEL_LABELS[l.fuel_type]} · {l.city}
                </p>
                <p className="mt-2 text-xl font-bold">{formatPrice(l.price, l.currency)}</p>
              </div>
            </Link>
          </div>
        ))}
      </div>

      {count > 1 && (
        <>
          <button type="button" className="carousel-arrow" style={{ left: '0.75rem' }} onClick={() => go(index - 1)} aria-label="Slide-ul anterior">
            ‹
          </button>
          <button type="button" className="carousel-arrow" style={{ right: '0.75rem' }} onClick={() => go(index + 1)} aria-label="Slide-ul următor">
            ›
          </button>
          <div className="carousel-dots">
            {listings.map((l, i) => (
              <button
                key={l.id}
                type="button"
                className="carousel-dot"
                aria-label={`Mergi la slide-ul ${i + 1}`}
                aria-current={i === index}
                onClick={() => go(i)}
              />
            ))}
          </div>
          {/* key={index}: bara de progres repornește la fiecare slide nou */}
          {!paused && !prefersReducedMotion() && (
            <div key={index} className="carousel-progress" style={{ animationDuration: `${INTERVAL_MS}ms` }} />
          )}
        </>
      )}
    </section>
  )
}
