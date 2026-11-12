// Vercel runs every file in /api as a serverless function. An Express app is just a
// (request, response) handler, so exporting it is all that is needed.
// vercel.json rewrites /api/* to this function, and Express then does its own routing.
import app from '../server/app.js'

export default app
