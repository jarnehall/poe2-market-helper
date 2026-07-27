import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { fetchMeta } from '../lib/api'
import type { Meta } from '../types'

const MetaContext = createContext<Meta | null>(null)

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; meta: Meta }

// Fetches /api/meta once and only renders `children` once it resolves —
// everything below this (LeagueProvider, FiltersProvider, the page itself)
// can assume real league/category/pair-currency lists and filter bounds are
// already available, instead of null-checking a "not loaded yet" state.
export function MetaProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    fetchMeta(controller.signal)
      .then((meta) => setState({ status: 'success', meta }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to load',
        })
      })
    return () => controller.abort()
  }, [])

  if (state.status === 'loading') {
    return <div className="loading-spinner" role="status" aria-label="Loading" />
  }

  if (state.status === 'error') {
    return (
      <div className="app-load-error">
        <p>Couldn&rsquo;t load the app: {state.message}</p>
      </div>
    )
  }

  return <MetaContext.Provider value={state.meta}>{children}</MetaContext.Provider>
}

export function useMeta(): Meta {
  const meta = useContext(MetaContext)
  if (!meta) {
    throw new Error('useMeta must be used within a MetaProvider')
  }
  return meta
}
