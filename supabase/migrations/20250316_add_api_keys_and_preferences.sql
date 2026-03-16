-- Migration: Add user API keys and AI preferences tables
-- Date: 2025-03-16

-- User API Keys (encrypted at rest)
create table if not exists public.user_api_keys (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('gemini', 'openrouter', 'laozhang', 'kie')),
  encrypted_key text not null,
  key_hint text not null, -- last 4 chars for display, e.g. "...a1b2"
  is_valid boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, provider)
);

-- RLS policies for user_api_keys
alter table public.user_api_keys enable row level security;

create policy "Users can view their own API keys"
  on public.user_api_keys for select
  using (auth.uid() = user_id);

create policy "Users can insert their own API keys"
  on public.user_api_keys for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own API keys"
  on public.user_api_keys for update
  using (auth.uid() = user_id);

create policy "Users can delete their own API keys"
  on public.user_api_keys for delete
  using (auth.uid() = user_id);

-- User AI Preferences
create table if not exists public.user_ai_preferences (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  default_provider text not null default 'gemini' check (default_provider in ('gemini', 'openrouter', 'laozhang', 'kie')),
  default_model text not null default 'gemini-2.5-flash',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS policies for user_ai_preferences
alter table public.user_ai_preferences enable row level security;

create policy "Users can view their own AI preferences"
  on public.user_ai_preferences for select
  using (auth.uid() = user_id);

create policy "Users can insert their own AI preferences"
  on public.user_ai_preferences for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own AI preferences"
  on public.user_ai_preferences for update
  using (auth.uid() = user_id);

create policy "Users can delete their own AI preferences"
  on public.user_ai_preferences for delete
  using (auth.uid() = user_id);

-- Indexes
create index if not exists user_api_keys_user_id_idx on public.user_api_keys(user_id);
create index if not exists user_ai_preferences_user_id_idx on public.user_ai_preferences(user_id);

-- Add profiles table if it doesn't exist (referenced in code but not in base schema)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS for profiles
alter table public.profiles enable row level security;

-- Drop existing policies if they exist (idempotent)
do $$ begin
  drop policy if exists "Users can view their own profile" on public.profiles;
  drop policy if exists "Users can update their own profile" on public.profiles;
  drop policy if exists "Users can insert their own profile" on public.profiles;
exception when others then null;
end $$;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);
