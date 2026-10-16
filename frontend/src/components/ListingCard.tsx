import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { imageUrl } from '../api/client'
import { FUEL_LABELS, TRANSMISSION_LABELS, formatKm, formatPrice } from '../lib/format'
import type { ListingCard as Listing } from '../types'
import FavoriteButton from './FavoriteButton'

type Props = {
  listing: Listing
  showFavorite?: boolean
  onFavoriteChange?: (isFavorite: boolean) => void
  /** Conținut suplimentar sub card (ex. butoane în „Anunțurile mele”) */
  footer?: ReactNode
  /** Eticheta de status (ex. „Ciornă”) peste poză */
  badge?: ReactNode
}

export default function ListingCard({ listing, showFavorite = true, onFavoriteChange, footer, badge }: Props) {
  return (
    <article className="relative flex flex-col overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200 transition hover:shadow-md">
      <Link to={`/listings/${listing.id}`} className="flex flex-1 flex-col">
        <div className="aspect-[4/3] bg-slate-100">
          <img
            src={imageUrl(listing.main_image)}
            alt={listing.title}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        </div>
        <div className="flex flex-1 flex-col p-4">
          <h2 className="line-clamp-2 font-semibold text-slate-900">{listing.title}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {listing.year} · {formatKm(listing.mileage_km)} · {FUEL_LABELS[listing.fuel_type]} ·{' '}
            {TRANSMISSION_LABELS[listing.transmission]}
          </p>
          <div className="mt-auto flex items-end justify-between pt-3">
            <span className="text-lg font-bold text-blue-700">{formatPrice(listing.price, listing.currency)}</span>
            <span className="text-sm text-slate-500">{listing.city}</span>
          </div>
        </div>
      </Link>

      {/* Butonul stă în afara <Link>, ca un click pe inimă să nu deschidă anunțul */}
      {showFavorite && (
        <FavoriteButton
          listingId={listing.id}
          initial={listing.is_favorite}
          onChange={onFavoriteChange}
          className="absolute top-2 right-2"
        />
      )}
      {badge && <div className="absolute top-2 left-2">{badge}</div>}
      {footer && <div className="border-t border-slate-100 p-3">{footer}</div>}
    </article>
  )
}
