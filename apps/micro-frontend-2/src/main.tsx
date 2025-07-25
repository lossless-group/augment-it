import React from 'react'
import ReactDOM from 'react-dom/client'
import CardB from './components/CardB.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <div style={{ 
      padding: '40px', 
      background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
      minHeight: '100vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center'
    }}>
      <div style={{ maxWidth: '400px', width: '100%' }}>
        <h1 style={{ 
          textAlign: 'center', 
          marginBottom: '30px',
          color: '#333',
          fontSize: '2rem'
        }}>
          Card B - Local Preview
        </h1>
        <CardB />
      </div>
    </div>
  </React.StrictMode>,
) 