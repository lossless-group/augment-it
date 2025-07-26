import React from 'react'
import { Button } from '@module-federation-vite/ui'
import './CardB.css'

export interface CardBProps {
  title?: string
  description?: string
}

const CardB: React.FC<CardBProps> = ({ 
  title = "Card B Component", 
  description = "This is a federated component from micro-frontend-2" 
}) => {
  return (
    <div className="card-b">
      <div className="card-content">
        <p>
          {description}
        </p>
        <p>
          Demonstrates Module Federation capabilities with clean, modern styling and seamless integration.
        </p>
        <div className="card-actions">
          <Button onClick={() => alert('Card B button clicked!')}>
            Card B Action
          </Button>
          <Button variant="secondary" onClick={() => alert('Secondary action triggered!')}>
            Learn More
          </Button>
        </div>
      </div>
    </div>
  )
}

export default CardB 