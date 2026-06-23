import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { verifyOtpSession, OTP_COOKIE } from "@/lib/otp";

/** Refreshes the Supabase auth session on every request and guards /admin/*.
 *  Full admin access requires BOTH a Supabase session AND a valid OTP-verified
 *  cookie (the 2nd factor, set after the emailed code is confirmed). */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options?: CookieOptions }[],
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 2nd factor: a signed cookie set only after the emailed OTP is verified.
  const otpUserId = await verifyOtpSession(request.cookies.get(OTP_COOKIE)?.value, process.env.ADMIN_OTP_SECRET ?? "");
  const fullyAuthed = !!user && otpUserId === user.id;

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith("/login");
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");

  if (!fullyAuthed && isAdminRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (fullyAuthed && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
