import { defineConfig } from 'wxt';
export default defineConfig({
  manifest: {
    name: 'Better Roam',
    description: 'A cleaner Roam: Craft theme, advanced search, quick page creation, automatic caret focus, and simpler dialogs.',
    minimum_chrome_version: '111',
    icons: {128: 'icon.png'},
    host_permissions: ['https://roamresearch.com/*'],
    action: {default_title: 'Open Better Roam', default_icon: {128: 'icon.png'}},
    commands: {
      'new-page': {suggested_key: {default: 'Alt+Shift+N'}, description: 'Create a Roam page'},
      search: {suggested_key: {default: 'Alt+Shift+O'}, description: 'Open advanced search'},
      palette: {suggested_key: {default: 'Alt+Shift+K'}, description: 'Open command palette'},
      settings: {suggested_key: {default: 'Alt+Shift+S'}, description: 'Open settings'},
    },
  },
});
