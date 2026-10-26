import { defineManifest } from '@crxjs/vite-plugin'
import packageJson from './package.json' with { type: 'json' }

export default defineManifest({
  manifest_version: 3,
  name: 'CBD — Chrome Block Dealer',
  short_name: 'CBD',
  description: 'Ta dose d’automatisation : des clics automatiques sur les pages web, avec des scripts composés par blocs.',
  version: packageJson.version,
  permissions: ['storage', 'tabs'],
  host_permissions: ['<all_urls>'],
  background: {
    service_worker: 'src/background.ts',
    type: 'module',
  },
  action: {
    default_title: 'CBD — ta dose d’automatisation',
    default_popup: 'src/popup/index.html',
  },
  options_page: 'src/editor/index.html',
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content.ts'],
      run_at: 'document_idle',
    },
  ],
})
