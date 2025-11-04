import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: 'pkce',
      },
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Call getUser() instead of using session.user directly
  // This validates the JWT with Supabase Auth server for security
  // It also automatically refreshes expired tokens
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  // Handle authentication errors gracefully
  if (error) {
    // Only log if it's a protected route - normal for public routes to have no session
    if (request.nextUrl.pathname.startsWith('/dashboard')) {
      console.error('Session validation error on protected route:', error.message)
    }

    // Clear invalid session cookies
    const cookiesToClear = [
      'sb-access-token',
      'sb-refresh-token',
      `sb-${process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0]}-auth-token`,
    ]

    cookiesToClear.forEach(name => {
      supabaseResponse.cookies.delete(name)
    })

    // If user is on a protected route, redirect to login with error
    if (request.nextUrl.pathname.startsWith('/dashboard')) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      url.searchParams.set('redirect', request.nextUrl.pathname)
      url.searchParams.set('error', 'session_expired')

      return NextResponse.redirect(url)
    }
  }

  // Protect routes that require authentication
  if (
    !user &&
    request.nextUrl.pathname.startsWith('/dashboard')
  ) {
    // No user, redirect to login
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    url.searchParams.set('redirect', request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  // Redirect authenticated users away from auth pages
  if (
    user &&
    (request.nextUrl.pathname.startsWith('/auth/login') ||
      request.nextUrl.pathname.startsWith('/auth/sign-up'))
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
  // creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse
}
