# 🚀 Deployment Guide - CogniLeapAI MVP

This guide walks you through deploying CogniLeapAI MVP to Vercel with Supabase backend.

## 📋 Prerequisites

Before deploying, ensure you have:

- [ ] Google Gemini API key ([Get one here](https://makersuite.google.com/app/apikey))
- [ ] Supabase account ([Sign up here](https://supabase.com))
- [ ] Vercel account ([Sign up here](https://vercel.com))
- [ ] GitHub account (for repository hosting)

## 🔧 Step 1: Supabase Setup

### 1.1 Create Supabase Project

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Click "New Project"
3. Enter project details:
   - **Name**: CogniLeapAI (or your preferred name)
   - **Database Password**: Generate a strong password (save it securely!)
   - **Region**: Choose closest to your users
4. Wait for project to be provisioned (~2 minutes)

### 1.2 Run Database Migrations

1. Open your Supabase project
2. Go to **SQL Editor** in left sidebar
3. Click **New Query**
4. Copy and paste the contents of `supabase/schema.sql`
5. Click **Run** to create initial tables
6. Repeat for each migration file in `supabase/migrations/` in chronological order:
   - `20250207_add_document_checksum.sql`
   - `20250210_add_user_auth.sql` (CRITICAL - adds RLS policies)
   - `20250116_add_pdf_chat_support.sql`
   - `20250116000001_add_conversations_metadata.sql`
   - `20250122_migrate_to_free_embeddings.sql`
   - `20250218_performance_advisor_cleanup.sql`
   - `20250218_performance_advisor_fixes.sql`
   - `20250218_security_advisor_fixes.sql`
   - `20250219_fix_conversation_study_tools.sql`
   - `20251011_storage_documents_rls.sql`

### 1.3 Create Storage Bucket

1. Go to **Storage** in Supabase Dashboard
2. Click **New Bucket**
3. **Name**: `documents`
4. **Public bucket**: UNCHECK (keep it private!)
5. Click **Create Bucket**
6. Go to bucket policies and ensure only authenticated users can access their own files

### 1.4 Configure Authentication

#### Enable Email Authentication
1. Go to **Authentication** → **Providers**
2. Ensure **Email** provider is enabled
3. Configure email templates:
   - **Confirm signup** (optional, customize with your branding)
   - **Reset password** (customize with your branding)
4. Go to **Authentication** → **URL Configuration**
5. Set **Site URL**: Your production domain (e.g., `https://cognileap.yourdomain.com`)
6. Add **Redirect URLs**:
   ```
   https://your-domain.com/auth/callback
   https://your-domain.com/**
   http://localhost:3000/auth/callback
   http://localhost:3000/**
   ```

#### Enable Google OAuth (Recommended)
1. Go to **Authentication** → **Providers**
2. Find **Google** and click **Enable**
3. **Get Google OAuth Credentials:**
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Create a new project or select existing
   - Enable **Google+ API**
   - Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Authorized JavaScript origins:
     ```
     https://your-domain.com
     http://localhost:3000
     ```
   - Authorized redirect URIs:
     ```
     https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback
     http://localhost:3000/auth/callback
     ```
   - Copy **Client ID** and **Client Secret**
4. **Configure in Supabase:**
   - Paste Client ID and Client Secret
   - Click **Save**

### 1.5 Get Supabase Credentials

Go to **Project Settings** → **API** and copy:
- **Project URL** (e.g., `https://xxxxx.supabase.co`)
- **anon** public key
- **service_role** secret key (⚠️ NEVER expose this publicly!)

## 📦 Step 2: GitHub Repository Setup

### 2.1 Initialize Git Repository

```bash
# If not already initialized
git init

# Verify .gitignore is working
git status

# You should NOT see:
# - .env.local
# - opencode.json
# - PHASE_*_*.md files
# If you see these, they're not properly excluded!
```

### 2.2 Create GitHub Repository

1. Go to [GitHub](https://github.com/new)
2. Create a new repository:
   - **Name**: cognileapai-mvp
   - **Description**: AI-powered study materials generator
   - **Visibility**: Public or Private (your choice)
   - **DO NOT** initialize with README (you already have one)
3. Copy the repository URL

### 2.3 Push to GitHub

```bash
# Add remote
git remote add origin https://github.com/YOUR_USERNAME/cognileapai-mvp.git

# Add all files (sensitive files are excluded by .gitignore)
git add .

# Commit
git commit -m "Initial commit: CogniLeapAI MVP"

# Push to GitHub
git push -u origin main
```

### ⚠️ SECURITY CHECK BEFORE PUSHING

Run this command to verify no secrets are being committed:

```bash
# Check what's being committed
git diff --cached

# Verify these files are NOT in the commit:
# - .env.local
# - opencode.json
# - Any files with API keys or project-specific IDs

# If you see sensitive files, run:
git reset HEAD <filename>
```

## 🌐 Step 3: Vercel Deployment

### 3.1 Import from GitHub

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click **Add New** → **Project**
3. **Import Git Repository**:
   - Select your GitHub account
   - Find `cognileapai-mvp` repository
   - Click **Import**

### 3.2 Configure Project

1. **Framework Preset**: Next.js (auto-detected)
2. **Root Directory**: `./` (leave as is)
3. **Build Command**: `pnpm build` (or use default)
4. **Output Directory**: `.next` (default)
5. **Install Command**: `pnpm install` (or use default)

### 3.3 Add Environment Variables

Click **Environment Variables** and add the following:

```env
# Google Gemini AI
GOOGLE_GENERATIVE_AI_API_KEY=your_gemini_api_key
GOOGLE_AI_API_KEY=your_gemini_api_key

# Model Configuration (optional)
GEMINI_HEAVY_MODEL=gemini-2.5-pro
GEMINI_FAST_MODEL=gemini-2.5-flash
GEMINI_LITE_MODEL=gemini-2.5-flash-lite

# Supabase (from Step 1.5)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Storage
SUPABASE_BUCKET_DOCUMENTS=documents

# App Configuration
NEXT_PUBLIC_APP_NAME=CogniLeap
NEXT_PUBLIC_THEME_ACCENT=teal
```

**IMPORTANT**: 
- Add these variables for **Production**, **Preview**, and **Development** environments
- Never commit these values to GitHub!

### 3.4 Deploy

1. Click **Deploy**
2. Wait for build to complete (~2-5 minutes)
3. Once deployed, you'll get a URL like: `https://cognileapai-mvp.vercel.app`

### 3.5 Update Supabase URLs

After deployment, update Supabase configuration:

1. Go to Supabase Dashboard → **Authentication** → **URL Configuration**
2. Update **Site URL**: `https://your-vercel-url.vercel.app`
3. Add to **Redirect URLs**:
   ```
   https://your-vercel-url.vercel.app/auth/callback
   https://your-vercel-url.vercel.app/**
   ```
4. For Google OAuth, update redirect URIs in Google Cloud Console:
   ```
   https://your-vercel-url.vercel.app
   https://your-vercel-url.vercel.app/auth/callback
   ```

## 🔗 Step 4: Custom Domain (Optional)

### 4.1 Add Domain in Vercel

1. Go to your project in Vercel
2. Click **Settings** → **Domains**
3. Click **Add Domain**
4. Enter your domain (e.g., `app.yourdomain.com`)
5. Follow DNS configuration instructions

### 4.2 Update Supabase URLs

After domain is configured:

1. Update **Site URL** in Supabase to your custom domain
2. Add custom domain to **Redirect URLs**
3. Update Google OAuth redirect URIs if using OAuth

## ✅ Step 5: Verification & Testing

### 5.1 Test Authentication

1. Visit your deployed site
2. Try signing up with email: `/auth/sign-up`
3. Verify email confirmation (if enabled)
4. Try signing in: `/auth/sign-in`
5. Test Google OAuth (if configured)
6. Test password reset flow

### 5.2 Test Core Features

1. **Document Upload**: Upload a test PDF
2. **Document Processing**: Verify PDF is processed correctly
3. **Chat**: Test document chat functionality
4. **Study Tools**: Generate summary, notes, study guide
5. **Flashcards**: Create and test flashcards
6. **Export**: Test PDF/DOCX export

### 5.3 Monitor Logs

1. **Vercel**: Check **Deployments** → **Functions** for errors
2. **Supabase**: Check **Logs** for database errors
3. **Browser Console**: Check for client-side errors

## 🔒 Security Best Practices

### ✅ What's Secured

- ✅ Environment variables properly configured
- ✅ API keys never exposed in client code
- ✅ RLS policies protect user data
- ✅ Private storage with signed URLs
- ✅ Service role key only used server-side
- ✅ User authentication required for all features

### ⚠️ Security Checklist

- [ ] `.env.local` is NOT committed to GitHub
- [ ] `SUPABASE_SERVICE_ROLE_KEY` only in Vercel environment variables
- [ ] Storage bucket is private (not public)
- [ ] RLS policies are enabled on all tables
- [ ] HTTPS enforced in production
- [ ] CORS configured correctly in Supabase
- [ ] Google OAuth redirect URIs match exactly

## 🐛 Troubleshooting

### Build Fails on Vercel

**Issue**: Build errors or TypeScript errors
```bash
# Test locally first
pnpm build

# Fix any errors before redeploying
pnpm typecheck
pnpm lint
```

### Authentication Not Working

**Issue**: OAuth redirect fails
- Verify redirect URIs match exactly in:
  - Supabase Dashboard
  - Google Cloud Console
  - Vercel environment variables

**Issue**: Email confirmation not received
- Check Supabase → Authentication → Email Templates
- Verify email provider is configured
- Check spam folder

### Database Errors

**Issue**: "relation does not exist"
- Run all migrations in Supabase SQL Editor
- Verify migration order is correct

**Issue**: "RLS policy violation"
- Ensure user is authenticated
- Verify `user_id` columns exist
- Check RLS policies are enabled

### API Errors

**Issue**: "Invalid API key"
- Verify `GOOGLE_GENERATIVE_AI_API_KEY` is set in Vercel
- Check API key is valid in Google AI Studio
- Ensure key starts with "AIza"

**Issue**: "Supabase service role key missing"
- Verify `SUPABASE_SERVICE_ROLE_KEY` is in Vercel environment variables
- DO NOT use anon key for service operations

## 📊 Monitoring & Maintenance

### Performance Monitoring

1. **Vercel Analytics**: Enable in project settings
2. **Supabase Metrics**: Monitor database performance
3. **Error Tracking**: Check Vercel function logs regularly

### Database Maintenance

1. **Backups**: Supabase automatically backs up your database
2. **Indexes**: Monitor query performance in Supabase Dashboard
3. **Storage**: Monitor storage usage for uploaded PDFs

### Updates & Scaling

```bash
# Deploy updates
git add .
git commit -m "Your update message"
git push origin main

# Vercel automatically deploys from main branch
```

## 🎉 Success!

Your CogniLeapAI MVP is now live! Share it with users and gather feedback.

### Next Steps

1. Monitor user feedback and errors
2. Implement additional features
3. Optimize performance based on metrics
4. Scale infrastructure as needed

## 📞 Support

- **GitHub Issues**: Report bugs on your repository
- **Supabase Docs**: https://supabase.com/docs
- **Vercel Docs**: https://vercel.com/docs
- **Next.js Docs**: https://nextjs.org/docs

---

**Remember**: Never share your API keys or service role keys publicly!
