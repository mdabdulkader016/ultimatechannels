// Vercel serverless function for the HLS stream proxy.
// The client (and rewritten manifests) call `/proxy?...`; vercel.json rewrites
// that path to this function. Reuses the shared framework-agnostic handler.
import { proxyHandler } from '../server/proxy.js'

export default function handler(req, res) {
  return proxyHandler(req, res)
}
