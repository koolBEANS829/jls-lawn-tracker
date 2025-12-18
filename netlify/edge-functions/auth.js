export default async (request, context) => {
    // 1. Check for the "jls_auth" cookie
    const authCookie = context.cookies.get("jls_auth");

    // If the cookie acts as a "remember me" token, you might want to validate it.
    // For simplicity here, existence is enough, but in production, 
    // you might verify a signed token.
    if (authCookie) {
        return context.next();
    }

    // 2. If no cookie, check Basic Auth header
    const authHeader = request.headers.get("authorization");

    // Get credentials from environment variables
    const envUser = Deno.env.get("BASIC_AUTH_USER");
    const envPass = Deno.env.get("BASIC_AUTH_PASSWORD");

    // If env vars are not set, fail open or closed? 
    // Safety: fail closed (deny access) if not configured, or log error.
    if (!envUser || !envPass) {
        console.error("Basic Auth credentials not set in environment");
        return new Response("Server misconfiguration", { status: 500 });
    }

    if (authHeader) {
        const match = authHeader.match(/^Basic (.+)$/);
        if (match) {
            const [user, pass] = atob(match[1]).split(":");
            if (user === envUser && pass === envPass) {
                // Success! Set a long-lived cookie
                context.cookies.set({
                    name: "jls_auth",
                    value: "true", // In a real app, use a secure signed token
                    path: "/",
                    httpOnly: true,
                    secure: true,
                    sameSite: "Strict",
                    maxAge: 60 * 60 * 24 * 30, // 30 days
                });
                return context.next();
            }
        }
    }

    // 3. If no valid auth, return 401 to prompt browser login
    return new Response("Access Denied", {
        status: 401,
        headers: {
            "WWW-Authenticate": 'Basic realm="JLS Lawn Tracker"',
        },
    });
};
