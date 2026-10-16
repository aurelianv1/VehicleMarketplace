import { useEffect } from 'react'

/** Titlul din tab-ul browserului: „Anunțurile mele · AutoPiață”. */
export function usePageTitle(title: string | null | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · AutoPiață` : 'AutoPiață'
  }, [title])
}
