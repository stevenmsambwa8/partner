import { createClient } from "https://esm.sh/@supabase/supabase-js@2";


// Create a single instance and store it globally
if (!window.supabaseClient) {
    const supabaseUrl = 'https://xaudpqhyyxburjazfips.supabase.co'
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhhdWRwcWh5eXhidXJqYXpmaXBzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzMTY1NDUsImV4cCI6MjA3Nzg5MjU0NX0.LxRbfT0TsxJ38dwTQyKhn_Hi1cuZXZ6tpE04YPatGkQ'
    
    window.supabaseClient = createClient(supabaseUrl, supabaseKey)
    console.log('Supabase client initialized')
}

export const supabase = window.supabaseClient