import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { ApiError } from '../api/client'
import { LISTING_FILTER_KEYS, listingsApi } from '../api/listings'
import type { ListingQuery } from '../api/listings'
import ErrorMessage from '../components/ErrorMessage'
import Filters, { emptyFilters } from '../components/Filters'
import type { FilterValues } from '../components/Filters'
import ListingCard from '../components/ListingCard'
import Pagination from '../components/Pagination'
import Spinner from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import { SORT_LABELS, options, pluralListings } from '../lib/format'
import type { ListingCard as Listing, Page, SortOption } from '../types'

const isSort = (v: string | null): v is SortOption => v !== null && v in SORT_LABELS

/**
 * Filtrele, sortarea și pagina stau în URL (?brand=BMW&page=2), nu în state:
 * linkul se poate trimite cuiva, iar butonul Back revine la căutarea anterioară.
 */
export default function Home() {
  const { user, initializing } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const sortParam = searchParams.get('sort')
  const sort: SortOption = isSort(sortParam) ? sortParam : 'recent'
  const filters: FilterValues = { ...emptyFilters() }
  for (const key of LISTING_FILTER_KEYS) filters[key] = searchParams.get(key) ?? ''

  const [data, setData] = useState<Page<Listing> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const queryKey = searchParams.toString()

  useEffect(() => {
    // Așteptăm să știm dacă e cineva logat: altfel cererea pleacă fără token
    // și inimile de la favorite apar goale chiar dacă anunțul e salvat.
    if (initializing) return

    let cancelled = false // ignoră răspunsurile vechi dacă utilizatorul a schimbat filtrul între timp
    setLoading(true)
    setError(null)

    const query: ListingQuery = { page: String(page), sort, per_page: '12' }
    for (const key of LISTING_FILTER_KEYS) {
      const value = searchParams.get(key)?.trim()
      if (value) query[key] = value
    }

    listingsApi
      .search(query)
      .then((res) => !cancelled && setData(res))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : 'Nu am putut încărca anunțurile'))
      .finally(() => !cancelled && setLoading(false))

    return () => {
      cancelled = true
    }
    // queryKey acoperă toți parametrii din URL; user?.id reîncarcă după login/logout
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, initializing, user?.id])

  function updateParams(changes: Record<string, string>, resetPage = true) {
    const next = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(changes)) {
      if (value.trim()) next.set(key, value.trim())
      else next.delete(key)
    }
    if (resetPage) next.delete('page') // filtru nou → înapoi la pagina 1
    setSearchParams(next)
  }

  function goToPage(p: number) {
    updateParams({ page: p > 1 ? String(p) : '' }, false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const [showFilters, setShowFilters] = useState(false)
  const activeFilters = LISTING_FILTER_KEYS.filter((k) => filters[k]).length

  return (
    <div className="py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Anunțuri auto</h1>
          {data && <p className="text-sm text-slate-500">{pluralListings(data.total)}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className="rounded-md bg-white px-3 py-2 text-sm font-medium ring-1 ring-slate-300 lg:hidden"
            aria-expanded={showFilters}
          >
            Filtre{activeFilters > 0 && ` (${activeFilters})`}
          </button>
          <label className="flex items-center gap-2 text-sm">
            <span className="hidden text-slate-500 sm:inline">Sortează:</span>
            <select
              value={sort}
              onChange={(e) => updateParams({ sort: e.target.value === 'recent' ? '' : e.target.value })}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {options(SORT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <aside className={`${showFilters ? 'block' : 'hidden'} lg:block`}>
          <Filters
            key={queryKey} // URL nou (ex. Back) → formularul preia valorile din URL
            initial={filters}
            onApply={(values) => {
              updateParams(values)
              setShowFilters(false)
            }}
            onReset={() => setSearchParams(sort === 'recent' ? {} : { sort })}
          />
        </aside>

        <section>
          <ErrorMessage message={error} />

          {loading && !data && <Spinner />}

          {data && data.items.length === 0 && !loading && (
            <div className="rounded-lg bg-white p-10 text-center ring-1 ring-slate-200">
              <p className="font-medium">Niciun anunț nu corespunde filtrelor.</p>
              <button
                type="button"
                onClick={() => setSearchParams({})}
                className="mt-3 text-sm font-medium text-blue-600 hover:underline"
              >
                Șterge filtrele
              </button>
            </div>
          )}

          {data && data.items.length > 0 && (
            // Păstrăm rezultatele vechi (estompate) cât se încarcă cele noi, ca pagina să nu „sară”
            <div className={`transition-opacity ${loading ? 'opacity-50' : ''}`}>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {data.items.map((listing) => (
                  <ListingCard key={listing.id} listing={listing} />
                ))}
              </div>
              <Pagination page={data.page} pages={data.pages} onChange={goToPage} />
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
