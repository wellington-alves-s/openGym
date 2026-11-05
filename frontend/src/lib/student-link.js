// The invite a trainer gives a student is origin + ?join=CODE, the twin of lib/device-link.js's
// ?link=. HashRouter never sees that query, so we read window.location.search directly.

export function joinTokenFromSearch(search) {
  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('join') || ''
}

export function stripJoinFromUrl() {
  if (typeof window === 'undefined') return
  const u = new URL(window.location.href)
  if (!u.searchParams.has('join')) return
  u.searchParams.delete('join')
  const q = u.searchParams.toString()
  history.replaceState({}, '', u.pathname + (q ? '?' + q : '') + u.hash)
}

// This app's own address, a subpath deployment included (the server knows its ORIGIN, not the path).
export function joinLinkUrl(code, loc = window.location) {
  return loc.origin + loc.pathname + '?join=' + encodeURIComponent(code)
}
