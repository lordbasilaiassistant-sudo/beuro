import * as React from "react"

const MOBILE_BREAKPOINT = 768
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

/**
 * Is the viewport phone-sized?
 *
 * This is exactly what useSyncExternalStore exists for: a value that lives in
 * an external system (matchMedia) and changes outside React. The stock shadcn
 * version subscribed in an effect and then called setState synchronously in
 * the same effect body, which cascades a render on every mount and trips
 * react-hooks/set-state-in-effect.
 *
 * getServerSnapshot returns false so the server renders the desktop layout and
 * the client corrects on hydration — there is no viewport on the server, and
 * guessing one is how you get a hydration mismatch.
 */
function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

export function useIsMobile(): boolean {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  )
}
