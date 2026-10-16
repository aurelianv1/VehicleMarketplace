import { useEffect } from 'react'

import { APP_NAME } from './brand'

/** Titlul din tab-ul browserului: „Anunțurile mele · Golden Marketplace”. */
export function usePageTitle(title: string | null | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME
  }, [title])
}
