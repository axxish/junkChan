// Define the CORS headers we want to send back
export const corsHeaders = {
    'Access-Control-Allow-Origin': '*', // Allow all origins (change in production!)
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', // Headers client can send
    'Access-Control-Allow-Methods': 'POST, OPTIONS', // Methods client can use
  };
  

  export function handleCors(req: Request): Response | null {
    // If it's an OPTIONS request (preflight)
    if (req.method === 'OPTIONS') {
      console.log('Handling OPTIONS preflight request via shared handler');
      // Respond immediately with the CORS headers and a 200 OK status
      return new Response('ok', { headers: corsHeaders, status: 200 });
    }
    // If it's not an OPTIONS request, return null to signal processing should continue
    return null;
  }