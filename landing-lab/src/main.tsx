import { createRoot } from 'react-dom/client'

import App from './App'
import './index.css'

// NOTE: StrictMode is intentionally omitted. Its double-mount in React 19
// breaks framer-motion's scroll-linked MotionValue subscriptions (transforms
// keep updating but opacity freezes at its initial value).
createRoot(document.getElementById('root')!).render(<App />)
