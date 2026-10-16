// Pregătirea pozelor înainte de upload. Backend-ul rămâne cel care validează
// (după conținut, cu Pillow); aici doar dăm mesaje clare mai devreme și evităm
// să trimitem fișiere de 10 MB de pe telefon.

export const MAX_IMAGE_MB = 5 // aceeași limită ca MAX_IMAGE_SIZE_MB din backend
export const MAX_IMAGES = 15 // MAX_IMAGES_PER_LISTING
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIDE = 2400 // backend-ul oricum reduce la maxim 1600×1200

export const ACCEPT_ATTR = ACCEPTED.join(',')

export class ImagePrepError extends Error {}

/** Întoarce fișierul gata de trimis: neschimbat dacă e mic, micșorat dacă depășește limita. */
export async function prepareImage(file: File): Promise<File> {
  if (!ACCEPTED.includes(file.type)) {
    throw new ImagePrepError(`${file.name}: sunt acceptate doar imagini JPEG, PNG sau WEBP`)
  }
  if (file.size <= MAX_IMAGE_MB * 1024 * 1024) return file

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new ImagePrepError(`${file.name}: fișierul nu poate fi citit ca imagine`)
  }

  // De obicei prima încercare ajunge; pentru poze foarte detaliate reducem treptat
  let side = Math.min(MAX_SIDE, Math.max(bitmap.width, bitmap.height))
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const blob = await drawToJpeg(bitmap, side)
      if (blob && blob.size <= MAX_IMAGE_MB * 1024 * 1024) {
        return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
      }
      side = Math.round(side * 0.75)
    }
  } finally {
    bitmap.close()
  }
  throw new ImagePrepError(`${file.name}: imaginea depășește limita de ${MAX_IMAGE_MB} MB`)
}

function drawToJpeg(bitmap: ImageBitmap, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff' // PNG transparent → fundal alb, ca în backend
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88))
}
