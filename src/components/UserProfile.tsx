import React from 'react';
import { Camera, User } from 'lucide-react';
import { useStore } from '../store';
import { supabase } from '../lib/supabase';

export const UserProfile: React.FC = () => {
  const { user, profile, updateProfile } = useStore();
  const [isEditing, setIsEditing] = React.useState(false);
  const [displayName, setDisplayName] = React.useState(profile?.display_name || '');
  const [isUploading, setIsUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const avatarUrl = profile?.custom_avatar_path
    ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/avatars/${profile.custom_avatar_path}`
    : profile?.avatar_url;

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    try {
      setIsUploading(true);
      
      // Upload to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/${crypto.randomUUID()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Update profile with new avatar path
      await updateProfile({
        ...profile,
        custom_avatar_path: filePath,
        avatar_url: null // Clear OAuth avatar URL
      });
    } catch (error) {
      console.error('Error uploading avatar:', error);
      alert('Failed to upload avatar. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    if (!profile) return;
    
    try {
      await updateProfile({
        ...profile,
        display_name: displayName.trim()
      });
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Failed to update profile. Please try again.');
    }
  };

  if (!user) return null;

  return (
    <div className="flex items-center gap-4 p-4 bg-white border-b border-gray-200">
      <div className="relative">
        <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-100">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={profile?.display_name || 'User avatar'}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              <User className="w-6 h-6" />
            </div>
          )}
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="absolute -bottom-1 -right-1 p-1 bg-white rounded-full border border-gray-200 text-gray-600 hover:text-gray-900 hover:border-gray-300 transition-colors"
        >
          <Camera className="w-3 h-3" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      <div className="flex-1">
        {isEditing ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="px-2 py-1 border rounded-md text-sm"
              placeholder="Enter display name"
            />
            <button
              onClick={handleSave}
              className="px-3 py-1 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600"
            >
              Save
            </button>
            <button
              onClick={() => {
                setDisplayName(profile?.display_name || '');
                setIsEditing(false);
              }}
              className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded-md"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {profile?.display_name || user.email}
            </span>
            <button
              onClick={() => setIsEditing(true)}
              className="text-blue-500 hover:text-blue-600 text-sm"
            >
              Edit
            </button>
          </div>
        )}
      </div>
    </div>
  );
};