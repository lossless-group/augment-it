import React from 'react';
import { X, Plus, Code2, Trash2 } from 'lucide-react';
import { useStore } from '../store';
import type { ComputedProperty } from '../types';

interface DataModelModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DataModelModal: React.FC<DataModelModalProps> = ({ isOpen, onClose }) => {
  const { computedProperties, addComputedProperty, removeComputedProperty, records } = useStore();
  const [newPropertyName, setNewPropertyName] = React.useState('');
  const [newPropertyExpression, setNewPropertyExpression] = React.useState('');
  const [newPropertyDescription, setNewPropertyDescription] = React.useState('');
  const [isAddingProperty, setIsAddingProperty] = React.useState(false);

  const handleAddProperty = () => {
    if (!newPropertyName || !newPropertyExpression) {
      alert('Please fill in all required fields');
      return;
    }

    addComputedProperty({
      name: newPropertyName,
      expression: newPropertyExpression,
      description: newPropertyDescription
    });

    setNewPropertyName('');
    setNewPropertyExpression('');
    setNewPropertyDescription('');
    setIsAddingProperty(false);
  };

  // Get all unique property names from records
  const propertyNames = React.useMemo(() => {
    const names = new Set<string>();
    records.forEach(record => {
      Object.keys(record).forEach(key => {
        if (key !== 'id' && key !== 'name') {
          names.add(key);
        }
      });
    });
    return Array.from(names);
  }, [records]);

  // Get example data from the first record
  const exampleRecord = records[0] || {};

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-[1000px] max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <Code2 className="h-6 w-6 text-blue-500" />
            <h2 className="text-xl font-semibold">Data Model</h2>
          </div>
          <button
            className="p-2 hover:bg-gray-100 rounded-full"
            onClick={onClose}
          >
            <X className="h-5 w-5 text-gray-600" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-[400px]">
          {/* Properties Table */}
          <div className="mb-8">
            <h3 className="text-lg font-medium mb-4">Available Properties</h3>
            <div className="border rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Property Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Template Syntax
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Example Value
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {propertyNames.map((propertyName) => (
                    <tr key={propertyName}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {propertyName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 font-mono">
                        {`{{record.${propertyName}}}`}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {String(exampleRecord[propertyName] || '')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Computed Properties Section */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Computed Properties</h3>
              <button
                className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"
                onClick={() => setIsAddingProperty(true)}
              >
                <Plus className="h-4 w-4" />
                Add Computed Property
              </button>
            </div>

            {computedProperties.length === 0 && !isAddingProperty ? (
              <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                <Code2 className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <p>No computed properties defined</p>
                <p className="text-sm">Add computed properties to create dynamic values from existing properties</p>
              </div>
            ) : (
              <div className="space-y-4">
                {computedProperties.map((property) => (
                  <div
                    key={property.name}
                    className="p-4 border rounded-lg bg-gray-50"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium text-gray-900">{property.name}</h4>
                        <p className="text-sm text-gray-600 mt-1">{property.description}</p>
                        <code className="text-sm bg-white px-2 py-1 rounded mt-2 block">
                          {property.expression}
                        </code>
                      </div>
                      <button
                        onClick={() => removeComputedProperty(property.name)}
                        className="p-1 hover:bg-red-100 rounded text-red-600"
                        title="Remove property"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}

                {isAddingProperty && (
                  <div className="p-4 border rounded-lg bg-white">
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Property Name
                        </label>
                        <input
                          type="text"
                          value={newPropertyName}
                          onChange={(e) => setNewPropertyName(e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="e.g., fullAddress"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          JavaScript Expression
                        </label>
                        <textarea
                          value={newPropertyExpression}
                          onChange={(e) => setNewPropertyExpression(e.target.value)}
                          className="w-full h-24 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                          placeholder="e.g., `${record.city}, ${record.country}`"
                        />
                        <p className="text-sm text-gray-500 mt-1">
                          Use template literals and access record properties directly
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Description
                        </label>
                        <input
                          type="text"
                          value={newPropertyDescription}
                          onChange={(e) => setNewPropertyDescription(e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="e.g., Full address combining city and country"
                        />
                      </div>
                      <div className="flex justify-end gap-3 pt-2">
                        <button
                          onClick={() => setIsAddingProperty(false)}
                          className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleAddProperty}
                          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                        >
                          Add Property
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};