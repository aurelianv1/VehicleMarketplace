import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { ApiError } from '../api/client'
import { favoritesApi } from '../api/favorites'
import ErrorMessage from '../components/ErrorMessage'
import ListingCard from '../components/ListingCard'
import Spinner from '../components/Spinner'
import { STATUS_LABELS, pluralListings } from '../lib/format'
import type { ListingCard as Listing } from '../types'

export default function Favorites() {
  const [listings, setListings] = useState<Listing[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    favoritesApi
      .list()
      .then(setListings)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Nu am putut încărca favoritele'))
  }, [])

  if (error) return <div className="py-10"><ErrorMessage message={error} /></div>
  if (!listings) return <Spinner />

  return (
    <div className="py-6">
      <h1 className="text-2xl font-bold">Favorite</h1>
      <p className="mb-4 text-sm text-slate-500">{pluralListings(listings.length)} salvate</p>

      {listings.length === 0 ? (
        <div className="rounded-lg bg-white p-10 text-center ring-1 ring-slate-200">
          <p className="font-medium">Nu ai salvat niciun anunț.</p>
          <p className="mt-1 text-sm text-slate-500">Apasă pe inimă la un anunț ca să-l găsești aici.</p>
          <Link to="/" className="mt-3 inline-block text-sm font-medium text-blue-600 hover:underline">
            Vezi anunțurile
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {listings.map((l) => (
            <ListingCard
              key={l.id}
              listing={l}
              // Scos de la favorite → dispare din listă
              onFavoriteChange={(fav) => !fav && setListings((ls) => ls!.filter((x) => x.id !== l.id))}
              // Un anunț salvat poate fi între timp vândut sau dezactivat de vânzător
              badge={
                l.status !== 'active' ? (
                  <span className="rounded bg-slate-700 px-2 py-0.5 text-xs font-semibold text-white">{STATUS_LABELS[l.status]}</span>
                ) : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
