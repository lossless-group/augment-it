import React from 'react';
import { Search, Upload, X, Trash2, Database, Settings, Eraser } from 'lucide-react';
import { useStore } from '../store';
import type { Record } from '../types';

interface RecordListProps {
  onOpenDataModel: () => void;
}

export const RecordList: React.FC<RecordListProps> = ({ onOpenDataModel }) => {
  const { records, selectedRecord, setSelectedRecord, addRecords, deleteRecord, deleteAllRecords } = useStore();
  const [searchQuery, setSearchQuery] = React.useState('');
  const [isImportOpen, setIsImportOpen] = React.useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const filteredRecords = records.filter((record) =>
    record.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Parse a CSV line respecting quotes
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Handle escaped quotes
          current += '"';
          i++;
        } else {
          // Toggle quote mode
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // End of field
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    // Add the last field
    result.push(current.trim());
    return result;
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      // Split by newlines but handle potential quoted newlines
      const lines = text.split(/\r?\n/).filter(line => line.trim());
      const headers = parseCSVLine(lines[0]);
      
      const nameIndex = headers.indexOf('name');
      if (nameIndex === -1) {
        throw new Error("CSV must contain a 'name' column");
      }

      const newRecords: Record[] = lines
        .slice(1)
        .filter(line => line.trim())
        .map(line => {
          const values = parseCSVLine(line);
          const record: Record = {
            id: crypto.randomUUID(),
            name: values[nameIndex]
          };

          headers.forEach((header, index) => {
            if (header !== 'id' && header !== 'name') {
              const value = values[index];
              if (value !== undefined) {
                const numberValue = Number(value);
                record[header] = !isNaN(numberValue) && value !== '' ? numberValue : value;
              }
            }
          });

          return record;
        });

      await addRecords(newRecords);
      setIsImportOpen(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Error parsing CSV:', error);
      alert(error instanceof Error ? error.message : 'Error parsing CSV file. Please check the format and try again.');
    }
  };

  const handleDeleteAll = async () => {
    try {
      await deleteAllRecords();
      setIsConfirmDeleteOpen(false);
    } catch (error) {
      console.error('Error deleting all records:', error);
      alert('Error deleting all records. Please try again.');
    }
  };

  return (
    <div className="h-screen overflow-hidden flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Records</h2>
          <div className="flex items-center gap-2">
            <button
              className="p-2 hover:bg-red-100 rounded-full text-red-600"
              onClick={() => setIsConfirmDeleteOpen(true)}
              title="Delete all records"
            >
              <Eraser className="h-5 w-5" />
            </button>
            <button
              className="p-2 hover:bg-gray-100 rounded-full"
              onClick={onOpenDataModel}
              title="Data Model"
            >
              <Settings className="h-5 w-5 text-gray-600" />
            </button>
            <button
              className="p-2 hover:bg-gray-100 rounded-full"
              onClick={() => setIsImportOpen(true)}
              title="Import records"
            >
              <Upload className="h-5 w-5 text-gray-600" />
            </button>
          </div>
        </div>
        <div className="relative">
          <input
            type="text"
            placeholder="Search records..."
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {filteredRecords.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Database className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <p>No records yet</p>
            <p className="text-sm">Import a CSV file to get started</p>
          </div>
        ) : (
          filteredRecords.map((record) => {
            const details = Object.entries(record)
              .filter(([key]) => !['id', 'name'].includes(key))
              .map(([key, value]) => `${key}: ${value}`);

            return (
              <div
                key={record.id}
                className={`p-4 cursor-pointer hover:bg-gray-50 ${
                  selectedRecord?.id === record.id ? 'bg-blue-50' : ''
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1" onClick={() => setSelectedRecord(record)}>
                    <h3 className="font-medium text-gray-900">{record.name}</h3>
                    {details.length > 0 && (
                      <div className="mt-1 text-sm text-gray-500">
                        {details.map((detail, index) => (
                          <div key={index} className="truncate">
                            {detail}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => deleteRecord(record.id)}
                    className="p-1 hover:bg-red-100 rounded text-red-600"
                    title="Delete record"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {isImportOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-lg font-medium">Import Records</h4>
              <button
                className="p-2 hover:bg-gray-100 rounded-full"
                onClick={() => setIsImportOpen(false)}
              >
                <X className="h-5 w-5 text-gray-600" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Upload a CSV file with record data.
              <br />
              The CSV must include a 'name' column.
              <br />
              All other columns will be imported as properties.
              <br />
              <br />
              <strong>Note:</strong> For fields containing commas, enclose them in double quotes:
              <br />
              <code className="block bg-gray-50 p-2 rounded mt-1 text-xs">
                name,address<br />
                "Acme Corp","123 Main St, Suite 100"
              </code>
            </p>
            <input
              type="file"
              accept=".csv"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-full file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100"
            />
          </div>
        </div>
      )}

      {isConfirmDeleteOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h4 className="text-lg font-medium mb-4">Delete All Records</h4>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete all records? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                onClick={() => setIsConfirmDeleteOpen(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
                onClick={handleDeleteAll}
              >
                Delete All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};