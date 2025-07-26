import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Record {
  id: string;
  name: string;
  industry?: string;
  size?: string;
  location?: string;
  annual_revenue?: number;
  website?: string;
  description?: string;
  augmentationResults?: any;
  [key: string]: any;
}

export interface PerplexityConfig {
  apiKey: string;
  prompt: string;
  useDeepResearch: boolean;
  selectedModel: string;
  customProperties: string[];
}

export interface RecordStore {
  // Records state
  records: Record[];
  selectedRecord: Record | null;
  availableFields: string[];
  
  // Perplexity configuration (for request-reviewer)
  perplexityConfig: PerplexityConfig;
  
  // Actions
  setSelectedRecord: (record: Record) => void;
  addRecords: (newRecords: Record[]) => void;
  replaceAllRecords: (newRecords: Record[]) => void;
  deleteRecord: (recordId: string) => void;
  deleteAllRecords: () => void;
  updatePerplexityConfig: (updates: Partial<PerplexityConfig>) => void;
  updateRecordAugmentation: (recordId: string, augmentationData: any) => void;
}

export const useSharedRecordStore = create<RecordStore>()(
  persist(
    (set, get) => ({
      // Records state
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
      },
      
      // Actions
      setSelectedRecord: (record) => set({ selectedRecord: record }),
      
      addRecords: (newRecords) => {
        const currentRecords = get().records;
        const recordsWithIds = newRecords.map(record => ({
          ...record,
          id: record.id || `record_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        }));
        
        // Extract available fields from the new records
        const newFields = newRecords.length > 0 ? Object.keys(newRecords[0]) : [];
        const currentFields = get().availableFields;
        const allFields = [...new Set([...currentFields, ...newFields])];
        
        set({ 
          records: [...currentRecords, ...recordsWithIds],
          availableFields: allFields
        });
        
        // Update version in localStorage
        if (typeof window !== 'undefined') {
          const stored = localStorage.getItem('shared-record-store');
          if (stored) {
            const data = JSON.parse(stored);
            data.version = Date.now();
            localStorage.setItem('shared-record-store', JSON.stringify(data));
          }
        }
      },
      
      replaceAllRecords: (newRecords) => {
        const recordsWithIds = newRecords.map(record => ({
          ...record,
          id: record.id || `record_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        }));
        
        // Extract available fields from the new records
        const newFields = newRecords.length > 0 ? Object.keys(newRecords[0]) : [];
        
        set({ 
          records: recordsWithIds,
          availableFields: newFields,
          selectedRecord: null
        });
        
        // Update version in localStorage
        if (typeof window !== 'undefined') {
          const stored = localStorage.getItem('shared-record-store');
          if (stored) {
            const data = JSON.parse(stored);
            data.version = Date.now();
            localStorage.setItem('shared-record-store', JSON.stringify(data));
          }
        }
      },
      
      deleteRecord: (recordId) => {
        const currentRecords = get().records;
        set({ records: currentRecords.filter(record => record.id !== recordId) });
        
        // Update version in localStorage
        if (typeof window !== 'undefined') {
          const stored = localStorage.getItem('shared-record-store');
          if (stored) {
            const data = JSON.parse(stored);
            data.version = Date.now();
            localStorage.setItem('shared-record-store', JSON.stringify(data));
          }
        }
      },
      
      deleteAllRecords: () => {
        set({ records: [], selectedRecord: null, availableFields: [] });
        
        // Update version in localStorage
        if (typeof window !== 'undefined') {
          const stored = localStorage.getItem('shared-record-store');
          if (stored) {
            const data = JSON.parse(stored);
            data.version = Date.now();
            localStorage.setItem('shared-record-store', JSON.stringify(data));
          }
        }
      },
      
      // Perplexity config actions
      updatePerplexityConfig: (updates) => {
        set(state => ({
          perplexityConfig: { ...state.perplexityConfig, ...updates }
        }));
        
        // Update version in localStorage
        if (typeof window !== 'undefined') {
          const stored = localStorage.getItem('shared-record-store');
          if (stored) {
            const data = JSON.parse(stored);
            data.version = Date.now();
            localStorage.setItem('shared-record-store', JSON.stringify(data));
          }
        }
      },
      
      // Record augmentation actions
      updateRecordAugmentation: (recordId, augmentationData) => {
        set(state => ({
          records: state.records.map(record => 
            record.id === recordId 
              ? { ...record, augmentationResults: augmentationData }
              : record
          )
        }));
        
        // Update version in localStorage
        if (typeof window !== 'undefined') {
          const stored = localStorage.getItem('shared-record-store');
          if (stored) {
            const data = JSON.parse(stored);
            data.version = Date.now();
            localStorage.setItem('shared-record-store', JSON.stringify(data));
          }
        }
      }
    }),
    {
      name: 'shared-record-store',
      partialize: (state) => ({
        records: state.records,
        availableFields: state.availableFields,
        perplexityConfig: state.perplexityConfig
      }),
      onRehydrateStorage: () => (state) => {
        // Add version tracking to localStorage
        if (state && typeof window !== 'undefined') {
          const stored = localStorage.getItem('shared-record-store');
          if (stored) {
            const data = JSON.parse(stored);
            data.version = Date.now();
            localStorage.setItem('shared-record-store', JSON.stringify(data));
          }
        }
      }
    }
  )
);

// Add cross-service synchronization
if (typeof window !== 'undefined') {
  let lastKnownVersion = 0;
  
  // Function to check for updates
  const checkForUpdates = () => {
    try {
      const stored = localStorage.getItem('shared-record-store');
      if (stored) {
        const data = JSON.parse(stored);
        const currentVersion = data.version || 0;
        
        if (currentVersion > lastKnownVersion) {
          lastKnownVersion = currentVersion;
          const currentState = useSharedRecordStore.getState();
          
          // Only update if the data is actually different
          if (JSON.stringify(data.state.records) !== JSON.stringify(currentState.records) ||
              JSON.stringify(data.state.availableFields) !== JSON.stringify(currentState.availableFields) ||
              JSON.stringify(data.state.perplexityConfig) !== JSON.stringify(currentState.perplexityConfig)) {
            
            useSharedRecordStore.setState({
              records: data.state.records || [],
              availableFields: data.state.availableFields || [],
              perplexityConfig: data.state.perplexityConfig || {
                apiKey: '',
                prompt: '',
                useDeepResearch: false,
                selectedModel: 'sonar',
                customProperties: []
              }
            });
          }
        }
      }
    } catch (error) {
      console.warn('Error checking for store updates:', error);
    }
  };
  
  // Check for updates every 500ms
  const intervalId = setInterval(checkForUpdates, 500);
  
  // Clean up interval when page unloads
  window.addEventListener('beforeunload', () => {
    clearInterval(intervalId);
  });
  
  // Also listen for storage events (for same-origin tabs)
  window.addEventListener('storage', (event) => {
    if (event.key === 'shared-record-store') {
      checkForUpdates();
    }
  });
} 