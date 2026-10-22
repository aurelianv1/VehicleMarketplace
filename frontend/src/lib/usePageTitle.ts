import { useEffect } from 'react'

import { APP_NAME } from './brand'

/**
 * Titlul din tab-ul browserului („Anunțurile mele · Golden Marketplace”) și, opțional,
 * descrierea pentru motoarele de căutare (<meta name="description">). La ieșirea de pe
 * pagină se revine la descrierea generală din index.html.
 */
export function usePageTitle(title: string | null | undefined, description?: string) {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME
  }, [title])

  useEffect(() => {
    if (!description) return
    const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    if (!meta) return
    const original = meta.content
    meta.content = description
    return () => {
      meta.content = original
    }
  }, [description])
}
