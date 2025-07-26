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
    records: Record[];
    selectedRecord: Record | null;
    availableFields: string[];
    perplexityConfig: PerplexityConfig;
    setSelectedRecord: (record: Record) => void;
    addRecords: (newRecords: Record[]) => void;
    replaceAllRecords: (newRecords: Record[]) => void;
    deleteRecord: (recordId: string) => void;
    deleteAllRecords: () => void;
    updatePerplexityConfig: (updates: Partial<PerplexityConfig>) => void;
    updateRecordAugmentation: (recordId: string, augmentationData: any) => void;
}
export declare const useSharedRecordStore: import('zustand').UseBoundStore<Omit<import('zustand').StoreApi<RecordStore>, "persist"> & {
    persist: {
        setOptions: (options: Partial<import('zustand/middleware').PersistOptions<RecordStore, {
            records: Record[];
            availableFields: string[];
            perplexityConfig: PerplexityConfig;
        }>>) => void;
        clearStorage: () => void;
        rehydrate: () => Promise<void> | void;
        hasHydrated: () => boolean;
        onHydrate: (fn: (state: RecordStore) => void) => () => void;
        onFinishHydration: (fn: (state: RecordStore) => void) => () => void;
        getOptions: () => Partial<import('zustand/middleware').PersistOptions<RecordStore, {
            records: Record[];
            availableFields: string[];
            perplexityConfig: PerplexityConfig;
        }>>;
    };
}>;
//# sourceMappingURL=store.d.ts.map