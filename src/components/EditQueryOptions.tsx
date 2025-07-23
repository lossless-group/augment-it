import React from 'react';
import { X, Check, Pencil } from 'lucide-react';
import { aiModelIcons } from '../assets/icons';
import { useStore } from '../store';

interface EditQueryOptionsProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EditQueryOptions: React.FC<EditQueryOptionsProps> = ({ isOpen, onClose }) => {
  const { aiModelConfigs, updateAIModelConfig } = useStore();
  const [configs, setConfigs] = React.useState<Record<string, string>>({});
  const [editStates, setEditStates] = React.useState<Record<string, boolean>>({});
  const [successStates, setSuccessStates] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    // Initialize form with existing configs
    const initialConfigs = Object.fromEntries(
      Object.values(aiModelIcons).map(model => [
        model.id,
        aiModelConfigs.find(c => c.modelId === model.id)?.apiKey || ''
      ])
    );
    setConfigs(initialConfigs);
    
    // Initialize edit states based on whether configs exist
    const initialEditStates = Object.fromEntries(
      Object.values(aiModelIcons).map(model => [
        model.id,
        !aiModelConfigs.find(c => c.modelId === model.id)?.apiKey
      ])
    );
    setEditStates(initialEditStates);
  }, [aiModelConfigs]);

  const handleEdit = (modelId: string) => {
    setEditStates(prev => ({ ...prev, [modelId]: true }));
    setSuccessStates(prev => ({ ...prev, [modelId]: false }));
  };

  const handleSave = async (modelId: string, apiKey: string) => {
    try {
      await updateAIModelConfig({ modelId, apiKey });
      // Update local state
      setConfigs(prev => ({ ...prev, [modelId]: apiKey }));
      setEditStates(prev => ({ ...prev, [modelId]: false }));
      setSuccessStates(prev => ({ ...prev, [modelId]: true }));
    } catch (error) {
      console.error('Error saving API key:', error);
      alert('Failed to save API key. Please try again.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-[500px] max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">Configure AI Models</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="space-y-6">
          {Object.values(aiModelIcons).map(model => (
            <div key={model.id} className="p-4 border rounded-lg">
              <div className="flex items-center gap-3 mb-4">
                <img
                  src={model.url}
                  alt={model.name}
                  className="w-8 h-8 object-contain"
                />
                <h3 className="font-medium text-gray-900">{model.name}</h3>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor={`apiKey-${model.id}`}
                  className="block text-sm font-medium text-gray-700"
                >
                  API Key
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    id={`apiKey-${model.id}`}
                    value={configs[model.id] || ''}
                    onChange={(e) => setConfigs(prev => ({
                      ...prev,
                      [model.id]: e.target.value
                    }))}
                    disabled={!editStates[model.id]}
                    className={`flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      !editStates[model.id] ? 'bg-gray-50' : ''
                    }`}
                    placeholder={`Enter ${model.name} API key`}
                  />
                  {editStates[model.id] ? (
                    <button
                      onClick={() => handleSave(model.id, configs[model.id] || '')}
                      className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
                    >
                      <Check className="w-4 h-4" />
                      Save
                    </button>
                  ) : (
                    <button
                      onClick={() => handleEdit(model.id)}
                      className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                        successStates[model.id]
                          ? 'bg-green-500 hover:bg-green-600 text-white'
                          : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                      }`}
                    >
                      <Pencil className="w-4 h-4" />
                      Edit
                    </button>
                  )}
                </div>
                {successStates[model.id] && (
                  <p className="text-sm text-green-600 flex items-center gap-1 mt-1">
                    <Check className="w-4 h-4" />
                    API key saved successfully
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};