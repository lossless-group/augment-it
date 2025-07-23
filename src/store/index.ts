import { create } from 'zustand';
import type { Record, PromptTemplate, AIModel, AIModelConfig, QueryResponse, UserProfile } from '../types';
import { supabase } from '../lib/supabase';
import type { ComputedProperty } from '../types';
import type { User } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

interface Highlight {
  id: string;
  response_id: string;
  content: string;
  highlights: Array<{ start: number; end: number; color: string }>;
  section_title?: string;
  section_id?: string;
  model_id: string;
  created_at: string;
  record_id: string;
  record_name: string;
}

interface AppState {
  records: Record[];
  selectedRecord: Record | null;
  promptTemplates: PromptTemplate[];
  selectedTemplate: PromptTemplate | null;
  aiModels: AIModel[];
  user: User | null;
  profile: UserProfile | null;
  computedProperties: ComputedProperty[];
  aiModelConfigs: AIModelConfig[];
  queryResponses: QueryResponse[];
  highlights: Highlight[];
  setSelectedRecord: (record: Record | null) => void;
  setSelectedTemplate: (template: PromptTemplate | null) => void;
  addPromptTemplate: (template: PromptTemplate) => Promise<void>;
  updatePromptSection: (templateId: string, sectionId: string, model: AIModel) => void;
  addRecords: (newRecords: Record[]) => Promise<void>;
  deleteRecord: (recordId: string) => Promise<void>;
  deleteAllRecords: () => Promise<void>;
  loadInitialData: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  loadHighlights: () => Promise<void>;
  addHighlight: (highlight: Highlight) => Promise<void>;
  deleteHighlight: (highlightId: string) => Promise<void>;
  deleteHighlightGroup: (recordId: string, sectionTitle: string) => Promise<void>;
  generateAIResponse: (sectionId: string, modelId: string, prompt: string, sectionTitle?: string) => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  records: [],
  selectedRecord: null,
  promptTemplates: [],
  selectedTemplate: null,
  user: null,
  profile: null,
  computedProperties: [],
  aiModelConfigs: [],
  aiModels: [],
  queryResponses: [],
  highlights: [],

  signIn: async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (error) throw error;
      set({ user: data.user });
      await get().loadInitialData();
    } catch (error) {
      console.error('Error signing in:', error);
      throw error;
    }
  },

  signUp: async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password
      });
      if (error) throw error;
      set({ user: data.user });
    } catch (error) {
      console.error('Error signing up:', error);
      throw error;
    }
  },

  signOut: async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      set({ 
        user: null, 
        profile: null,
        records: [],
        selectedRecord: null,
        promptTemplates: [],
        selectedTemplate: null,
        aiModelConfigs: [],
        queryResponses: [],
        highlights: []
      });
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  },

  resetPassword: async (email) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
    } catch (error) {
      console.error('Error resetting password:', error);
      throw error;
    }
  },

  updatePassword: async (password) => {
    try {
      const { error } = await supabase.auth.updateUser({
        password
      });
      if (error) throw error;
    } catch (error) {
      console.error('Error updating password:', error);
      throw error;
    }
  },

  setSelectedRecord: (record) => set({ selectedRecord: record }),
  setSelectedTemplate: (template) => set({ selectedTemplate: template }),

  addPromptTemplate: async (template) => {
    try {
      const { error } = await supabase
        .from('prompt_templates')
        .insert([{
          id: template.id,
          title: template.title,
          description: template.description,
          mdx_content: template.mdxContent,
          sections: template.sections || [{
            id: crypto.randomUUID(),
            title: template.title,
            content: template.mdxContent
          }]
        }]);

      if (error) throw error;

      set(state => ({
        promptTemplates: [...state.promptTemplates, template]
      }));
    } catch (error) {
      console.error('Error adding prompt template:', error);
      throw error;
    }
  },

  updatePromptSection: (templateId, sectionId, model) =>
    set((state) => ({
      promptTemplates: state.promptTemplates.map((template) =>
        template.id === templateId
          ? {
              ...template,
              sections: template.sections.map((section) =>
                section.id === sectionId
                  ? { ...section, selectedModel: model }
                  : section
              ),
            }
          : template
      ),
    })),

  addRecords: async (newRecords) => {
    try {
      const { error } = await supabase
        .from('organizations')
        .insert(
          newRecords.map(record => ({
            name: record.name,
            properties: Object.entries(record)
              .filter(([key]) => key !== 'id' && key !== 'name')
              .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {})
          }))
        );

      if (error) throw error;

      const { data: organizations } = await supabase
        .from('organizations')
        .select('*')
        .order('created_at', { ascending: true });

      set({
        records: organizations?.map(org => ({
          id: org.id,
          name: org.name,
          ...org.properties
        })) || []
      });
    } catch (error) {
      console.error('Error handling records:', error);
      throw error;
    }
  },

  deleteRecord: async (recordId) => {
    try {
      const { error } = await supabase
        .from('organizations')
        .delete()
        .eq('id', recordId);

      if (error) throw error;

      set((state) => ({
        records: state.records.filter((r) => r.id !== recordId),
        selectedRecord: state.selectedRecord?.id === recordId ? null : state.selectedRecord
      }));
    } catch (error) {
      console.error('Error deleting record:', error);
      throw error;
    }
  },

  deleteAllRecords: async () => {
    try {
      const { error } = await supabase.rpc('clear_all_data');
      
      if (error) throw error;

      set({
        records: [],
        selectedRecord: null
      });
    } catch (error) {
      console.error('Error deleting all records:', error);
      throw error;
    }
  },

  loadInitialData: async () => {
    const user = get().user;
    if (!user) {
      console.warn('No user found, skipping initial data load');
      return;
    }

    try {
      const [
        { data: organizations, error: orgError },
        { data: templates, error: templateError },
        { data: configs, error: configError },
        { data: profile, error: profileError },
        { data: highlights, error: highlightError }
      ] = await Promise.all([
        supabase.from('organizations').select('*').order('created_at', { ascending: true }),
        supabase.from('prompt_templates').select('*'),
        supabase.from('ai_model_configs').select('*').eq('user_id', user.id),
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        supabase.from('response_highlights').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      ]);

      if (orgError) throw orgError;
      if (templateError) throw templateError;
      if (configError) throw configError;
      if (profileError) throw profileError;
      if (highlightError) throw highlightError;

      set({
        records: organizations?.map(org => ({
          id: org.id,
          name: org.name,
          ...org.properties
        })) || [],
        promptTemplates: templates?.map(template => ({
          id: template.id,
          title: template.title,
          description: template.description,
          mdxContent: template.mdx_content,
          sections: template.sections || [{
            id: crypto.randomUUID(),
            title: template.title,
            content: template.mdx_content
          }]
        })) || [],
        aiModelConfigs: configs?.map(c => ({
          modelId: c.model_id,
          apiKey: c.api_key
        })) || [],
        profile: profile || null,
        highlights: highlights || []
      });
    } catch (error) {
      console.error('Error loading initial data:', error);
      throw error;
    }
  },

  loadHighlights: async () => {
    const user = get().user;
    if (!user) {
      console.warn('No user found, skipping highlights load');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('response_highlights')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      set({ highlights: data });
    } catch (error) {
      console.error('Error loading highlights:', error);
      throw error;
    }
  },

  generateAIResponse: async (sectionId, modelId, prompt, sectionTitle) => {
    const { aiModelConfigs } = get();
    const config = aiModelConfigs.find(c => c.modelId === modelId);
    
    if (!config?.apiKey) {
      throw new Error('API key not configured');
    }

    const responseId = crypto.randomUUID();
    
    // Add initial response to state
    set(state => ({
      queryResponses: [{
        id: responseId,
        promptSectionId: sectionId,
        modelId,
        content: '',
        timestamp: new Date().toISOString(),
        status: 'connecting',
        sectionTitle
      }, ...state.queryResponses]
    }));

    try {
      // Update status to pending
      set(state => ({
        queryResponses: state.queryResponses.map(r => 
          r.id === responseId
            ? { ...r, status: 'pending', timestamp: new Date().toISOString() }
            : r
        )
      }));

      let content;

      switch (modelId) {
        case 'gpt4':
          const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${config.apiKey}`
            },
            body: JSON.stringify({
              model: 'gpt-4',
              messages: [{ role: 'user', content: prompt }],
              response_format: { type: 'json_object' }
            })
          });

          if (!gptResponse.ok) {
            const error = await gptResponse.json();
            throw new Error(`GPT-4 API error: ${error.error?.message || gptResponse.statusText}`);
          }

          const gptData = await gptResponse.json();
          content = gptData.choices[0]?.message?.content;
          break;

        case 'claude':
          const anthropic = new Anthropic({
            apiKey: config.apiKey
          });

          const claudeResponse = await anthropic.messages.create({
            model: "claude-3-sonnet-20240229",
            max_tokens: 1024,
            messages: [{ role: "user", content: prompt }]
          });

          content = claudeResponse.content[0].text;
          break;

        case 'perplexity':
          const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${config.apiKey}`
            },
            body: JSON.stringify({
              model: 'sonar-medium-chat',  // Updated to current model name
              messages: [
                { role: 'system', content: 'You are a helpful AI assistant. Provide clear and accurate responses.' },
                { role: 'user', content: prompt }
              ],
              temperature: 0.7,
              max_tokens: 1024,
              top_p: 0.9,
              presence_penalty: 0.1,
              frequency_penalty: 0.1
            })
          });
          
          if (!perplexityResponse.ok) {
            const error = await perplexityResponse.json();
            throw new Error(`Perplexity API error: ${error.error?.message || perplexityResponse.statusText}`);
          }
          
          const perplexityData = await perplexityResponse.json();
          
          // Extract content from Perplexity response
          if (!perplexityData.choices?.[0]?.message?.content) {
            throw new Error('Invalid response format from Perplexity API');
          }
          
          content = perplexityData.choices[0].message.content;

          // Format citations if they exist
          if (perplexityData.citations?.length > 0) {
            const citationsMarkdown = perplexityData.citations
              .map((url: string, index: number) => `${index + 1}. [${new URL(url).hostname}](${url})`)
              .join('\n');
            content = `${content}\n\n## References\n\n${citationsMarkdown}`;
          }
          break;

        default:
          throw new Error('Unsupported AI model');
      }

      if (!content) {
        throw new Error('No content received from API');
      }

      // Update with successful response
      set(state => ({
        queryResponses: state.queryResponses.map(r => 
          r.id === responseId
            ? {
                ...r,
                content,
                status: 'completed',
                timestamp: new Date().toISOString()
              }
            : r
        )
      }));
    } catch (error) {
      // Update with error state
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error(`AI Response Error (${modelId}):`, errorMessage);
      
      set(state => ({
        queryResponses: state.queryResponses.map(r => 
          r.id === responseId
            ? {
                ...r,
                status: 'error',
                error: errorMessage,
                timestamp: new Date().toISOString()
              }
            : r
        )
      }));
      throw error;
    }
  },

  addHighlight: async (highlight) => {
    try {
      const { error } = await supabase
        .from('response_highlights')
        .insert([highlight]);

      if (error) throw error;

      set(state => ({
        highlights: [highlight, ...state.highlights]
      }));
    } catch (error) {
      console.error('Error adding highlight:', error);
      throw error;
    }
  },

  deleteHighlight: async (highlightId) => {
    try {
      const { error } = await supabase
        .from('response_highlights')
        .delete()
        .eq('id', highlightId);

      if (error) throw error;

      set(state => ({
        highlights: state.highlights.filter(h => h.id !== highlightId)
      }));
    } catch (error) {
      console.error('Error deleting highlight:', error);
      throw error;
    }
  },

  deleteHighlightGroup: async (recordId, sectionTitle) => {
    try {
      const { error } = await supabase
        .from('response_highlights')
        .delete()
        .eq('record_id', recordId)
        .eq('section_title', sectionTitle);

      if (error) throw error;

      set(state => ({
        highlights: state.highlights.filter(
          h => !(h.record_id === recordId && h.section_title === sectionTitle)
        )
      }));
    } catch (error) {
      console.error('Error deleting highlight group:', error);
      throw error;
    }
  },

  updateAIModelConfig: async (config) => {
    const user = get().user;
    if (!user) {
      throw new Error('User must be logged in to update API configuration');
    }

    try {
      // First check if a config already exists
      const { data: existingConfig, error: fetchError } = await supabase
        .from('ai_model_configs')
        .select('*')
        .eq('user_id', user.id)
        .eq('model_id', config.modelId)
        .maybeSingle();

      if (fetchError) throw fetchError;

      let error;
      if (existingConfig) {
        // Update existing config
        const { error: updateError } = await supabase
          .from('ai_model_configs')
          .update({
            api_key: config.apiKey,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id)
          .eq('model_id', config.modelId);
        error = updateError;
      } else {
        // Insert new config
        const { error: insertError } = await supabase
          .from('ai_model_configs')
          .insert({
            user_id: user.id,
            model_id: config.modelId,
            api_key: config.apiKey,
            updated_at: new Date().toISOString()
          });
        error = insertError;
      }

      if (error) throw error;

      // Update local state
      set((state) => ({
        aiModelConfigs: [
          ...state.aiModelConfigs.filter(c => c.modelId !== config.modelId),
          config
        ]
      }));
    } catch (error) {
      console.error('Error updating AI model config:', error);
      throw error;
    }
  }
}));