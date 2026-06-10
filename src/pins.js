import { createContext, useContext } from 'react'

// Pinned ("favorite") channels, shared via context so any ChannelCard can pin
// itself without every Row/Grid having to thread the props through. `pinned` is
// a Set of channel ids; `togglePin(id)` flips one. App owns the state and its
// localStorage persistence — this module is just the wiring.
export const PinContext = createContext({ pinned: new Set(), togglePin: () => {} })

export const usePins = () => useContext(PinContext)
