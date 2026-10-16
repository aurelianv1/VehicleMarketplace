import { useState } from 'react'

import { ApiError, imageUrl } from '../api/client'
import { imagesApi } from '../api/images'
import { MAX_IMAGES } from '../lib/image'
import type { CarImage } from '../types'
import { ImageDropzone, prepareFiles } from './ImageUploader'

type Props = {
  listingId: number
  images: CarImage[]
  onChange: (images: CarImage[]) => void
}

/** Pozele unui anunț existent: fiecare acțiune se trimite imediat la server. */
export default function ImageManager({ listingId, images, onChange }: Props) {
  const [busy, setBusy] = useState<string | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)

  const sorted = [...images].sort((a, b) => a.position - b.position)
  const reload = async () => onChange(await imagesApi.list(listingId))

  async function run(label: string, action: () => Promise<unknown>) {
    setBusy(label)
    setErrors([])
    try {
      await action()
    } catch (err) {
      setErrors([err instanceof ApiError ? err.message : 'Operația a eșuat'])
    } finally {
      // Reîncărcăm mereu de la server: e sursa de adevăr (ex. ce poză a devenit principală)
      await reload().catch(() => {})
      setBusy(null)
      setConfirmDelete(null)
    }
  }

  async function addFiles(files: File[]) {
    const { accepted, errors: prepErrors } = await prepareFiles(files, MAX_IMAGES - images.length)
    const uploadErrors: string[] = []
    setBusy('upload')
    for (const [i, file] of accepted.entries()) {
      setBusy(`Se încarcă poza ${i + 1} din ${accepted.length}…`)
      try {
        await imagesApi.upload(listingId, [file])
      } catch (err) {
        uploadErrors.push(err instanceof ApiError ? err.message : `${file.name}: încărcarea a eșuat`)
      }
    }
    await reload().catch(() => {})
    setBusy(null)
    setErrors([...prepErrors, ...uploadErrors])
  }

  return (
    <div className="space-y-3">
      {sorted.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="saved-images">
          {sorted.map((img, i) => (
            <li key={img.id} className="relative overflow-hidden rounded-md ring-1 ring-slate-200">
              <img src={imageUrl(img.url_thumb ?? img.url)} alt={`Poza ${i + 1}`} className="aspect-[4/3] w-full object-cover" />
              {img.is_main ? (
                <span className="absolute top-1 left-1 rounded bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white">
                  Principală
                </span>
              ) : (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => run('main', () => imagesApi.setMain(listingId, img.id))}
                  className="absolute top-1 left-1 rounded bg-white/90 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-white"
                >
                  Fă principală
                </button>
              )}
              {confirmDelete === img.id ? (
                <div className="absolute inset-x-0 bottom-0 flex gap-1 bg-black/70 p-1">
                  <button
                    type="button"
                    onClick={() => run('delete', () => imagesApi.remove(listingId, img.id))}
                    className="flex-1 rounded bg-red-600 py-1 text-xs font-semibold text-white"
                  >
                    Șterge
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(null)}
                    className="flex-1 rounded bg-white/90 py-1 text-xs font-medium"
                  >
                    Renunță
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => setConfirmDelete(img.id)}
                  aria-label={`Șterge poza ${i + 1}`}
                  className="absolute top-1 right-1 rounded-full bg-black/60 px-2 text-sm text-white hover:bg-black/80"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-amber-700">Anunțul nu are nicio poză, deci nu poate fi publicat.</p>
      )}

      <ImageDropzone onFiles={addFiles} disabled={busy !== null} remaining={MAX_IMAGES - images.length} />

      {busy?.startsWith('Se ') && (
        <p role="status" className="text-sm text-slate-600">
          {busy}
        </p>
      )}
      {errors.length > 0 && (
        <ul role="alert" className="space-y-1 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
