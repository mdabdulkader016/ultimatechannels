// Vercel serverless function for VIP code verification.
// Reuses the shared handler so dev (Vite), prod (Express) and Vercel all behave
// identically. Codes come from the VIP_CODES env var or the CODES list in
// ../server/vip.js.
import { vipHandler } from '../server/vip.js'

export default function handler(req, res) {
  return vipHandler(req, res)
}
