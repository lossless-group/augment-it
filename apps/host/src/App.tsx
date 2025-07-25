import React, { Suspense, useState, useEffect } from 'react'
import { Button } from '@module-federation-vite/ui'
import './App.css'

// Lazy load federated components with error handling
const CardA = React.lazy(() => import('cardA/Card').catch(() => {
  // Return a fallback component if the remote fails to load
  return Promise.resolve({
    default: () => (
      <div style={{ 
        padding: '20px', 
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        borderRadius: '12px',
        textAlign: 'center'
      }}>
        <h3>Card A Component</h3>
        <p>This is a fallback component (remote not available)</p>
        <p style={{ fontSize: '0.9rem', opacity: 0.8 }}>
          Start the micro-frontend-1 server to see the real component
        </p>
      </div>
    )
  })
}))

const CardB = React.lazy(() => import('cardB/Card').catch(() => {
  // Return a fallback component if the remote fails to load
  return Promise.resolve({
    default: () => (
      <div style={{ 
        padding: '20px', 
        background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
        color: 'white',
        borderRadius: '12px',
        textAlign: 'center'
      }}>
        <h3>Card B Component</h3>
        <p>This is a fallback component (remote not available)</p>
        <p style={{ fontSize: '0.9rem', opacity: 0.8 }}>
          Start the micro-frontend-2 server to see the real component
        </p>
      </div>
    )
  })
}))

function App() {
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Simulate loading time
    const timer = setTimeout(() => setIsLoading(false), 1000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <h1>Module Federation Host App</h1>
        <p>This app consumes federated components from card-a and card-b</p>
      </header>
      
      <main className="app-main">
        <div className="cards-container">
          <div className="card-section">
            <h2>Card A (from micro-frontend-1)</h2>
            <Suspense fallback={
              <div style={{ 
                padding: '20px', 
                background: '#f0f0f0', 
                borderRadius: '12px',
                textAlign: 'center'
              }}>
                Loading Card A...
              </div>
            }>
              <CardA />
            </Suspense>
          </div>
          
          <div className="card-section">
            <h2>Card B (from micro-frontend-2)</h2>
            <Suspense fallback={
              <div style={{ 
                padding: '20px', 
                background: '#f0f0f0', 
                borderRadius: '12px',
                textAlign: 'center'
              }}>
                Loading Card B...
              </div>
            }>
              <CardB />
            </Suspense>
          </div>
        </div>
        
        <div className="shared-ui-section">
          <h2>Shared UI Components</h2>
          <div className="button-group">
            <Button onClick={() => alert('Primary button clicked!')}>
              Primary Button
            </Button>
            <Button variant="secondary" onClick={() => alert('Secondary button clicked!')}>
              Secondary Button
            </Button>
          </div>
        </div>

        <div className="instructions-section">
          <h2 style={{ color: '#213547' }}>Development Instructions</h2>
          <div style={{ background: '#f8f9fa', padding: '20px', borderRadius: '8px', color: '#213547' }}>
            <p><strong>To see the real federated components:</strong></p>
            <ol>
              <li>Go to the root directory and run: <code>npm run dev</code></li>
              <li>This runs <code>turbo run dev</code> under the hood, starting all apps in parallel</li>
              <li>Or build and preview individually: <code>cd apps/micro-frontend-1 && npm run build && npm run preview</code></li>
            </ol>
            <p>The fallback components above will be replaced with real federated components when the remote servers are available.</p>
          </div>
        </div>
      </main>
    </div>
  )
}

export default App 