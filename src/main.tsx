import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@fontsource-variable/inter/standard.css'
// A second, characterful face for the VN/manga mood — deliberately scoped to character
// name-plates only (VNStage, MessageBubble), not swept across the whole app's editor/settings
// chrome, which stays plain Inter. See ROADMAP.md section 5.
import '@fontsource/zen-maru-gothic/500.css'
import '@fontsource/zen-maru-gothic/700.css'
import './styles/globals.css'
import { registerBuiltInPlugins } from './lib/plugins'

// The registry is populated once, before the first prompt can be built: registration is what makes
// a plugin exist, and grants replay from storage on every boot.
registerBuiltInPlugins()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
