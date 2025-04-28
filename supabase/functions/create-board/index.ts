import { corsHeaders, handleCors } from "../common/cors.ts";
import { SupabaseClient } from "jsr:@supabase/supabase-js";
import { Database } from "../common/database.types.ts";
import { HttpError, createErrorResponse, initializeSupabaseClients, authorizeUserRole} from "../common/util.ts";

console.log("Creating a board!");

// --- Helper Functions ---

/**
 * Parses and validates the board creation input from the request body.
 * Throws an error if validation fails.
 */
async function parseAndValidateBoardInput(req: Request): Promise<{
  short_name: string;
  name: string;
  description: string | null;
}> {
  const requestPayload = await req.json();
  console.log("request payload:", requestPayload);

  const { short_name, name, description: rawDescription } = requestPayload;
  const description = rawDescription || null; // Default optional field

  // Type validation
  if (
    !short_name || !name || typeof short_name !== "string" ||
    typeof name !== "string"
  ) {
    throw new Error(
      "Missing or invalid required string fields: short_name, name",
    );
  }
  if (description && typeof description !== "string") {
    throw new Error("Invalid description field type (must be string or null)");
  }

  // Format/length validation
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
  return { short_name, name, description };
}


/**
 * Inserts a new board into the database.
 * Throws specific errors for database failures (e.g., unique constraint).
 */
async function createBoardEntry(
  supabaseServiceClient: SupabaseClient<Database>,
  boardData: {
    short_name: string;
    name: string;
    description: string | null;
  },
): Promise<Database["public"]["Tables"]["boards"]["Row"]> { // Return type based on schema
  console.log(
    `Attempting to insert board: /${boardData.short_name}/ - ${boardData.name}`,
  );

  const { data: newBoard, error: insertError } = await supabaseServiceClient
    .from("boards")
    .insert(boardData)
    .select()
    .single();

  if (insertError) {
    console.error("Database insert error:", insertError);
    let message = "Failed to create board due to a database error.";
    let status = 500;
    if (insertError.code === "23505") { // Unique constraint violation
      message =
        `Board short name '/${boardData.short_name}/' already exists.`;
      status = 409; // Conflict
    }
    // Throw custom error
    throw new HttpError(message, status);
  }

  console.log(`Successfully created board: ID ${newBoard.id}`);
  return newBoard;
}

// --- Main Request Handler ---

Deno.serve(async (req: Request) => {
  console.log(`Received request: ${req.method} ${req.url}`);

  // CORS Preflight Handling
  const corsResponse = handleCors(req);
  if (corsResponse) {
    console.log("Handling CORS preflight request");
    return corsResponse;
  }

  // Method Check
  if (req.method !== "POST") {
    return createErrorResponse("Method Not Allowed", 405);
  }

  try {
    // Initialization
    const { supabaseUserClient, supabaseServiceClient } =
      initializeSupabaseClients(req);

    // Input Parsing and Validation
    const boardInput = await parseAndValidateBoardInput(req);

    // Authorization
    await authorizeUserRole(supabaseUserClient, supabaseServiceClient, "admin");

    // Database Insertion
    const newBoard = await createBoardEntry(supabaseServiceClient, boardInput);

    // Final Success Response
    return new Response(
      JSON.stringify({ success: true, board: newBoard }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    // Centralized Error Handling - Updated
    let status = 500; // Default status
    let message = "An unexpected error occurred.";

    if (error instanceof HttpError) {
      status = error.status;
      message = error.message;
    } else if (error instanceof Error) {
      message = error.message;
    }
    const logError = error instanceof Error ? error : undefined;
    return createErrorResponse(message, status, logError);
  }
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/create-board' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"short_name": "test", "name":"Test Board", "description": "A board for testing"}'

*/