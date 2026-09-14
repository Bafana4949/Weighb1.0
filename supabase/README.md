# Supabase Setup & Configuration

This project is configured to use **Supabase** as its cloud database and backend.

## 1. Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and create a new project.
2. Note your project database password and project URL.

## 2. Retrieve Connection Strings

In your Supabase project dashboard:
- Go to **Project Settings** -> **Database**.
- Under **Connection string**:
  - **Transaction Mode (Pooler)**: Use for `DATABASE_URL` (port 6543)
  - **Session Mode / Direct**: Use for `DIRECT_URL` (port 5432)

## 3. Environment Variables

Set these environment variables in your local `.env` and in your **Vercel Project Environment Variables**:

```bash
# Supabase PostgreSQL (Prisma / Backend)
DATABASE_URL="postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres"

# Supabase Client Credentials
NEXT_PUBLIC_SUPABASE_URL="https://[PROJECT_REF].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-public-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-secret-key"

# Next.js Application Auth
AUTH_SECRET="generate-a-secure-random-32-char-string"
NEXT_PUBLIC_APP_URL="https://your-domain.vercel.app"
```

## 4. Run Schema Migration

You have two options:

### Option A: Via Supabase SQL Editor (Recommended)
1. Open your Supabase Dashboard -> **SQL Editor**.
2. Open `supabase/migrations/20260914000001_manual_weighbridge_schema.sql`.
3. Paste and click **Run**.

### Option B: Via Prisma CLI
Run:
```bash
npm run db:push
```

## 5. Seed Initial Data

To seed the initial Admin, Operator, and Woestalleen site:
```bash
npm run db:seed
```

Default credentials:
- **Admin**: `admin@weighbridge.co.za` / `AdminPass123!`
- **Operator**: `operator@weighbridge.co.za` / `OperatorPass123!`
