import React, { useState } from 'react';
import { MessageSquare, Trash2, Eye, Code, Calendar, Zap, Edit, ChevronDown, ChevronUp, ExternalLink, Mail, Building, MapPin, DollarSign, Clock } from 'lucide-react';
import type { Record } from '@module-federation-vite/utils';

export interface RecordCardProps {
  record: Record;
  onDelete?: (id: string) => void;
  onEdit?: (record: Record) => void;
  onSelect?: (record: Record) => void;
  isSelected?: boolean;
  isProcessing?: boolean;
  variant?: 'collector' | 'reviewer';
}

export const RecordCard: React.FC<RecordCardProps> = ({ 
  record, 
  onDelete, 
  onEdit, 
  onSelect, 
  isSelected = false, 
  isProcessing = false,
  variant = 'collector'
}) => {
  const [isAICollapsed, setIsAICollapsed] = useState(true);
  const [collapsedFields, setCollapsedFields] = useState<Record<string, boolean>>(() => {
    // Initialize with all long fields collapsed
    const initialState: Record<string, boolean> = {};
    Object.entries(record).forEach(([key, value]) => {
      if (value && value.toString().length > 100) {
        initialState[key] = true;
      }
    });
    return initialState;
  });

  const toggleField = (key: string) => {
    setCollapsedFields(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const formatValue = (key: string, value: any) => {
    if (value === null || value === undefined) return 'N/A';
    
    // Format numbers as currency if they contain 'revenue', 'price', 'cost', etc.
    if (typeof value === 'number' && 
        (key.toLowerCase().includes('revenue') || 
         key.toLowerCase().includes('price') || 
         key.toLowerCase().includes('cost'))) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value);
    }

    // Format dates
    if (value instanceof Date || (typeof value === 'string' && !isNaN(Date.parse(value)))) {
      return new Date(value).toLocaleDateString();
    }

    return value.toString();
  };

  const isLongValue = (value: any) => {
    return value && value.toString().length > 100;
  };

  const renderValue = (key: string, value: any) => {
    const formattedValue = formatValue(key, value);
    if (!isLongValue(value)) {
      return <span className="font-medium text-gray-900">{formattedValue}</span>;
    }

    return (
      <div className="flex-1">
        <div className="flex items-start gap-2">
          <div className={`font-medium text-gray-900 ${collapsedFields[key] ? 'line-clamp-2' : ''}`}>
            {formattedValue}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleField(key);
            }}
            className="text-white bg-gray-500 hover:bg-gray-700 rounded-full p-1 flex-shrink-0 transition-colors mt-0.5"
          >
            {collapsedFields[key] ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>
    );
  };

  const getIndustryColor = (industry?: string) => {
    const colors = {
      'technology': variant === 'collector' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-purple-100 text-purple-800',
      'software': variant === 'collector' ? 'bg-purple-50 border-purple-200 text-purple-700' : 'bg-indigo-100 text-indigo-800',
      'healthcare': variant === 'collector' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-red-100 text-red-800',
      'finance': variant === 'collector' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-green-100 text-green-800',
      'energy': variant === 'collector' ? 'bg-yellow-50 border-yellow-200 text-yellow-700' : 'bg-orange-100 text-orange-800',
      'default': variant === 'collector' ? 'bg-gray-50 border-gray-200 text-gray-700' : 'bg-gray-100 text-gray-800'
    };
    return colors[industry?.toLowerCase() || 'default'] || colors.default;
  };

  const getSizeColor = (size?: string) => {
    const colors = variant === 'collector' ? {
      'small': 'bg-green-50 border-green-200 text-green-700',
      'medium': 'bg-yellow-50 border-yellow-200 text-yellow-700',
      'large': 'bg-red-50 border-red-200 text-red-700',
      'default': 'bg-gray-50 border-gray-200 text-gray-700'
    } : {
      'small': 'bg-green-100 text-green-800',
      'medium': 'bg-yellow-100 text-yellow-800',
      'large': 'bg-blue-100 text-blue-800',
      'default': 'bg-gray-100 text-gray-800'
    };
    return colors[size?.toLowerCase() || 'default'] || colors.default;
  };

  // Get primary fields (name, industry, size, location)
  const getPrimaryFields = () => {
    return ['name', 'industry', 'size', 'location'].filter(field => record[field]);
  };

  // Get secondary fields (everything else except AI results)
  const getSecondaryFields = () => {
    return Object.entries(record).filter(([key]) => 
      !['name', 'industry', 'size', 'location', 'augmentationResults', 'id'].includes(key) &&
      record[key] !== null && record[key] !== undefined
    );
  };

  // Helper function to get icon for field type (collector variant only)
  const getFieldIcon = (fieldName: string) => {
    const iconMap: Record<string, React.ComponentType> = {
      'name': Building,
      'industry': Building,
      'size': Building,
      'location': MapPin,
      'annual_revenue': DollarSign,
      'revenue': DollarSign,
      'website': ExternalLink,
      'contact_email': Mail,
      'email': Mail,
      'phone': Mail,
      'address': MapPin,
      'city': MapPin,
      'state': MapPin,
      'country': MapPin,
      'employees': Building,
      'founded': Clock,
      'description': Building,
    };
    
    return iconMap[fieldName] || iconMap[fieldName.toLowerCase()] || Building;
  };

  const cardClasses = variant === 'collector'
    ? `bg-white rounded-xl border-2 transition-all duration-200 cursor-pointer hover:shadow-lg ${
        isSelected ? 'border-blue-500 shadow-lg' : 'border-gray-200 hover:border-gray-300'
      } ${isProcessing ? 'opacity-75' : ''}`
    : `bg-white rounded-xl border border-gray-200 p-4 transition-all duration-200 ${
        isSelected ? 'ring-2 ring-purple-500' : 'hover:shadow-md'
      } ${isProcessing ? 'opacity-75' : ''}`;

  return (
    <div 
      className={cardClasses}
      onClick={() => onSelect?.(record)}
    >
      <div className={variant === 'collector' ? 'p-6 border-b border-gray-100' : ''}>
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 truncate">
              {record.name || 'Unnamed Record'}
            </h3>
            {record.location && (
              <p className="text-sm text-gray-600 truncate">
                {record.location}
              </p>
            )}
          </div>

          {variant === 'collector' && onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(record.id);
              }}
              className="ml-3 p-2 text-white bg-gray-400 hover:bg-red-500 rounded-lg transition-colors"
              title="Delete record"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Primary Fields (Tags) */}
        <div className="flex flex-wrap gap-2 mb-3">
          {record.industry && (
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
              variant === 'collector' ? 'border ' : ''
            }${getIndustryColor(record.industry)}`}>
              {record.industry}
            </span>
          )}
          {record.size && (
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
              variant === 'collector' ? 'border ' : ''
            }${getSizeColor(record.size)}`}>
              {record.size}
            </span>
          )}
        </div>

        {/* Secondary Fields */}
        {variant === 'collector' ? (
          <div className="space-y-2">
            {getSecondaryFields().map(([field, value]) => {
              const IconComponent = getFieldIcon(field);
              return (
                <div key={field} className="flex items-center gap-2 text-sm text-gray-600">
                  <IconComponent className="w-4 h-4 flex-shrink-0" />
                  <span className="font-medium capitalize">{field.replace(/_/g, ' ')}:</span>
                  {renderValue(field, value)}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2 mb-3">
            {getSecondaryFields().map(([key, value]) => (
              <div key={key} className="flex justify-between text-sm">
                <span className="text-gray-600 capitalize mr-2">{key.replace(/_/g, ' ')}:</span>
                {renderValue(key, value)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AI Enhanced Data Section */}
      {record.augmentationResults?.customProperties && 
       Object.keys(record.augmentationResults.customProperties).length > 0 && 
       variant === 'reviewer' && (
        <>
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-2 text-gray-500 font-medium">AI Enhanced Data</span>
            </div>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3">
            <div className="space-y-0">
              {Object.entries(record.augmentationResults.customProperties).map(([key, value], index) => (
                <div key={key}>
                  <div className="flex justify-between text-xs py-1">
                    <span className="text-green-700 font-medium capitalize mr-2">{key.replace(/_/g, ' ')}:</span>
                    {renderValue(key, value)}
                  </div>
                  {index < Object.entries(record.augmentationResults.customProperties).length - 1 && (
                    <div className="border-b border-green-200 my-1"></div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Augmentation Status */}
      {record.augmentationResults && variant === 'reviewer' && (
        <div className="pt-2 border-t border-gray-100">
          <button
            onClick={() => setIsAICollapsed(!isAICollapsed)}
            className="flex items-center gap-2 w-full text-left bg-white hover:bg-white border border-purple-200 rounded-lg p-2 transition-colors"
          >
            <Zap className="w-4 h-4 text-purple-600" />
            <span className="text-xs text-purple-600 font-medium">
              AI Enhanced
            </span>
            {isAICollapsed ? (
              <ChevronDown className="w-4 h-4 text-purple-600 ml-auto" />
            ) : (
              <ChevronUp className="w-4 h-4 text-purple-600 ml-auto" />
            )}
          </button>
          
          {/* AI Results Summary */}
          {!isAICollapsed && record.augmentationResults.result && (
            <div className="mt-2 p-3 bg-purple-50 border border-purple-200 rounded-lg">
              <h4 className="text-xs font-medium text-purple-700 mb-2">AI Analysis Summary:</h4>
              <div className="text-xs text-purple-800 max-h-32 overflow-y-auto">
                <pre className="whitespace-pre-wrap font-sans">{record.augmentationResults.result}</pre>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Processing Indicator */}
      {isProcessing && (
        <div className="absolute inset-0 bg-white bg-opacity-75 rounded-xl flex items-center justify-center">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-purple-600 font-medium">Processing...</span>
          </div>
        </div>
      )}
    </div>
  );
}; 