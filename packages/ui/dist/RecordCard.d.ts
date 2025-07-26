import { default as React } from 'react';
import { Record } from '@module-federation-vite/utils';
export interface RecordCardProps {
    record: Record;
    onDelete?: (id: string) => void;
    onEdit?: (record: Record) => void;
    onSelect?: (record: Record) => void;
    isSelected?: boolean;
    isProcessing?: boolean;
    variant?: 'collector' | 'reviewer';
}
export declare const RecordCard: React.FC<RecordCardProps>;
//# sourceMappingURL=RecordCard.d.ts.map