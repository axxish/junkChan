// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

import { corsHeaders, handleCors } from "../common/cors.ts";
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js";
import { Database } from "../common/database.types.ts";

console.log("Creating a board!");

// supabase/functions/create-board/index.ts

console.log(`Function "create-board" is ready!`);

Deno.serve(async (req: Request) => {
  console.log(`Received request: ${req.method} ${req.url}`);

  // --- CORS Preflight Handling ---
  // If it's an OPTIONS request, handle it specifically
  const corsResponse = handleCors(req);

  if (corsResponse) {
    console.log("Handling CORS preflight request");
    return corsResponse; // Return the CORS response immediately
  }

  // --- Handle Actual Request (e.g., POST) ---
  // (We'll add the POST logic next)

  // For now, just return a simple success message
  if (req.method !== "POST") {
    console.warn(`Method ${req.method} not allowed.`);
    return new Response(
      JSON.stringify({ error: "Method Not Allowed" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 405,
      },
    );
  }

  // --- Supabase Client Initialization ---
  // Initialize the Supabase client with environment variables
  let supabaseUserClient: SupabaseClient<Database>;
  let supabaseServiceClient: SupabaseClient<Database>;

  try {
    // Get Supabase connection details from environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      console.error("Missing Supabase environment variables.");
      throw new Error("Server configuration error."); // Throw to be caught below
    }

    // Client 1: Acts on behalf of the user making the request.
    // It uses the request's 'Authorization' header to identify the user.
    // Needed for `auth.getUser()` to check WHO is calling.
    supabaseUserClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization")! } },
      auth: {
        // Don't automatically refresh token or persist session in edge functions
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });

    // Client 2: Acts with elevated privileges using the Service Role Key.
    // This client bypasses Row Level Security (RLS).
    // Needed for reading roles (potentially restricted by RLS) and writing to tables (if restricted).
    supabaseServiceClient = createClient<Database>(
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
  } catch (configError) {
    console.error("Initialization error:", configError);
    return new Response(
      JSON.stringify({ error: "Internal Server Configuration Error" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }

  console.log("Supabase clients initialized.");

  // --- Step 6: Input Parsing and Validation ---
  // Declare variables to hold the parsed data.
  let short_name: string | null = null;
  let name: string | null = null;
  let description: string | null = null;

  try {
    // Attempt to parse the incoming request body as JSON.
    const requestPayload = await req.json();
    console.log("request payload:", requestPayload);

    // Extract expected fields from the payload.
    short_name = requestPayload.short_name;
    name = requestPayload.name;
    description = requestPayload.description || null; // Default optional field to null

    // Perform validation checks. Throw an error if validation fails.
    if (
      !short_name || !name || typeof short_name !== "string" ||
      typeof name !== "string"
    ) {
      throw new Error(
        "Missing or invalid required string fields: short_name, name",
      );
    }
    if (description && typeof description !== "string") {
      throw new Error(
        "Invalid description field type (must be string or null)",
      );
    }
    // Specific format/length validation
    if (
      !/^[a-z0-9_]+$/.test(short_name) || short_name.length < 1 ||
      short_name.length > 10
    ) {
      throw new Error(
        "Short name must be 1-10 lowercase letters, numbers, or underscores.",
      );
    }
    if (name.length < 1 || name.length > 100) {
      throw new Error("Name must be between 1 and 100 characters.");
    }
    if (description && description.length > 500) {
      throw new Error("Description cannot exceed 500 characters.");
    }

    console.log("Input validation passed.");
  } catch (error) {
    let errorMessage = "Internal Server Configuration Error";
    if (error instanceof Error) {
      console.error("Initialization error:", error.message);
      errorMessage = error.message; // Use the actual error message if available
    } else {
      console.error("Unknown initialization error:", error);
    }
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
  // --- Authorization Logic ---

  try {
    // Use the user-context client to verify the JWT from the Authorization header.
    const { data: { user }, error: userError } = await supabaseUserClient.auth
      .getUser();

    // Handle cases where the token is invalid, expired, or missing.
    if (userError || !user) {
      console.warn(
        "Auth error or no user found for token:",
        userError?.message,
      );
      return new Response(
        JSON.stringify({ error: "Authentication failed or invalid token." }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        }, // 401 Unauthorized
      );
    }
    console.log(`User authenticated: ${user.id}`);

    // Fetch the user's profile using the Service Client (to bypass potential RLS).
    // Use the User ID obtained from the verified JWT.
    const { data: profile, error: profileError } = await supabaseServiceClient
      .from("profiles") // Typed table access
      .select("role") // Typed column access
      .eq("id", user.id)
      .single();

    // Handle errors fetching the profile (e.g., network issue, profile doesn't exist).
    if (profileError) {
      console.error(
        `Error fetching profile for user ${user.id}:`,
        profileError,
      );
      // PGRST116 code indicates row not found
      if (profileError.code === "PGRST116") {
        return new Response(
          JSON.stringify({ error: "User profile not found." }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 404,
          }, // 404 Not Found is appropriate here
        );
      }
      // For other database errors during profile fetch
      return new Response(
        JSON.stringify({
          error: "Could not verify user role due to database error.",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        },
      );
    }

    // Check if the fetched profile role is 'admin'.
    const userRole = profile.role; // Type deduced from generated types
    if (userRole !== "admin") {
      console.warn(
        `Authorization failed: User ${user.id} has role '${userRole}', requires 'admin'.`,
      );
      return new Response(
        JSON.stringify({ error: "Permission denied. Admin role required." }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        }, // 403 Forbidden
      );
    }
    // If we reach here, the user is an authenticated admin.
    console.log(`User ${user.id} authorized as admin.`);
  } catch (authError) {
    // Catch any unexpected errors during the authorization process.
    let errorMessage = "An error occurred during authorization.";
    // Check if it's an Error to safely access the message.
    if (authError instanceof Error) {
      console.error(
        "Unexpected error during authorization:",
        authError.message,
      );
      errorMessage = `Authorization error: ${authError.message}`;
    } else {
      console.error("Unknown authorization error:", authError);
    }
    // Return 500 Internal Server Error
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }

  try {
    console.log(`Attempting to insert board: /${short_name}/ - ${name}`);
    const insertData = {
      short_name: short_name!,
      name: name!,
      description: description, // This can be null
    };

    // Use the SERVICE client to perform the insert, bypassing RLS.
    const { data: newBoard, error: insertError } = await supabaseServiceClient
      .from("boards") // Typed table name
      .insert(insertData) // Payload structure checked by types
      .select() // Select all columns from the new row
      .single(); // We expect only one row to be inserted

    // Handle potential database errors during insertion.
    if (insertError) {
      console.error("Database insert error:", insertError);
      // Check specifically for the unique constraint violation error code.
      if (insertError.code === "23505") { // PostgreSQL unique_violation code
        return new Response(
          JSON.stringify({
            error: `Board short name '/${short_name}/' already exists.`,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 409,
          }, // 409 Conflict
        );
      }
      // For any other database error, re-throw it to be caught by the outer catch block.
      throw insertError;
    }

    // --- Step 9: Final Success Response ---
    // If the insert was successful, newBoard contains the data of the created board.
    console.log(`Successfully created board: ID ${newBoard.id}`); // Access typed properties
    // Return a 200 OK status with the success flag and the created board data.
    return new Response(
      JSON.stringify({ success: true, board: newBoard }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (dbError) {
    // Catch errors from the database interaction block (like re-thrown errors).
    console.error("Database or unexpected error during insert:", dbError);
    // Return a generic 500 Internal Server Error.
    return new Response(
      JSON.stringify({
        error: "Failed to create board due to a server error.",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }

});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/create-board' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
