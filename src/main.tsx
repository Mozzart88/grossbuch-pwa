import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

let lastWidth = window.innerWidth
const updateVH = () => {
  const w = window.innerWidth
  if (w !== lastWidth) {
    lastWidth = w
    document.documentElement.style.setProperty(
      '--vh',
      `${window.visualViewport?.height ?? window.innerHeight}px`
    )
  }
}
window.addEventListener('resize', updateVH)
document.documentElement.style.setProperty(
  '--vh',
  `${window.visualViewport?.height ?? window.innerHeight}px`
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
