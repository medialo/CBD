// Sert test-pages/ sur http://localhost:5180 (les content scripts ne tournent pas sur file:// par défaut).
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, normalize } from 'node:path'

const root = join(import.meta.dirname, '..', 'test-pages')
const port = 5180

createServer(async (request, response) => {
  const path = normalize(new URL(request.url, 'http://localhost').pathname).replace(/^([/\\])+/, '')
  try {
    const body = await readFile(join(root, path || 'countdown.html'))
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(body)
  } catch {
    response.writeHead(404).end('Not found')
  }
}).listen(port, () => console.log(`Pages de test : http://localhost:${port}/countdown.html`))
