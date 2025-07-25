![Augment-It Banner with Fern -> Pastel Gradient](https://i.imgur.com/PxOXxv2.png)
# Augment-It on Bolt.new

This version of the project was written in January 2025 and was our first experience with [Vibe Coding](https://www.lossless.group/more-about/vibe-coding).

## Tech Stack

- [x] Bolt.new
- [x] React
- [x] Vite
- [x] TailwindCSS
- [x] Zustand
- [x] Anthropic AI SDK
- [x] Supabase

# Problems Encountered

- Vibe Coding uncovered that LLMs are `lumpers` and not `splitters`, meaning they prefer to have a very few set of files that the will make really really really really really long.  

- We had to go hard on [Prompt Engineering](https://www.lossless.group/vibe-with/us) to get the LLM to generate appropriate Components. 

- Even with really vigilant prompt engineering, the LLM would still randomly overwrite parts of the app with it's new improvised code. And very often it destroyed something that was working exactly as intended, if not removed it entirely.  

- This created a need for better use of git and github to track changes, which we unfortunately realized too late to utilize in managing the complexity of the project. 

- We also recognized the wisdom of microservices architecture, which is usually only needed when projects organically become too complex to manage as a monolith, and the product, design, and engineering teams are large enough to create dedicated teams to manage each [microservice architecture](https://www.lossless.group/more-about/microservices) and [microfrontend architecture](https://www.lossless.group/more-about/microfrontend-architecture). 


# Key Components

## 1. App.tsx

The root component that handles:
- Authentication flows (login, signup, password reset)
- Initial data loading
- Routing (implicit based on auth state)

## 2. Core UI Components

#### DataModelModal
- **Purpose**: Modal for viewing and editing data models
- **Key Features**:
  - Form for creating/editing data models
  - Field type definitions
  - Validation rules

#### EditQueryOptions
- **Purpose**: Interface for configuring query parameters
- **Key Features**:
  - Model selection
  - Temperature and other AI parameters
  - Prompt customization

#### HighlightsContextWrapper
- **Purpose**: Context provider for managing highlighted content
- **Key Features**:
  - Manages highlight state
  - Coordinates between different highlightable components

#### MDXEditor
- **Purpose**: Rich text editor for prompt content
- **Key Features**:
  - Markdown support
  - Code block highlighting
  - Inline formatting

#### MainLayout
- **Purpose**: Main application layout component
- **Key Features**:
  - Navigation sidebar
  - Responsive design
  - User menu and settings

#### PromptList
- **Purpose**: Displays list of available prompt templates
- **Key Features**:
  - Search and filter functionality
  - Template preview
  - Selection handling

#### PromptSection
- **Purpose**: Individual section within a prompt template
- **Key Features**:
  - Toggle between edit and preview modes
  - Model-specific configuration
  - Content validation

#### QueryResponse
- **Purpose**: Displays AI model responses
- **Key Features**:
  - Syntax highlighting
  - Response actions (copy, regenerate, etc.)
  - Error handling

#### RecordList
- **Purpose**: Displays data records
- **Key Features**:
  - Pagination
  - Sorting and filtering
  - Selection management

#### PasswordReset
- **Purpose**: Handles password reset flow
- **Key Features**:
  - Email validation
  - Error handling
  - Success feedback

#### PromptSectionEdit
- **Purpose**: Edit interface for prompt sections
- **Key Features**:
  - Rich text editing
  - Model configuration
  - Preview toggle

#### PromptSectionPreview
- **Purpose**: Read-only view of prompt sections
- **Key Features**:
  - Rendered markdown
  - Section actions (edit, delete)
  - Model badge display

#### QueryOptionsIconSet
- **Purpose**: Visual indicators for query options
- **Key Features**:
  - Model type icons
  - Parameter indicators
  - Interactive tooltips

#### QueryResponseList
- **Purpose**: Manages multiple query responses
- **Key Features**:
  - Response grouping
  - Version comparison
  - Batch actions

#### RecordHighlightsWrapper
- **Purpose**: Context for record highlighting
- **Key Features**:
  - Highlight management
  - Cross-component synchronization
  - Persistence

#### RequestEditor
- **Purpose**: Interface for crafting API requests
- **Key Features**:
  - Parameter editing
  - Request preview
  - History tracking

#### ResponseHighlight
- **Purpose**: Highlights specific response sections
- **Key Features**:
  - Custom highlight colors
  - Note attachment
  - Shareable links

#### ResponseObjectContextWrapper
- **Purpose**: Manages response object state
- **Key Features**:
  - Context provider
  - State persistence
  - Event handling

#### ResponseObjectHighlighter
- **Purpose**: Interactive response highlighting
- **Key Features**:
  - Text selection
  - Color coding
  - Annotation

#### ResponseObjectReviewer
- **Purpose**: Interface for reviewing responses
- **Key Features**:
  - Side-by-side comparison
  - Commenting
  - Approval workflow

#### UpdatePassword
- **Purpose**: Password update interface
- **Key Features**:
  - Current password verification
  - New password validation
  - Strength indicator

#### UserProfile
- **Purpose**: User account management
- **Key Features**:
  - Profile editing
  - API key management
  - Account settings
