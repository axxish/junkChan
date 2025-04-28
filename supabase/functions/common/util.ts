import { corsHeaders } from "./cors.ts";
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js";
import { Database } from "../common/database.types.ts";

// Custom error class for HTTP errors
export class HttpError extends Error {
    status: number;
    constructor(message: string, status: number) {
        super(message);
        this.name = "HttpError";
        this.status = status;
    }
}


// --- Helper Functions ---

/**
 * Creates a standardized JSON error response.
 */
export function createErrorResponse(
  message: string,
  status: number,
  logError?: unknown,
): Response {
  if (logError) {
    if (logError instanceof Error) {
      console.error(`${message}: ${logError.message}`);
    } else {
      console.error(`${message}:`, logError);
    }
  } else {
    console.warn(message);
  }
  return new Response(
    JSON.stringify({ error: message }),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: status,
    },
  );
}


/**
 * Initializes Supabase user and service clients.
 * Throws an error if configuration is missing.
 */
export function initializeSupabaseClients(req: Request): {
    supabaseUserClient: SupabaseClient<Database>;
    supabaseServiceClient: SupabaseClient<Database>;
  } {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      throw new Error("Missing Supabase environment variables.");
    }
  
    const supabaseUserClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization")! } },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  
    const supabaseServiceClient = createClient<Database>(
      supabaseUrl,
      supabaseServiceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      },
    );
  
    console.log("Supabase clients initialized.");
    return { supabaseUserClient, supabaseServiceClient };
  }


  /**
 * Authorizes the user based on JWT and checks for a required role.
 * Throws specific errors for authentication/authorization failures.
 */
export async function authorizeUserRole(
    supabaseUserClient: SupabaseClient<Database>,
    supabaseServiceClient: SupabaseClient<Database>,
    requiredRole: string
  ): Promise<void> {
    const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser();
  
    if (userError || !user) {
      const message = "Authentication failed or invalid token.";
      console.warn(message, userError?.message);
      throw new HttpError(message, 401);
    }
    console.log(`User authenticated: ${user.id}`);
  
    const { data: profile, error: profileError } = await supabaseServiceClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
  
    if (profileError) {
      console.error(`Error fetching profile for user ${user.id}:`, profileError);
      let message = "Could not verify user role due to database error.";
      let status = 500;
      if (profileError.code === "PGRST116") {
        message = "User profile not found.";
        status = 404;
      }
      throw new HttpError(message, status);
    }
  
    const userRole = profile.role;
    if (userRole !== requiredRole) {
      const message = `Permission denied. ${requiredRole} role required.`;
      console.warn(
        `Authorization failed: User ${user.id} has role '${userRole}', requires '${requiredRole}'.`,
      );
      throw new HttpError(message, 403);
    }
  
    console.log(`User ${user.id} authorized as ${requiredRole}.`);
  }
  