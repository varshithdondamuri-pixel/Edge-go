import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import PointerOverlay from './components/PointerOverlay.jsx'
import './styles/index.css'

const root = createRoot(document.getElementById('root'))
const params = new URLSearchParams(window.location.search)

if (params.get('overlay') === 'true') {
  root.render(<PointerOverlay />)
} else {
  root.render(<App />)
}
