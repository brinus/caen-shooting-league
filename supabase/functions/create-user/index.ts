// CAEN Shooting League — Edge Function: create-user
// Consente agli admin di creare nuovi account giocatori senza esporre la service_role key
// al frontend.
//
// POST /functions/v1/create-user
// Header: Authorization: Bearer <admin_jwt>
// Body: { username, password, display_name, role?, player_name? }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Client con service_role key (lato server — sicuro)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Verifica che il chiamante sia autenticato e sia admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Controlla ruolo admin
    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single()

    if (callerProfile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden: admin only' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Leggi body
    const { username, password, display_name, role = 'participant', player_name } = await req.json()

    if (!username || !password || !display_name) {
      return new Response(JSON.stringify({ error: 'username, password e display_name sono obbligatori' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!/^[a-z0-9_.-]+$/.test(username)) {
      return new Response(JSON.stringify({ error: 'username può contenere solo lettere minuscole, cifre, underscore, punti e trattini' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Controlla duplicati username
    const { data: existing } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle()

    if (existing) {
      return new Response(JSON.stringify({ error: `Username "${username}" già in uso` }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Crea utente in Supabase Auth (email fittizia: username@csl.local)
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: `${username}@csl.local`,
      password,
      email_confirm: true,
      user_metadata: {
        username,
        display_name,
        role,
        player_name: player_name || null,
      },
      app_metadata: { user_role: role },
    })

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({
      success: true,
      user_id: newUser.user?.id,
      username,
    }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
