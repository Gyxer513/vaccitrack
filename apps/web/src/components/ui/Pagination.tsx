// Нумерованная пагинация: первая, последняя, соседние текущей ±siblings, эллипсисы.
// Пример для pages=15, page=7, siblings=1: [1] ... [6] [7] [8] ... [15]

type Props = {
  page: number
  pages: number
  onChange: (p: number) => void
  siblings?: number
}

export function Pagination({ page, pages, onChange, siblings = 1 }: Props) {
  const items = buildPageItems(page, pages, siblings)

  return (
    <nav className="vt-pager" aria-label="Пагинация">
      <button
        className="vt-pager-btn"
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
        aria-label="Предыдущая"
      >
        ←
      </button>
      {items.map((it, i) =>
        it === '…' ? (
          <span key={`gap-${i}`} className="vt-pager-gap" aria-hidden>
            …
          </span>
        ) : (
          <button
            key={it}
            className={`vt-pager-btn ${it === page ? 'active' : ''}`}
            onClick={() => onChange(it)}
            aria-current={it === page ? 'page' : undefined}
          >
            {it}
          </button>
        ),
      )}
      <button
        className="vt-pager-btn"
        disabled={page === pages}
        onClick={() => onChange(page + 1)}
        aria-label="Следующая"
      >
        →
      </button>
    </nav>
  )
}

function buildPageItems(page: number, pages: number, siblings: number): (number | '…')[] {
  const total = 2 + 2 * siblings + 2 // первая + последняя + окно + 2 эллипсиса max
  if (pages <= total) {
    return Array.from({ length: pages }, (_, i) => i + 1)
  }
  const left = Math.max(page - siblings, 2)
  const right = Math.min(page + siblings, pages - 1)
  const items: (number | '…')[] = [1]
  if (left > 2) items.push('…')
  for (let i = left; i <= right; i++) items.push(i)
  if (right < pages - 1) items.push('…')
  items.push(pages)
  return items
}
