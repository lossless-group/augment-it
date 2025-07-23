export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          avatar_url: string | null;
          custom_avatar_path: string | null;
          provider_data: any;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          avatar_url?: string | null;
          custom_avatar_path?: string | null;
          provider_data?: any;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          custom_avatar_path?: string | null;
          provider_data?: any;
          updated_at?: string;
        };
      };
      // Add other table definitions as needed
    };
  };
}