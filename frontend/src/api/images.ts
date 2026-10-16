import type { CarImage } from '../types'
import { api } from './client'

export const imagesApi = {
  list: (listingId: number) => api<CarImage[]>(`/listings/${listingId}/images`),

  /** Câmpul `files` e repetabil în multipart; backend-ul validează conținutul real cu Pillow. */
  upload: (listingId: number, files: Blob[]) => {
    const form = new FormData()
    files.forEach((file, i) => form.append('files', file, file instanceof File ? file.name : `poza-${i + 1}.jpg`))
    return api<CarImage[]>(`/listings/${listingId}/images`, { method: 'POST', body: form })
  },

  setMain: (listingId: number, imageId: number) =>
    api<CarImage>(`/listings/${listingId}/images/${imageId}`, { method: 'PATCH', body: { is_main: true } }),

  remove: (listingId: number, imageId: number) =>
    api<void>(`/listings/${listingId}/images/${imageId}`, { method: 'DELETE' }),
}
