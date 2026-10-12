import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MPCShell } from './components/MPCShell'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode><MPCShell /></StrictMode>,
)
