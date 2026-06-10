// Vercel serverless function for per-VIP-code pin sync. Delegates to the shared
// handler so dev (Vite), prod (Express) and Vercel all behave identically.
import { pinsHandler } from '../server/pins.js'

export default function handler(req, res) {
  return pinsHandler(req, res)
}
