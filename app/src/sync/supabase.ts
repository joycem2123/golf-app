import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

/** Public project settings: these are meant to ship inside the app. */
export const SUPABASE_URL = 'https://iuimtflswquajijwwpfp.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_RRmHLcxdNcylmfpwLC9VwA_lYlAHF4T';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});
