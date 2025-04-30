import { corsHeaders, handleCors } from "../common/cors.ts";
import { SupabaseClient } from "jsr:@supabase/supabase-js";
import { Database } from "../common/database.types.ts";
import { HttpError, createErrorResponse, initializeSupabaseClients, authorizeUserRole } from "../common/util.ts";

console.log("Deleting a board!");

// --- Helper Functions ---

/**
 * Parses and validates the board deletion input from the request body.
 * Throws an error if validation fails.
 */
async function parseAndValidateDeleteInput(req: Request): Promise<{ id: string }> {
  const requestPayload = await req.json();
  console.log("request payload:", requestPayload);

  const { id } = requestPayload;

  if (!id || typeof id !== "string") {
    throw new Error("Missing or invalid required field: id");
  }

  // Optionally, validate UUID format
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
    throw new Error("Invalid board id format (must be UUID)");
  }

  return { id };
}

/**
 * Deletes a board from the database by id.
 * Throws specific errors for database failures.
 */
async function deleteBoardEntry(
  supabaseServiceClient: SupabaseClient<Database>,
  boardId: string,
): Promise<void> {
  console.log(`Attempting to delete board: ${boardId}`);

  const { error: deleteError, data } = await supabaseServiceClient
    .from("boards")
    .delete()
    .eq("id", boardId)
    .select("id");

  console.log(data);
  if (deleteError) {
    console.error("Database delete error:", deleteError);
    throw new HttpError("Failed to delete board due to a database error.", 500);
  }

  if (!data || data.length === 0) {
    throw new HttpError("Board not found.", 404);
  }

  console.log(`Successfully deleted board: ${boardId}`);
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
  if (req.method !== "DELETE") {
    return createErrorResponse("Method Not Allowed", 405);
  }

  try {
    // Initialization
    const { supabaseUserClient, supabaseServiceClient } =
      initializeSupabaseClients(req);

    // Input Parsing and Validation
    const { id } = await parseAndValidateDeleteInput(req);

    // Authorization
    await authorizeUserRole(supabaseUserClient, supabaseServiceClient, "admin");

    // Database Deletion
    await deleteBoardEntry(supabaseServiceClient, id);

    // Final Success Response
    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    // Centralized Error Handling
    let status = 500;
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

