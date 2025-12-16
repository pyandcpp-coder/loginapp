import { createClient } from '@supabase/supabase-js';
import 'react-native-get-random-values';

const SUPABASE_URL = "https://trnvmbrtqtfngwigasyu.supabase.co";
const SUPABASE_KEY = "sb_secret_QggqZN0YsndUCi0k0dVVAw_v7ccebu5";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
