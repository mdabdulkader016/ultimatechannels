// Vercel serverless function for the admin API. Reuses the shared handler so
// dev (Vite), prod (Express) and Vercel behave identically.
import { adminHandler } from '../server/admin.js'

export default function handler(req, res) {
  return adminHandler(req, res)
}
