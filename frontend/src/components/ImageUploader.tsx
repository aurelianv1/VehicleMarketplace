import { useEffect, useRef, useState } from 'react'
import type { DragEvent } from 'react'

import { ACCEPT_ATTR, MAX_IMAGE_MB, MAX_IMAGES, ImagePrepError, prepareImage } from '../lib/image'

export type PendingImage = { id: string; file: File; preview: string }

type DropzoneProps = {
  onFiles: (files: File[]) => void
  disabled?: boolean
  remaining: number
}

/** Zona de selectare: click deschide dialogul de fișiere, se poate și trage pozele peste ea. */
export function ImageDropzone({ onFiles, disabled, remaining }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    if (!disabled) onFiles([...e.dataTransfer.files])
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`rounded-lg border-2 border-dashed p-6 text-center transition ${
        dragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        multiple
        hidden
        data-testid="image-input"
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])])
          e.target.value = '' // permite selectarea aceluiași fișier din nou
        }}
      />
      <button
        type="button"
        disabled={disabled || remaining <= 0}
        onClick={() => inputRef.current?.click()}
        className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-blue-700 ring-1 ring-blue-200 hover:bg-blue-50 disabled:cursor-not-allowed"
      >
        Alege poze
      </button>
      <p className="mt-2 text-xs text-slate-500">
        sau trage-le aici · JPEG, PNG sau WEBP · pozele peste {MAX_IMAGE_MB} MB se micșorează automat ·{' '}
        {remaining > 0 ? `mai poți adăuga ${remaining}` : 'ai atins limita'}
      </p>
    </div>
  )
}

/** Verifică și pregătește fișierele; întoarce separat fișierele bune și erorile. */
export async function prepareFiles(files: File[], remaining: number) {
  const accepted: File[] = []
  const errors: string[] = []
  for (const file of files) {
    if (accepted.length >= remaining) {
      errors.push(`Un anunț poate avea cel mult ${MAX_IMAGES} poze; ${file.name} nu a fost adăugată`)
      continue
    }
    try {
      accepted.push(await prepareImage(file))
    } catch (err) {
      errors.push(err instanceof ImagePrepError ? err.message : `${file.name}: nu a putut fi citită`)
    }
  }
  return { accepted, errors }
}

type Props = {
  images: PendingImage[]
  onChange: (images: PendingImage[]) => void
  disabled?: boolean
}

/**
 * Poze încă neîncărcate (pentru anunțul nou): previzualizare locală, ștergere,
 * alegerea pozei principale. Prima poză din listă devine poza principală.
 */
export default function ImageUploader({ images, onChange, disabled }: Props) {
  const [errors, setErrors] = useState<string[]>([])
  const [processing, setProcessing] = useState(false)

  // Previzualizările sunt URL-uri blob: create local, trebuie eliberate la ieșire
  // `latest` ține lista curentă pentru curățenia de la demontare și pentru addFiles,
  // care continuă după un `await` (când `images` din closure poate fi deja vechi)
  const latest = useRef(images)
  useEffect(() => {
    latest.current = images
  }, [images])
  useEffect(() => () => latest.current.forEach((img) => URL.revokeObjectURL(img.preview)), [])

  async function addFiles(files: File[]) {
    setProcessing(true)
    const { accepted, errors } = await prepareFiles(files, MAX_IMAGES - images.length)
    setErrors(errors)
    setProcessing(false)
    onChange([
      ...latest.current,
      ...accepted.map((file) => ({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file) })),
    ])
  }

  function remove(id: string) {
    const img = images.find((i) => i.id === id)
    if (img) URL.revokeObjectURL(img.preview)
    onChange(images.filter((i) => i.id !== id))
  }

  function makeMain(id: string) {
    const img = images.find((i) => i.id === id)!
    onChange([img, ...images.filter((i) => i.id !== id)])
  }

  return (
    <div className="space-y-3">
      <ImageDropzone onFiles={addFiles} disabled={disabled || processing} remaining={MAX_IMAGES - images.length} />
      {processing && <p className="text-sm text-slate-500">Se pregătesc pozele…</p>}
      {errors.length > 0 && (
        <ul role="alert" className="space-y-1 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {images.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="pending-images">
          {images.map((img, i) => (
            <li key={img.id} className="group relative overflow-hidden rounded-md ring-1 ring-slate-200">
              <img src={img.preview} alt={`Poza ${i + 1}`} className="aspect-[4/3] w-full object-cover" />
              {i === 0 ? (
                <span className="absolute top-1 left-1 rounded bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white">
                  Principală
                </span>
              ) : (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => makeMain(img.id)}
                  className="absolute top-1 left-1 rounded bg-white/90 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-white"
                >
                  Fă principală
                </button>
              )}
              <button
                type="button"
                disabled={disabled}
                onClick={() => remove(img.id)}
                aria-label={`Șterge poza ${i + 1}`}
                className="absolute top-1 right-1 rounded-full bg-black/60 px-2 text-sm text-white hover:bg-black/80"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
