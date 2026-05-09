import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

export async function upsertProfile(clerkUserId: string, email: string, name?: string) {
  const { error } = await supabase
    .from('profiles')
    .upsert({ clerk_user_id: clerkUserId, email, name }, { onConflict: 'clerk_user_id' })
  if (error) throw error
}
