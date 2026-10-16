import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { ApiError } from '../api/client'
import { imagesApi } from '../api/images'
import { listingsApi } from '../api/listings'
import ErrorMessage from '../components/ErrorMessage'
import ImageUploader from '../components/ImageUploader'
import type { PendingImage } from '../components/ImageUploader'
import ListingFields from '../components/ListingFields'
import { emptyListingForm, toPayload, validateListing } from '../lib/listingForm'
import type { ListingFormErrors } from '../lib/listingForm'

const message = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback)

/**
 * Anunțul se salvează în trei pași, în ordinea cerută de backend:
 *   1. POST /listings               → anunț nou cu status „draft”
 *   2. POST /listings/{id}/images   → câte o cerere pentru fiecare poză
 *   3. POST /listings/{id}/publish  → devine „active” (refuzat fără poze)
 * Dacă pasul 2 sau 3 eșuează, anunțul rămâne ciornă: îl trimitem la editare
 * cu un mesaj, ca să nu-l creeze de două ori apăsând din nou pe buton.
 */
export default function NewListing() {
  const navigate = useNavigate()
  const [values, setValues] = useState(emptyListingForm)
  const [errors, setErrors] = useState<ListingFormErrors>({})
  const [images, setImages] = useState<PendingImage[]>([])
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submitting = progress !== null

  async function save(publish: boolean) {
    setError(null)
    const found = validateListing(values)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      setError('Verifică câmpurile marcate cu roșu')
      document.getElementById(Object.keys(found)[0])?.focus()
      return
    }
    if (publish && images.length === 0) {
      setError('Adaugă cel puțin o poză ca să poți publica anunțul (sau salvează-l ca ciornă)')
      return
    }

    // Pasul 1: ciorna
    setProgress('Se salvează anunțul…')
    let listingId: number
    try {
      listingId = (await listingsApi.create(toPayload(values))).id
    } catch (err) {
      setProgress(null)
      setError(message(err, 'Anunțul nu a putut fi salvat'))
      return
    }

    // Pasul 2: pozele, pe rând — progres vizibil și eroare clară pe fișier
    const failed: string[] = []
    for (const [i, img] of images.entries()) {
      setProgress(`Se încarcă poza ${i + 1} din ${images.length}…`)
      try {
        await imagesApi.upload(listingId, [img.file])
      } catch (err) {
        failed.push(message(err, `${img.file.name}: încărcarea a eșuat`))
      }
    }

    if (failed.length > 0) {
      const uploaded = images.length - failed.length
      return navigate(`/listings/${listingId}/edit`, {
        replace: true,
        state: {
          notice: `Anunțul a fost salvat ca ciornă, dar ${failed.length} ${failed.length === 1 ? 'poză nu s-a' : 'poze nu s-au'} încărcat${uploaded ? '' : ' (nicio poză încărcată)'}: ${failed.join('; ')}. Adaugă pozele aici și publică anunțul.`,
        },
      })
    }

    if (!publish) {
      return navigate('/my-listings', { replace: true, state: { notice: 'Anunțul a fost salvat ca ciornă.' } })
    }

    // Pasul 3: publicarea
    setProgress('Se publică anunțul…')
    try {
      await listingsApi.publish(listingId)
    } catch (err) {
      return navigate(`/listings/${listingId}/edit`, {
        replace: true,
        state: { notice: `Anunțul a fost salvat ca ciornă, dar nu a putut fi publicat: ${message(err, 'eroare necunoscută')}` },
      })
    }
    navigate(`/listings/${listingId}`, { replace: true })
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    save(true)
  }

  return (
    <div className="mx-auto max-w-3xl py-6">
      <h1 className="mb-6 text-2xl font-bold">Adaugă anunț</h1>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <ListingFields values={values} errors={errors} onChange={setValues} />
        </div>

        <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-1 text-lg font-semibold">Poze</h2>
          <p className="mb-3 text-sm text-slate-500">Cel puțin o poză pentru publicare. Prima poză apare în lista de anunțuri.</p>
          <ImageUploader images={images} onChange={setImages} disabled={submitting} />
        </div>

        <ErrorMessage message={error} />

        <div className="sticky bottom-0 -mx-4 flex flex-col-reverse gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:flex-row sm:justify-end sm:border-0 sm:bg-transparent sm:p-0">
          {progress && (
            <p role="status" className="self-center text-sm text-slate-600 sm:mr-auto">
              {progress}
            </p>
          )}
          <button
            type="button"
            disabled={submitting}
            onClick={() => save(false)}
            className="rounded-md px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-60"
          >
            Salvează ca ciornă
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            Publică anunțul
          </button>
        </div>
      </form>
    </div>
  )
}
