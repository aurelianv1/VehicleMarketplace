import { useCallback, useEffect, useState } from 'react'

import { imageUrl } from '../api/client'
import type { CarImage } from '../types'

type Props = {
  images: CarImage[]
  title: string
}

/**
 * Poza mare folosește varianta medium (800×600), miniaturile varianta thumb (400×300),
 * iar varianta full (max 1600×1200) se încarcă doar la deschiderea pe tot ecranul.
 */
export default function ImageGallery({ images, title }: Props) {
  const sorted = [...images].sort((a, b) => a.position - b.position)
  const mainIndex = Math.max(0, sorted.findIndex((img) => img.is_main))

  const [index, setIndex] = useState(mainIndex)
  const [fullscreen, setFullscreen] = useState(false)

  const count = sorted.length
  const prev = useCallback(() => setIndex((i) => (i - 1 + count) % count), [count])
  const next = useCallback(() => setIndex((i) => (i + 1) % count), [count])

  // Săgețile stânga/dreapta schimbă poza, Escape închide ecranul complet
  useEffect(() => {
    if (count < 2 && !fullscreen) return
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'ArrowRight') next()
      else if (e.key === 'Escape') setFullscreen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [count, fullscreen, prev, next])

  if (count === 0) {
    return (
      <div className="aspect-[4/3] overflow-hidden rounded-lg bg-slate-100">
        <img src={imageUrl(null)} alt="Anunț fără poze" className="h-full w-full object-cover" />
      </div>
    )
  }

  const current = sorted[Math.min(index, count - 1)]

  const arrow = (direction: 'prev' | 'next', extra = '') => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        if (direction === 'prev') prev()
        else next()
      }}
      aria-label={direction === 'prev' ? 'Poza anterioară' : 'Poza următoare'}
      className={`absolute top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-2xl leading-none text-white hover:bg-black/70 ${
        direction === 'prev' ? 'left-3' : 'right-3'
      } ${extra}`}
    >
      {direction === 'prev' ? '‹' : '›'}
    </button>
  )

  return (
    <div>
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-slate-900">
        <button
          type="button"
          onClick={() => setFullscreen(true)}
          className="h-full w-full cursor-zoom-in"
          aria-label="Deschide poza pe tot ecranul"
        >
          <img
            src={imageUrl(current.url_medium ?? current.url)}
            alt={`${title} – poza ${index + 1}`}
            className="h-full w-full object-contain"
          />
        </button>
        {count > 1 && (
          <>
            {arrow('prev')}
            {arrow('next')}
            <span className="absolute right-3 bottom-3 rounded bg-black/60 px-2 py-1 text-xs text-white">
              {index + 1} / {count}
            </span>
          </>
        )}
      </div>

      {count > 1 && (
        <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-6">
          {sorted.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Poza ${i + 1}`}
              aria-current={i === index}
              className={`aspect-[4/3] overflow-hidden rounded-md ring-2 transition ${
                i === index ? 'ring-blue-600' : 'opacity-70 ring-transparent hover:opacity-100'
              }`}
            >
              <img src={imageUrl(img.url_thumb ?? img.url)} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {fullscreen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Galerie pe tot ecranul"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setFullscreen(false)}
        >
          <img
            src={imageUrl(current.url)}
            alt={`${title} – poza ${index + 1}`}
            className="max-h-full max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setFullscreen(false)}
            aria-label="Închide"
            className="absolute top-4 right-4 rounded-full bg-white/10 px-3 py-1 text-2xl text-white hover:bg-white/20"
          >
            ×
          </button>
          {count > 1 && (
            <>
              {arrow('prev')}
              {arrow('next')}
              <span className="absolute bottom-4 text-sm text-white/80">
                {index + 1} / {count}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  )
}
