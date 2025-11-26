# Authentication System Documentation
---

## Table of Contents
1. [What Does This System Do?](#what-does-this-system-do)
2. [Technology Stack - What We Used](#technology-stack---what-we-used)
3. [How It All Works Together](#how-it-all-works-together)
4. [User Journeys with Diagrams](#user-journeys-with-diagrams)
5. [Security Features](#security-features)
6. [Why These Choices?](#why-these-choices)

---

## What Does This System Do?

### In Simple Terms

Our authentication system handles 3 main things:

1. **Sign Up** - New users create accounts
2. **Log In** - Existing users access their data
3. **Security** - Ensures users only see their own data, not others'

### Key Features

✅ Email/Password login
✅ Google "Sign in with Google" button
✅ Email verification (confirms real email)
✅ Password reset (forgot password flow)
✅ Protected pages (dashboard only for logged-in users)
✅ Automatic logout when session expires

---

## Technology Stack - What We Used

### Frontend (What Users See)

```
┌─────────────────────────────────────────────────┐
│           USER INTERFACE LAYER                  │
│                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ Next.js  │  │  React   │  │TypeScript│    │
│  │    15    │  │    19    │  │          │    │
│  └──────────┘  └──────────┘  └──────────┘    │
│                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ Tailwind │  │React Hook│  │   Zod    │    │
│  │   CSS    │  │   Form   │  │Validation│    │
│  └──────────┘  └──────────┘  └──────────┘    │
└─────────────────────────────────────────────────┘
```

| Tech | What It Does | Why We Chose It |
|------|--------------|-----------------|
| **Next.js 15** | Main framework - combines frontend & backend | Industry standard, fast, modern |
| **React 19** | Builds user interface (buttons, forms, pages) | Most popular UI library, easy to learn |
| **TypeScript** | JavaScript with error checking | Catches bugs before they happen |
| **Tailwind CSS** | Makes things look good | Fast styling, modern designs |
| **React Hook Form** | Manages form inputs | Smooth user experience, validates inputs |
| **Zod** | Checks if email is valid, password is strong | Prevents bad data from entering system |

### Backend (Behind the Scenes)

```
┌─────────────────────────────────────────────────┐
│          BACKEND SERVICES LAYER                 │
│                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ Supabase │  │PostgreSQL│  │ Next.js  │    │
│  │   Auth   │  │ Database │  │Middleware│    │
│  └──────────┘  └──────────┘  └──────────┘    │
│                                                 │
│  ┌──────────┐  ┌──────────┐                   │
│  │@supabase/│  │   Row    │                   │
│  │   ssr    │  │  Level   │                   │
│  │          │  │ Security │                   │
│  └──────────┘  └──────────┘                   │
└─────────────────────────────────────────────────┘
```

| Tech | What It Does | Why We Chose It |
|------|--------------|-----------------|
| **Supabase** | Professional authentication service | Handles passwords, emails, OAuth - secure & tested |
| **PostgreSQL** | Database that stores user data | Reliable, powerful, industry standard |
| **Next.js Middleware** | Security guard for pages | Automatically checks if user is logged in |
| **@supabase/ssr** | Makes auth work with Next.js | Seamless integration, handles cookies |

---

## How It All Works Together

### System Architecture

```
                    ┌─────────────────┐
                    │   USER BROWSER  │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │   MIDDLEWARE    │
                    │ Security Guard  │
                    └────────┬────────┘
                             │
                ┌────────────┴────────────┐
                │                         │
          Logged In?                Not Logged In?
                │                         │
                ▼                         ▼
      ┌──────────────────┐      ┌──────────────────┐
      │    DASHBOARD     │      │   LOGIN PAGE     │
      │  Protected Area  │      │   Sign Up Page   │
      └─────────┬────────┘      └─────────┬────────┘
                │                          │
                ▼                          ▼
      ┌──────────────────┐      ┌──────────────────┐
      │   API ROUTES     │      │  SUPABASE AUTH   │
      │  User's Data     │      │  Authentication  │
      └─────────┬────────┘      └─────────┬────────┘
                │                          │
                └──────────┬───────────────┘
                           │
                           ▼
              ┌─────────────────────────┐
              │  POSTGRESQL DATABASE    │
              │  • auth.users table     │
              │  • profiles table       │
              │  • Row Level Security   │
              └─────────────────────────┘
                           │
                           ▼
              ┌─────────────────────────┐
              │    EMAIL SERVICE        │
              │  Verification emails    │
              │  Password reset links   │
              └─────────────────────────┘
```

### What Each Part Does

1. **Auth Pages** (`src/app/auth/*`)
   - Login page, Sign up page, Password reset
   - Built with React + React Hook Form

2. **Middleware** (`src/middleware.ts`)
   - Security guard that checks every request
   - If not logged in → redirects to login
   - If logged in → allows access to dashboard

3. **Supabase Client** (`src/lib/supabase/`)
   - Talks to Supabase service
   - Handles login, signup, logout
   - Stores secure tokens in cookies

4. **Database** (PostgreSQL in Supabase)
   - Stores user accounts and profiles
   - Has security rules (RLS) to prevent data leaks

5. **Auth Context** (`src/contexts/auth-context.tsx`)
   - Keeps track of current user across all pages
   - React feature that shares user info everywhere

---

## User Journeys with Diagrams

### 1. Sign Up Flow

```
┌──────┐                                            ┌──────────┐
│ USER │                                            │ SUPABASE │
└──┬───┘                                            └────┬─────┘
   │                                                      │
   │  1. Opens Sign Up Page                              │
   │  (/auth/sign-up)                                    │
   ├──────────────────────────┐                          │
   │                          │                          │
   │  2. Fills Form:          │                          │
   │     • First Name         │                          │
   │     • Last Name          │                          │
   │     • Email              │                          │
   │     • Password           │                          │
   │     • Confirm Password   │                          │
   │                          │                          │
   │  3. Clicks "Sign Up"     │                          │
   │◄─────────────────────────┘                          │
   │                                                      │
   │  4. Validates Form (Zod + React Hook Form)          │
   │     ✓ Email format correct?                         │
   │     ✓ Password 8+ characters?                       │
   │     ✓ Passwords match?                              │
   ├──────────────────────────┐                          │
   │◄─────────────────────────┘                          │
   │                                                      │
   │  5. Send signup request                             │
   ├─────────────────────────────────────────────────────►
   │                                                      │
   │                          6. Create user in database │
   │                             (auth.users table)      │
   │                                        ┌─────────────┤
   │                                        │             │
   │                          7. Trigger creates profile │
   │                             (profiles table)        │
   │                                        └─────────────►
   │                                                      │
   │                          8. Send verification email │
   │◄─────────────────────────────────────────────────────┤
   │                                                      │
   │  9. Shows "Check your email" dialog                 │
   ├──────────────────────────┐                          │
   │◄─────────────────────────┘                          │
   │                                                      │
   │  10. Checks email inbox                             │
   │      Clicks verification link                       │
   ├─────────────────────────────────────────────────────►
   │                                                      │
   │                         11. Mark email as verified  │
   │                             Account activated!      │
   │◄─────────────────────────────────────────────────────┤
   │                                                      │
   │  12. Redirect to dashboard                          │
   │      ✓ Can now login!                               │
   │◄─────────────────────────────────────────────────────┤
   │                                                      │
```

**What Happens:**
1. User fills signup form
2. Form checks password is strong (8+ characters)
3. Supabase creates account
4. Email sent with verification link
5. User clicks link → account activated

**Files:** `src/app/auth/sign-up/page.tsx`

---

### 2. Login Flow

```
┌──────┐          ┌────────────┐         ┌──────────┐
│ USER │          │ MIDDLEWARE │         │ SUPABASE │
└──┬───┘          └─────┬──────┘         └────┬─────┘
   │                    │                      │
   │  1. Opens Login Page                     │
   │  (/auth/login)                            │
   │                    │                      │
   │  2. Enters:        │                      │
   │     • Email        │                      │
   │     • Password     │                      │
   │                    │                      │
   │  3. Clicks "Sign In"                     │
   │────────────────────┼─────────────────────►│
   │                    │                      │
   │                    │  4. Validate credentials
   │                    │     Check password hash
   │                    │         ┌────────────┤
   │                    │         └────────────►│
   │                    │                      │
   │  5. ✓ Credentials valid                  │
   │     Returns tokens:                      │
   │     • Access Token (1 hour)              │
   │     • Refresh Token (long-term)          │
   │◄────────────────────────────────────────┤
   │                    │                      │
   │  6. Tokens stored in                     │
   │     HTTP-only cookies                    │
   │     (secure, can't be accessed           │
   │      by JavaScript)                      │
   ├─────────────┐      │                      │
   │◄────────────┘      │                      │
   │                    │                      │
   │  7. Tries to visit /dashboard            │
   ├───────────────────►│                      │
   │                    │                      │
   │                    │  8. Middleware checks│
   │                    │     cookies for token│
   │                    ├─────────────────────►│
   │                    │                      │
   │                    │  9. Validate JWT token
   │                    │◄─────────────────────┤
   │                    │     ✓ Token valid    │
   │                    │                      │
   │  10. Access granted                      │
   │      Dashboard loads                     │
   │◄────────────────────                      │
   │                    │                      │
   │  11. Shows user's documents,             │
   │      chats, and data                     │
   │  ✓ Logged in successfully!               │
   │                    │                      │
```

**What Happens:**
1. User enters email/password
2. Supabase checks if correct
3. If yes → gives user a "token" (digital key)
4. Token stored in secure cookie
5. When visiting protected pages, middleware checks token
6. Valid token = access granted

**Files:**
- `src/app/auth/login/page.tsx` (login form)
- `src/middleware.ts` (security check)

---

### 3. Google Sign-In (OAuth)

```
┌──────┐        ┌─────────┐        ┌────────┐        ┌──────────┐
│ USER │        │   APP   │        │ GOOGLE │        │ SUPABASE │
└──┬───┘        └────┬────┘        └───┬────┘        └────┬─────┘
   │                 │                  │                  │
   │  1. Clicks "Sign in with Google"  │                  │
   ├────────────────►│                  │                  │
   │                 │                  │                  │
   │                 │  2. Generate PKCE codes:           │
   │                 │     • code_verifier (random)       │
   │                 │     • code_challenge (hash)        │
   │                 ├────────┐         │                  │
   │                 │◄───────┘         │                  │
   │                 │                  │                  │
   │                 │  3. Redirect to Google with        │
   │                 │     code_challenge                 │
   │                 ├─────────────────►│                  │
   │                 │                  │                  │
   │  4. Google login page opens        │                  │
   │◄────────────────┴──────────────────┤                  │
   │                                    │                  │
   │  5. User picks Google account      │                  │
   │     and approves access            │                  │
   ├───────────────────────────────────►│                  │
   │                                    │                  │
   │                 6. Google sends authorization code   │
   │                    back to app                       │
   │◄────────────────┬──────────────────┤                  │
   │                 │                  │                  │
   │                 │  7. Exchange authorization code    │
   │                 │     + code_verifier for tokens     │
   │                 ├─────────────────────────────────────►
   │                 │                  │                  │
   │                 │                  │  8. Verify PKCE  │
   │                 │                  │     (challenge   │
   │                 │                  │      matches)    │
   │                 │                  │     ┌────────────┤
   │                 │                  │     └────────────►
   │                 │                  │                  │
   │                 │  9. ✓ Valid! Return tokens         │
   │                 │◄─────────────────────────────────────
   │                 │                  │                  │
   │  10. Logged in!                    │                  │
   │      Redirect to dashboard         │                  │
   │◄────────────────┤                  │                  │
   │                 │                  │                  │
   │  ✓ No password needed!             │                  │
   │                 │                  │                  │
```

**What Happens:**
1. User clicks "Continue with Google"
2. Redirected to Google login
3. User picks account and approves
4. Google sends secret code back
5. App exchanges code for token (PKCE for extra security)
6. User logged in without typing password!

**Files:** `src/app/auth/callback/route.ts` (handles Google's response)

---

### 4. Password Reset

```
     START
       │
       ▼
┌─────────────────┐
│ User clicks     │
│"Forgot Password"│
│  on login page  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Forgot Password │
│      Page       │
│  /auth/forgot-  │
│    password     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ User enters     │
│  their email    │
│  address        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Click "Send     │
│  Reset Link"    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Supabase sends  │
│ reset email with│
│   secure link   │
│ (expires 1 hour)│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  User checks    │
│   email inbox   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Clicks reset    │
│   link in       │
│     email       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Opens Update    │
│ Password Page   │
│  /auth/update-  │
│    password     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Enters new      │
│   password      │
│ + confirmation  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Click "Update   │
│   Password"     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Supabase updates│
│  password hash  │
│  in database    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Success message │
│ "Password       │
│  updated!"      │
│ (3 sec countdown)│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Auto-redirect   │
│  to login page  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ User logs in    │
│  with NEW       │
│   password      │
└────────┬────────┘
         │
         ▼
      SUCCESS
```

**What Happens:**
1. User clicks "Forgot Password"
2. Enters email
3. Receives email with reset link (expires in 1 hour)
4. Clicks link, enters new password
5. Done! Can login now

**Files:**
- `src/app/auth/forgot-password/page.tsx`
- `src/app/auth/update-password/page.tsx`

---

## Security Features

### Why Our System is Secure

```
                    ┌─────────────────────────┐
                    │   SECURITY LAYERS       │
                    └───────────┬─────────────┘
                                │
           ┌────────────────────┼────────────────────┐
           │                    │                    │
           ▼                    ▼                    ▼
    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
    │  PASSWORD   │     │    TOKEN    │     │    OAUTH    │
    │ PROTECTION  │     │  SECURITY   │     │  SECURITY   │
    └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
           │                   │                    │
    ┌──────┴──────┐     ┌──────┴──────┐     ┌──────┴──────┐
    │ • Bcrypt    │     │ • HTTP-only │     │ • PKCE Flow │
    │   Hashing   │     │   Cookies   │     │ • Code      │
    │ • Salted    │     │ • 1hr expiry│     │   Challenge │
    │ • One-way   │     │ • Auto      │     │ • Prevents  │
    │   encryption│     │   refresh   │     │   hijacking │
    └─────────────┘     └─────────────┘     └─────────────┘

           ┌────────────────────┼────────────────────┐
           │                    │                    │
           ▼                    ▼                    ▼
    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
    │  DATABASE   │     │ MIDDLEWARE  │     │    EMAIL    │
    │  SECURITY   │     │ PROTECTION  │     │ VERIFICATION│
    └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
           │                   │                    │
    ┌──────┴──────┐     ┌──────┴──────┐     ┌──────┴──────┐
    │ • Row Level │     │ • Runs on   │     │ • Confirms  │
    │   Security  │     │   every req │     │   real email│
    │ • User can  │     │ • Validates │     │ • 24hr link │
    │   only see  │     │   JWT token │     │ • Required  │
    │   own data  │     │ • Auto      │     │   for full  │
    │             │     │   redirect  │     │   access    │
    └─────────────┘     └─────────────┘     └─────────────┘
```

### Key Security Features Explained

1. **Password Hashing (Bcrypt)**
   - Passwords converted to random-looking text
   - Even database admins can't see real passwords
   - One-way process (can't reverse it)

2. **HTTP-Only Cookies**
   - Tokens stored where JavaScript can't touch them
   - Prevents hackers from stealing tokens
   - Automatic with every request

3. **PKCE Flow (for Google Sign-In)**
   - Extra security layer for OAuth
   - Creates secret code that only our app knows
   - Even if hacker intercepts, can't use it

4. **Row Level Security (RLS)**
   - Database rules that block unauthorized access
   - User A can't see User B's documents
   - Enforced at database level (can't bypass)

5. **Middleware Protection**
   - Runs on every page visit
   - Checks if logged in before showing page
   - Auto-refreshes expired tokens

6. **Email Verification**
   - Confirms user owns the email
   - Prevents fake accounts
   - Required before full access

---

## Why These Choices?

### Decision Rationale

#### Why Supabase Instead of Building Our Own?

| Building Auth Ourselves | Using Supabase |
|------------------------|----------------|
| ❌ 3-6 months development | ✅ Set up in 1 day |
| ❌ High risk of security bugs | ✅ Battle-tested, secure |
| ❌ Need to handle email delivery | ✅ Email service included |
| ❌ OAuth integration complex | ✅ OAuth built-in |
| ❌ Compliance (GDPR) is hard | ✅ Compliant by default |

**Verdict:** Focus on our app features, not reinventing auth

---

#### Why Next.js + React?

- **Most Popular:** Huge community, lots of resources
- **Modern:** Latest web development practices
- **Full-Stack:** Frontend + backend in one project
- **Fast:** Built-in optimization, runs on edge servers
- **Industry Standard:** Used by Netflix, TikTok, Twitch

---

#### Why TypeScript?

```
JavaScript:
let user = "John"
user = 123  // ← No error, but will break later!

TypeScript:
let user: string = "John"
user = 123  // ← Error immediately! Can't assign number to string
```

**Benefit:** Catches errors while coding, not when users find them

---

#### Why PostgreSQL?

- **Reliable:** Battle-tested for 30+ years
- **Powerful:** Handles complex queries easily
- **Scalable:** Works from 10 to 10 million users
- **Standard:** Most companies use it
- **RLS Built-In:** Security features we need

---

### File Organization

Our auth system is organized cleanly:

```
src/
├── app/auth/              ← All auth pages
│   ├── login/            ← Login form
│   ├── sign-up/          ← Signup form
│   ├── forgot-password/  ← Reset request
│   ├── update-password/  ← New password
│   └── callback/         ← OAuth handler
│
├── components/auth/       ← Reusable auth components
│   └── email-verification-dialog.tsx
│
├── contexts/              ← Global state
│   └── auth-context.tsx  ← User state across app
│
├── lib/supabase/          ← Supabase setup
│   ├── client.ts         ← Browser client
│   ├── server.ts         ← Server client
│   └── middleware.ts     ← Session management
│
└── middleware.ts          ← Route protection
```

---

## Tech Stack Summary by Feature

| Feature | Technologies Used | File Location |
|---------|------------------|---------------|
| **Login Form** | React, React Hook Form, Zod | `src/app/auth/login/page.tsx` |
| **Signup Form** | React, React Hook Form, Zod | `src/app/auth/sign-up/page.tsx` |
| **Google Sign-In** | Supabase OAuth, PKCE | `src/app/auth/login/page.tsx`<br/>`src/app/auth/callback/route.ts` |
| **Password Reset** | Supabase Auth, Email Service | `src/app/auth/forgot-password/page.tsx`<br/>`src/app/auth/update-password/page.tsx` |
| **Email Verification** | Supabase Auth, Radix UI | `src/components/auth/email-verification-dialog.tsx` |
| **Route Protection** | Next.js Middleware | `src/middleware.ts` |
| **Token Storage** | HTTP-Only Cookies, @supabase/ssr | `src/lib/supabase/client.ts` |
| **User State** | React Context API | `src/contexts/auth-context.tsx` |
| **Database** | PostgreSQL, Row Level Security | Supabase backend |
| **Styling** | Tailwind CSS | All component files |

---

## Advantages of Our Approach

### For Users
- ✅ Fast login (Google one-click)
- ✅ Secure (multiple protection layers)
- ✅ Easy password reset
- ✅ Mobile-friendly design

### For Developers
- ✅ Type-safe (TypeScript catches errors)
- ✅ Easy to maintain (clean file structure)
- ✅ Scalable (handles growth)
- ✅ Modern tech stack

### For Security
- ✅ Industry-standard authentication
- ✅ Database-level protection (RLS)
- ✅ Encrypted passwords (bcrypt)
- ✅ Secure token storage (HTTP-only cookies)
- ✅ Protected routes (middleware)

---

## Sample Q&A for Presentation

**Q: Why not just use localStorage for tokens?**
A: localStorage can be accessed by any JavaScript, including malicious code. HTTP-only cookies can only be accessed by the server, making them much more secure.

**Q: What if someone steals a user's token?**
A: Tokens expire in 1 hour automatically. Even if stolen, the attacker has limited time. Plus, tokens are in HTTP-only cookies which are hard to steal.

**Q: How does PKCE make Google login more secure?**
A: PKCE creates a secret code that only our app knows. Even if a hacker intercepts the authorization code from Google, they can't use it without our secret.

**Q: Can users be logged in on multiple devices?**
A: Yes! Each device gets its own token. A user can be on their phone, laptop, and tablet simultaneously.

**Q: What happens to user data when they log out?**
A: All tokens are cleared, localStorage is wiped, and they're redirected to login. Their data stays safely in the database for next login.

---

## Conclusion

Our authentication system combines modern technologies to create a secure, user-friendly experience. By using Supabase for auth, we avoid common security pitfalls while focusing on building great features.

**Key Points:**
- ✅ **Secure** - Multiple layers of protection
- ✅ **Modern** - Latest technologies (Next.js, React, TypeScript)
- ✅ **User-Friendly** - Google sign-in, easy password reset
- ✅ **Scalable** - Can grow from 10 to 10,000+ users
- ✅ **Maintainable** - Clean code, clear structure

---
