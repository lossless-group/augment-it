import React from 'react'
import { Button } from '@module-federation-vite/ui'
import './CardA.css'

export interface CardAProps {
  title?: string
  description?: string
}

const CardA: React.FC<CardAProps> = ({ 
  title = "Card A Component", 
  description = "This is a federated component from micro-frontend-1" 
}) => {
  return (
    <div className="card-a">
      <div className="card-content">
        <p>
          {description}
        </p>
        <p>
          Demonstrates Module Federation capabilities with clean, modern styling and seamless integration.
        </p>
        <div className="card-actions">
          <Button onClick={() => alert('Card A button clicked!')}>
            Card A Action
          </Button>
          <Button variant="secondary" onClick={() => alert('Secondary action triggered!')}>
            Learn More
          </Button>
        </div>
      </div>
    </div>
  )
}

export default CardA 