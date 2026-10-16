type Props = {
  page: number
  pages: number
  onChange: (page: number) => void
}

/** Paginile din jurul celei curente, cu „…” între ele: 1 … 4 5 [6] 7 8 … 20 */
function pageNumbers(page: number, pages: number): (number | '…')[] {
  const wanted = new Set([1, pages, page - 2, page - 1, page, page + 1, page + 2])
  const sorted = [...wanted].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b)

  const result: (number | '…')[] = []
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) result.push('…')
    result.push(p)
  })
  return result
}

export default function Pagination({ page, pages, onChange }: Props) {
  if (pages <= 1) return null

  const base = 'min-w-10 rounded-md px-3 py-2 text-sm font-medium'
  const idle = `${base} bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white`

  return (
    <nav className="mt-8 flex flex-wrap items-center justify-center gap-1" aria-label="Paginare">
      <button type="button" className={idle} disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ‹ Înapoi
      </button>
      {pageNumbers(page, pages).map((p, i) =>
        p === '…' ? (
          <span key={`gap-${i}`} className="px-2 text-slate-400">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-current={p === page ? 'page' : undefined}
            className={p === page ? `${base} bg-blue-600 text-white` : idle}
          >
            {p}
          </button>
        ),
      )}
      <button type="button" className={idle} disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Înainte ›
      </button>
    </nav>
  )
}
