import React, { createContext, useContext, useRef, useCallback } from 'react'

const NavContext = createContext(null)

export function NavProvider({ setPage, children }) {
  const pendingRef = useRef(null)

  const navigate = useCallback((page, data) => {
    pendingRef.current = data || null
    setPage(page)
  }, [setPage])

  const consumeNavData = useCallback(() => {
    const data = pendingRef.current
    pendingRef.current = null
    return data
  }, [])

  return (
    <NavContext.Provider value={{ navigate, consumeNavData }}>
      {children}
    </NavContext.Provider>
  )
}

export function useNav() {
  return useContext(NavContext)
}
