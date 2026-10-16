import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { ApiError } from '../api/client'
import { listingsApi } from '../api/listings'
import ErrorMessage from '../components/ErrorMessage'
import ListingCard from '../components/ListingCard'
import Spinner from '../components/Spinner'
import { STATUS_LABELS, pluralListings } from '../lib/format'
import { useFlashNotice } from '../lib/useFlashNotice'
import { usePageTitle } from '../lib/usePageTitle'
import type { ListingCard as Listing, ListingStatus } from '../types'

const BADGE: Record<ListingStatus, string> = {
  draft: 'bg-amber-100 text-amber-800',
  active: 'bg-green-100 text-green-800',
  sold: 'bg-slate-700 text-white',
  inactive: 'bg-slate-200 text-slate-700',
}

const actionClass = 'rounded px-2 py-1 text-xs font-medium ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-50'

export default function MyListings() {
  usePageTitle('Anunțurile mele')
  const notice = useFlashNotice()

  const [listings, setListings] = useState<Listing[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)

  useEffect(() => {
    listingsApi
      .mine()
      .then(setListings)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Nu am putut încărca anunțurile'))
  }, [])

  async function act(id: number, action: () => Promise<unknown>) {
    setBusyId(id)
    setError(null)
    try {
      await action()
      setListings(await listingsApi.mine())
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Operația a eșuat')
    } finally {
      setBusyId(null)
      setConfirmDelete(null)
    }
  }

  const setStatus = (id: number, status: ListingStatus) => act(id, () => listingsApi.update(id, { status }))

  if (!listings && !error) return <Spinner />

  return (
    <div className="py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Anunțurile mele</h1>
          {listings && <p className="text-sm text-slate-500">{pluralListings(listings.length)}</p>}
        </div>
        <Link to="/listings/new" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          + Adaugă anunț
        </Link>
      </div>

      {notice && (
        <div role="status" className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          {notice}
        </div>
      )}
      <ErrorMessage message={error} />

      {listings?.length === 0 && (
        <div className="rounded-lg bg-white p-10 text-center ring-1 ring-slate-200">
          <p className="font-medium">Nu ai niciun anunț încă.</p>
          <Link to="/listings/new" className="mt-3 inline-block text-sm font-medium text-blue-600 hover:underline">
            Adaugă primul anunț
          </Link>
        </div>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {listings?.map((l) => {
          const busy = busyId === l.id
          return (
            <ListingCard
              key={l.id}
              listing={l}
              showFavorite={false}
              badge={<span className={`rounded px-2 py-0.5 text-xs font-semibold ${BADGE[l.status]}`}>{STATUS_LABELS[l.status]}</span>}
              footer={
                confirmDelete === l.id ? (
                  <div className="flex items-center gap-2">
                    <span className="mr-auto text-xs text-red-700">Ștergi definitiv anunțul și pozele?</span>
                    <button type="button" disabled={busy} onClick={() => act(l.id, () => listingsApi.remove(l.id))} className="rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50">
                      Da, șterge
                    </button>
                    <button type="button" onClick={() => setConfirmDelete(null)} className={actionClass}>
                      Nu
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Link to={`/listings/${l.id}/edit`} className={actionClass}>
                      Editează
                    </Link>
                    {l.status === 'draft' && (
                      // Publicarea cere poze; fără ele, backend-ul răspunde cu 400 și mesajul apare sus
                      <button type="button" disabled={busy} onClick={() => act(l.id, () => listingsApi.publish(l.id))} className={`${actionClass} text-blue-700`}>
                        Publică
                      </button>
                    )}
                    {l.status === 'active' && (
                      <>
                        <button type="button" disabled={busy} onClick={() => setStatus(l.id, 'sold')} className={actionClass}>
                          Marchează vândut
                        </button>
                        <button type="button" disabled={busy} onClick={() => setStatus(l.id, 'inactive')} className={actionClass}>
                          Dezactivează
                        </button>
                      </>
                    )}
                    {(l.status === 'sold' || l.status === 'inactive') && (
                      <button type="button" disabled={busy} onClick={() => setStatus(l.id, 'active')} className={actionClass}>
                        Reactivează
                      </button>
                    )}
                    <button type="button" disabled={busy} onClick={() => setConfirmDelete(l.id)} className={`${actionClass} ml-auto text-red-700`}>
                      Șterge
                    </button>
                  </div>
                )
              }
            />
          )
        })}
      </div>
    </div>
  )
}
