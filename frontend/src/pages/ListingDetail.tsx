import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'

import { ApiError } from '../api/client'
import { listingsApi } from '../api/listings'
import ContactSeller from '../components/ContactSeller'
import DeleteListingButton from '../components/DeleteListingButton'
import ErrorMessage from '../components/ErrorMessage'
import FavoriteButton from '../components/FavoriteButton'
import PromoteButton from '../components/PromoteButton'
import ImageGallery from '../components/ImageGallery'
import Spinner from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import { usePageTitle } from '../lib/usePageTitle'
import {
  BODY_LABELS,
  CONDITION_LABELS,
  FUEL_LABELS,
  STATUS_LABELS,
  TRANSMISSION_LABELS,
  formatDate,
  formatKm,
  formatPrice,
} from '../lib/format'
import type { ListingDetail as Listing } from '../types'

const numberFormat = new Intl.NumberFormat('ro-RO')

export default function ListingDetail() {
  const { id } = useParams()
  const { user, initializing } = useAuth()
  const location = useLocation()

  const [listing, setListing] = useState<Listing | null>(null)
  // Eroarea și telefonul afișat țin minte anunțul de care aparțin, ca la navigarea
  // pe alt anunț să nu rămână starea de la cel vechi
  const [error, setError] = useState<{ id: string; status: number; message: string } | null>(null)
  const [phoneShownFor, setPhoneShownFor] = useState<number | null>(null)
  const current = listing && String(listing.id) === id ? listing : null
  usePageTitle(
    current ? current.title : 'Anunț',
    // Descriere pentru Google, din datele anunțului: „BMW X3 din 2020, 72.000 km, Diesel, Brașov – 35.900 €.”
    current
      ? `${current.brand} ${current.model} din ${current.year}, ${formatKm(current.mileage_km)}, ${FUEL_LABELS[current.fuel_type]}, ${current.city} – ${formatPrice(current.price, current.currency)}. Vezi pozele și contactează vânzătorul.`
      : undefined,
  )

  useEffect(() => {
    // Ca pe pagina principală: așteptăm sesiunea, pentru că de ea depind
    // telefonul vânzătorului, inima de favorite și accesul la propriile ciorne
    if (initializing) return

    let cancelled = false

    listingsApi
      .get(id!)
      .then((data) => {
        if (cancelled) return
        setListing(data)
        setError(null)
      })
      .catch((err) => {
        if (cancelled) return
        setListing(null)
        setError(
          err instanceof ApiError
            ? { id: id!, status: err.status, message: err.message }
            : { id: id!, status: 0, message: 'Nu am putut încărca anunțul' },
        )
      })

    return () => {
      cancelled = true
    }
  }, [id, initializing, user?.id])

  const currentError = error?.id === id ? error : null

  if (currentError?.status === 404) {
    return (
      <div className="py-16 text-center">
        <h1 className="text-2xl font-bold">Anunțul nu există</h1>
        <p className="mt-2 text-slate-600">Poate a fost șters sau nu a fost încă publicat.</p>
        <Link to="/" className="mt-6 inline-block font-medium text-blue-600 hover:underline">
          Înapoi la anunțuri
        </Link>
      </div>
    )
  }

  if (currentError) return <div className="py-10"><ErrorMessage message={currentError.message} /></div>
  // Și când se schimbă anunțul (alt id), cât timp îl încărcăm pe cel nou
  if (!listing || String(listing.id) !== id) return <Spinner />

  const isOwner = user?.id === listing.owner.id
  const canEdit = isOwner || user?.is_admin

  const specs: [string, string | null][] = [
    ['An fabricație', String(listing.year)],
    ['Kilometraj', formatKm(listing.mileage_km)],
    ['Combustibil', FUEL_LABELS[listing.fuel_type]],
    ['Cutie de viteze', TRANSMISSION_LABELS[listing.transmission]],
    ['Caroserie', listing.body_type ? BODY_LABELS[listing.body_type] : null],
    ['Capacitate motor', listing.engine_capacity ? `${numberFormat.format(listing.engine_capacity)} cm³` : null],
    ['Putere', listing.horsepower ? `${listing.horsepower} CP` : null],
    ['Culoare', listing.color],
    ['Stare', CONDITION_LABELS[listing.condition]],
    ['Oraș', listing.city],
  ]

  return (
    <div className="py-6">
      <Link to="/" className="text-sm text-blue-600 hover:underline">
        ‹ Înapoi la anunțuri
      </Link>

      {isOwner && new URLSearchParams(location.search).get('promotion') === 'cancelled' && (
        <div role="status" className="mt-4 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          Ai renunțat la plată. Nu ți s-a retras nicio sumă; poți promova anunțul oricând.
        </div>
      )}

      {listing.status !== 'active' && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Anunțul este <strong>{STATUS_LABELS[listing.status].toLowerCase()}</strong>
          {listing.status === 'draft' && ' și nu apare în lista publică. Adaugă cel puțin o poză și publică-l.'}
        </div>
      )}

      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
        {/* Pe mobil ordinea e: galerie → preț/vânzător → detalii; pe desktop prețul stă în dreapta */}
        <div className="min-w-0 lg:col-start-1">
          <ImageGallery key={listing.id} images={listing.images} title={listing.title} />
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-xl font-bold">{listing.title}</h1>
              {listing.status === 'active' && !isOwner && (
                <FavoriteButton listingId={listing.id} initial={listing.is_favorite} className="shrink-0 ring-1 ring-slate-200" />
              )}
            </div>
            <p className="mt-3 text-3xl font-bold text-blue-700">{formatPrice(listing.price, listing.currency)}</p>
            <p className="mt-2 text-sm text-slate-500">
              {listing.year} · {formatKm(listing.mileage_km)} · {listing.city}
            </p>

            {canEdit && (
              <Link
                to={`/listings/${listing.id}/edit`}
                className="mt-4 block rounded-md bg-slate-800 py-2 text-center text-sm font-semibold text-white hover:bg-slate-900"
              >
                Editează anunțul
              </Link>
            )}
            {/* Backend-ul permite ștergerea proprietarului și adminului (_require_owner); butonul doar o expune */}
            {isOwner && listing.status === 'active' && (
              <PromoteButton listingId={listing.id} promotedUntil={listing.promoted_until} />
            )}
            {canEdit && <DeleteListingButton key={listing.id} listingId={listing.id} isOwner={isOwner} />}
          </div>

          <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-sm font-medium text-slate-500">Vânzător</h2>
            <p className="mt-1 font-semibold">{listing.owner.full_name}</p>
            <p className="text-sm text-slate-500">Membru din {formatDate(listing.owner.created_at)}</p>

            {/* Telefonul vine de la server doar pentru utilizatorii autentificați (anti-roboți) */}
            {!isOwner && (
              <div className="mt-4">
                {!user ? (
                  <Link
                    to="/login"
                    state={{ from: location }}
                    className="block rounded-md bg-blue-600 py-2 text-center text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Autentifică-te ca să vezi telefonul sau să trimiți un mesaj
                  </Link>
                ) : !listing.seller_phone ? (
                  <p className="text-sm text-slate-500">Vânzătorul nu a adăugat un număr de telefon.</p>
                ) : phoneShownFor === listing.id ? (
                  <a
                    href={`tel:${listing.seller_phone.replace(/\s/g, '')}`}
                    className="block rounded-md bg-green-600 py-2 text-center text-lg font-semibold text-white hover:bg-green-700"
                  >
                    {listing.seller_phone}
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPhoneShownFor(listing.id)}
                    className="w-full rounded-md bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Arată telefonul
                  </button>
                )}
              </div>
            )}
            {user && !isOwner && listing.status === 'active' && (
              <div className="mt-3">
                <ContactSeller listingId={listing.id} />
              </div>
            )}
          </div>

          <p className="px-1 text-xs text-slate-500">
            Publicat pe {formatDate(listing.created_at)} · {numberFormat.format(listing.views)} vizualizări · ID {listing.id}
          </p>
        </aside>

        <div className="min-w-0 lg:col-start-1">
          <section className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-3 text-lg font-semibold">Detalii</h2>
            {/* Tabel: date de tip „caracteristică – valoare”, citite corect și de cititoarele de ecran */}
            <table className="specs-table w-full text-sm">
              <caption className="sr-only">Specificațiile mașinii</caption>
              <tbody>
                {specs
                  .filter(([, value]) => value)
                  .map(([label, value]) => (
                    <tr key={label} className="border-b border-slate-100 last:border-0">
                      <th scope="row" className="py-2 pr-4 text-left font-normal text-slate-500">
                        {label}
                      </th>
                      <td className="py-2 text-right font-medium">{value}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>

          {listing.description && (
            <section className="mt-6 rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <h2 className="mb-3 text-lg font-semibold">Descriere</h2>
              {/* whitespace-pre-line păstrează rândurile noi scrise de vânzător; textul e escapat de React */}
              <p className="text-sm leading-relaxed whitespace-pre-line text-slate-700">{listing.description}</p>
            </section>
          )}
        </div>

      </div>
    </div>
  )
}
