import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hlqfaokxltssijuhacrz.supabase.co';
const supabaseAnonKey = 'sb_publishable_Gzi08Hc2YQ3Ao-_Ss1dm-w_vo5qo5Ci';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
