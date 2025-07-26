# Shared Zustand Store for Micro-Services

This document explains how to use the shared Zustand store to pass records between the `record-collector` and `request-reviewer` micro-services.

## Overview

The shared store uses Zustand with persistence middleware to maintain state across both micro-services. Records imported in the `record-collector` will automatically be available in the `request-reviewer`.

## File Structure

```
packages/
└── utils/
    ├── package.json
    ├── vite.config.ts
    ├── tsconfig.json
    └── src/
        ├── index.ts (main exports)
        └── store.ts (shared store implementation)

apps/
├── record-collector/
│   └── src/
│       └── lib/
│           └── store.js (re-exports from @module-federation-vite/utils)
└── request-reviewer/
    └── src/
        └── lib/
            └── store.js (re-exports from @module-federation-vite/utils)
```

## How It Works

1. **Shared Package**: The store is implemented in `@module-federation-vite/utils` package
2. **Workspace Dependencies**: Both micro-services depend on the shared utils package
3. **Persistence**: The store uses localStorage with the key `shared-record-store`
4. **Automatic Sync**: When one service updates the store, the other service will see the changes immediately
5. **Version Tracking**: Each change increments a timestamp version to detect updates
6. **Polling**: Services check for updates every 500ms to ensure real-time synchronization
7. **Re-exports**: Each service re-exports the shared store as `useRecordStore` for consistency

## Store State

```javascript
{
  // Records from CSV imports
  records: [],
  selectedRecord: null,
  availableFields: [],
  
  // Perplexity configuration (for request-reviewer)
  perplexityConfig: {
    apiKey: '',
    prompt: '',
    useDeepResearch: false,
    selectedModel: 'sonar',
    customProperties: []
  }
}
```

## Available Actions

### Record Management
- `addRecords(newRecords)` - Add new records to the store
- `replaceAllRecords(newRecords)` - Replace all records with new ones
- `deleteRecord(recordId)` - Delete a specific record
- `deleteAllRecords()` - Clear all records
- `setSelectedRecord(record)` - Set the currently selected record

### Perplexity Configuration
- `updatePerplexityConfig(updates)` - Update Perplexity API configuration
- `updateRecordAugmentation(recordId, augmentationData)` - Add augmentation results to a record

## Usage Example

### In record-collector
```javascript
import { useRecordStore } from '../lib/store';

function MyComponent() {
  const { records, addRecords } = useRecordStore();
  
  const handleImport = (csvData) => {
    addRecords(csvData);
  };
  
  return (
    <div>
      {records.length} records loaded
    </div>
  );
}
```

### In request-reviewer
```javascript
import { useRecordStore } from '../lib/store';

function MyComponent() {
  const { records, perplexityConfig, updatePerplexityConfig } = useRecordStore();
  
  return (
    <div>
      {records.length} records available for augmentation
    </div>
  );
}
```

### Direct import from package (alternative)
```javascript
import { useSharedRecordStore } from '@module-federation-vite/utils/store';

function MyComponent() {
  const { records, addRecords } = useSharedRecordStore();
  // ... rest of component
}
```

## Workflow

1. **Import Records**: Use the record-collector to import CSV files
2. **Switch to request-reviewer**: The records will automatically be available
3. **Configure Perplexity**: Set up API key and prompt in request-reviewer
4. **Augment Records**: Select records and run augmentation
5. **View Results**: Augmentation results are stored with the records

## Benefits

- **True Code Sharing**: Single source of truth in the shared package
- **Seamless Integration**: No need to manually pass data between services
- **Persistent State**: Data survives page refreshes and service restarts
- **Real-time Updates**: Changes in one service immediately reflect in the other (within 500ms)
- **Automatic Synchronization**: No manual refresh required when switching between services
- **Type Safety**: Consistent data structure across both services with TypeScript interfaces
- **Scalable**: Easy to add more micro-services that share the same data
- **Maintainable**: Changes to the store only need to be made in one place

## Troubleshooting

### Records not appearing in request-reviewer
1. Check that both services are using the same localStorage key
2. Verify that the shared store is properly imported
3. Check browser console for any errors

### Data persistence issues
1. Ensure both services have the same store implementation
2. Check that the persistence middleware is configured correctly
3. Verify the localStorage key matches between services

## Future Enhancements

- Add data validation and sanitization
- Implement data versioning for backward compatibility
- Add data export/import functionality
- Consider using IndexedDB for larger datasets
- Add real-time synchronization across browser tabs 