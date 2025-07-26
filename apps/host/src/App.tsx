import React, { Suspense, useState, useEffect } from 'react'
import { Button } from '@module-federation-vite/ui'
import './App.css'

// Lazy load federated components with error handling
const PromptManagerCard = React.lazy(() => import('promptManager/PromptManagerCard').catch(() => {
  // Return a fallback component if the remote fails to load
  return Promise.resolve({
    default: () => (
      <div className="fallback-card prompt-manager-fallback">
        <div className="fallback-content">
          <h3>Prompt Manager Component</h3>
          <p>This is a fallback component (remote not available)</p>
          <p className="fallback-hint">
            Start the prompt-manager server to see the real component
          </p>
        </div>
      </div>
    )
  })
}))

const RecordCollectorCard = React.lazy(() => import('recordCollector/RecordCollectorCard').catch(() => {
  // Return a fallback component if the remote fails to load
  return Promise.resolve({
    default: () => (
      <div className="fallback-card record-collector-fallback">
        <div className="fallback-content">
          <h3>Record Collector Component</h3>
          <p>This is a fallback component (remote not available)</p>
          <p className="fallback-hint">
            Start the record-collector server to see the real component
          </p>
        </div>
      </div>
    )
  })
}))

const RequestReviewerCard = React.lazy(() => import('requestReviewer/RequestReviewerCard').catch(() => {
  // Return a fallback component if the remote fails to load
  return Promise.resolve({
    default: () => (
      <div className="fallback-card request-reviewer-fallback">
        <div className="fallback-content">
          <h3>Request Reviewer Component</h3>
          <p>This is a fallback component (remote not available)</p>
          <p className="fallback-hint">
            Start the request-reviewer server to see the real component
          </p>
        </div>
      </div>
    )
  })
}))

function App() {
  const [isLoading, setIsLoading] = useState(true)
  const [activeCard, setActiveCard] = useState<'recordCollector' | 'promptManager' | 'requestReviewer'>('recordCollector')
  const [isTransitioning, setIsTransitioning] = useState(false)

  useEffect(() => {
    // Simulate loading time
    const timer = setTimeout(() => setIsLoading(false), 1000)
    return () => clearTimeout(timer)
  }, [])

  const handleCardSwitch = (card: 'recordCollector' | 'promptManager' | 'requestReviewer') => {
    if (card === activeCard || isTransitioning) return
    
    setIsTransitioning(true)
    setActiveCard(card)
    
    // Reset transition state after animation completes
    setTimeout(() => setIsTransitioning(false), 300)
  }

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <h2>Loading Module Federation Host</h2>
        <p>Initializing federated components...</p>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Module Federation Host</h1>
        <p>Seamlessly navigate between federated components</p>
        <div className="navigation-tabs">
          <button 
            className={`nav-tab ${activeCard === 'recordCollector' ? 'active' : ''}`}
            onClick={() => handleCardSwitch('recordCollector')}
            disabled={isTransitioning}
          >
            <span className="tab-icon">📊</span>
            Record Collector
          </button>
          <button 
            className={`nav-tab ${activeCard === 'promptManager' ? 'active' : ''}`}
            onClick={() => handleCardSwitch('promptManager')}
            disabled={isTransitioning}
          >
            <span className="tab-icon">💬</span>
            Prompt Manager
          </button>
          <button 
            className={`nav-tab ${activeCard === 'requestReviewer' ? 'active' : ''}`}
            onClick={() => handleCardSwitch('requestReviewer')}
            disabled={isTransitioning}
          >
            <span className="tab-icon">🔍</span>
            Request Reviewer
          </button>
        </div>
      </header>
      
      <main className="app-main">
        <div className="stacked-cards-container">
          {/* Record Collector */}
          <div className={`card-wrapper record-collector-wrapper ${activeCard === 'recordCollector' ? 'active' : 'inactive'}`}>
            <div className="card-content">
              <div className="card-header">
                <h2>Record Collector</h2>
                <span className="card-badge">Record Collector App</span>
              </div>
              <div className="card-scrollable-content">
                <Suspense fallback={
                  <div className="loading-placeholder">
                    <div className="loading-dots">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                    <p>Loading Record Collector...</p>
                  </div>
                }>
                  <RecordCollectorCard />
                </Suspense>
              </div>
            </div>
          </div>

          {/* Prompt Manager */}
          <div className={`card-wrapper prompt-manager-wrapper ${activeCard === 'promptManager' ? 'active' : 'inactive'}`}>
            <div className="card-content">
              <div className="card-header">
                <h2>Prompt Manager</h2>
                <span className="card-badge">Prompt Manager App</span>
              </div>
              <div className="card-scrollable-content">
                <Suspense fallback={
                  <div className="loading-placeholder">
                    <div className="loading-dots">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                    <p>Loading Prompt Manager...</p>
                  </div>
                }>
                  <PromptManagerCard />
                </Suspense>
              </div>
            </div>
          </div>

          {/* Request Reviewer */}
          <div className={`card-wrapper request-reviewer-wrapper ${activeCard === 'requestReviewer' ? 'active' : 'inactive'}`}>
            <div className="card-content">
              <div className="card-header">
                <h2>Request Reviewer</h2>
                <span className="card-badge">Request Reviewer App</span>
              </div>
              <div className="card-scrollable-content">
                <Suspense fallback={
                  <div className="loading-placeholder">
                    <div className="loading-dots">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                    <p>Loading Request Reviewer...</p>
                  </div>
                }>
                  <RequestReviewerCard />
                </Suspense>
              </div>
            </div>
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
          <h2>Development Instructions</h2>
          <div className="instructions-content">
            <p><strong>To see the real federated components:</strong></p>
            <ol>
              <li>Go to the root directory and run: <code>npm run dev</code></li>
              <li>This runs <code>turbo run dev</code> under the hood, starting all apps in parallel</li>
              <li>For record-collector: <code>cd apps/record-collector && npm run build && npm run preview</code></li>
              <li>For request-reviewer: <code>cd apps/request-reviewer && npm run build && npm run preview</code></li>
            </ol>
            <p>The fallback components above will be replaced with real federated components when the remote servers are available.</p>
          </div>
        </div>
      </main>
    </div>
  )
}

export default App 