import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'

import { ApiError } from '../api/client'
import { listingsApi } from '../api/listings'
import ErrorMessage from '../components/ErrorMessage'
import ImageManager from '../components/ImageManager'
import ListingFields from '../components/ListingFields'
import Spinner from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import { STATUS_LABELS } from '../lib/format'
import { formFromListing, toPayload, validateListing } from '../lib/listingForm'
import type { ListingFormErrors, ListingFormValues } from '../lib/listingForm'
import type { CarImage, ListingDetail } from '../types'

export default function EditListing() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // Mesaj venit de la „Adaugă anunț” când pozele sau publicarea au eșuat
  const notice = (location.state as { notice?: string } | null)?.notice ?? null

  const [listing, setListing] = useState<ListingDetail | null>(null)
  const [values, setValues] = useState<ListingFormValues | null>(null)
  const [images, setImages] = useState<CarImage[]>([])
  const [errors, setErrors] = useState<ListingFormErrors>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    listingsApi
      .get(id!)
      .then((data) => {
        if (cancelled) return
        setListing(data)
        setValues(formFromListing(data))
        setImages(data.images)
      })
      .catch((err) => !cancelled && setLoadError(err instanceof ApiError ? err.message : 'Anunțul nu a putut fi încărcat'))
    return () => {
      cancelled = true
    }
  }, [id])

  if (loadError) return <div className="py-10"><ErrorMessage message={loadError} /></div>
  if (!listing || !values) return <Spinner />

  // Backend-ul oricum refuză cu 403; aici doar evităm un formular inutil
  if (user && user.id !== listing.owner.id && !user.is_admin) {
    return <div className="py-10"><ErrorMessage message="Nu îți aparține acest anunț" /></div>
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    const found = validateListing(values!)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      setError('Verifică câmpurile marcate cu roșu')
      document.getElementById(Object.keys(found)[0])?.focus()
      return
    }
    setSaving(true)
    try {
      setListing(await listingsApi.update(listing!.id, toPayload(values!)))
      setSaved(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Modificările nu au putut fi salvate')
    } finally {
      setSaving(false)
    }
  }

  async function publish() {
    setError(null)
    setSaving(true)
    try {
      // Întâi salvăm eventualele modificări din formular, apoi publicăm
      const found = validateListing(values!)
      setErrors(found)
      if (Object.keys(found).length > 0) {
        setError('Verifică câmpurile marcate cu roșu')
        return
      }
      await listingsApi.update(listing!.id, toPayload(values!))
      await listingsApi.publish(listing!.id)
      navigate(`/listings/${listing!.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Anunțul nu a putut fi publicat')
    } finally {
      setSaving(false)
    }
  }

  const isDraft = listing.status === 'draft'

  return (
    <div className="mx-auto max-w-3xl py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Editează anunțul</h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="rounded bg-slate-200 px-2 py-0.5 font-medium">{STATUS_LABELS[listing.status]}</span>
          <Link to={`/listings/${listing.id}`} className="font-medium text-blue-600 hover:underline">
            Vezi anunțul
          </Link>
        </div>
      </div>

      {notice && (
        <div role="alert" className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {notice}
        </div>
      )}

      <div className="mb-6 rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-1 text-lg font-semibold">Poze</h2>
        <p className="mb-3 text-sm text-slate-500">Modificările pozelor se salvează imediat.</p>
        <ImageManager listingId={listing.id} images={images} onChange={setImages} />
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <ListingFields values={values} errors={errors} onChange={(v) => { setValues(v); setSaved(false) }} />
        </div>

        <ErrorMessage message={error} />
        {saved && (
          <div role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
            Modificările au fost salvate.
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="submit"
            disabled={saving}
            className={`rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-60 ${
              isDraft ? 'text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50' : 'bg-blue-600 px-6 text-white hover:bg-blue-700'
            }`}
          >
            Salvează modificările
          </button>
          {isDraft && (
            <button
              type="button"
              disabled={saving || images.length === 0}
              onClick={publish}
              title={images.length === 0 ? 'Adaugă cel puțin o poză' : undefined}
              className="rounded-md bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              Salvează și publică
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
