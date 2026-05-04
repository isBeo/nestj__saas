# 🚀 EduSaas Deployment Guide

This guide covers deploying the EduSaas monorepo to **Vercel** (frontend) and **Render** (API).

---

## 📋 Prerequisites

1. **GitHub Repository** - Push your code to GitHub
2. **Vercel Account** - Sign up at https://vercel.com
3. **Render Account** - Sign up at https://render.com
4. **Environment Variables** - Prepare `.env` files for each service

---

## 🔧 Phase 1: Prepare Environment Variables

### For API (Render)

Create a `.env` file in `apps/api/`:

```env
# App
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://yourdomain.com  # Your Vercel domain

# Database (PostgreSQL via Render or Neon)
DATABASE_URL=postgresql://user:password@host:5432/edusaas

# Redis (Render or Upstash)
REDIS_URL=redis://default:password@host:6379

# JWT Secrets (generate strong random values!)
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
JWT_REFRESH_SECRET=your-super-secret-refresh-key-min-32-chars
JWT_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# OTP Settings
OTP_EXPIRY_MINUTES=5

# Email (SendGrid, AWS SES, or SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@edusaas.ng

# SMS Provider (Optional - Termii)
TERMII_API_KEY=your-termii-api-key
TERMII_SENDER_ID=EduSaas

# Identity Verification (Optional - Prembly)
PREMBLY_API_KEY=your-prembly-key
PREMBLY_APP_ID=your-prembly-app-id
```

### For Web (Vercel)

Create a `.env.local` file in `apps/web/`:

```env
# API Endpoint
NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api  # Your Render API domain
```

---

## 🎯 Phase 2: Database Setup

### Option A: PostgreSQL + Redis on Render

**Create PostgreSQL Database:**

1. Go to https://render.com → **New +** → **PostgreSQL**
2. Name: `edusaas-db`
3. Database: `edusaas`
4. Copy the **Internal Database URL**
5. Set as `DATABASE_URL` in API env vars

**Create Redis:**

1. Go to https://render.com → **New +** → **Redis**
2. Name: `edusaas-redis`
3. Copy the **Redis URL**
4. Set as `REDIS_URL` in API env vars

### Option B: Neon (Postgres) + Upstash (Redis)

**Neon Database:**

- Go to https://neon.tech → Create project
- Connection string: `postgresql://user:password@host/edusaas`

**Upstash Redis:**

- Go to https://upstash.com → Create database
- Redis URL included in dashboard

---

## 📦 Phase 3: Prepare Build Artifacts

### Optimize for Monorepo

Update `turbo.json` for production builds:

```json
{
  "pipeline": {
    "build": {
      "outputs": ["dist/**", ".next/**"],
      "cache": false
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

### Create `.nxignore` / `.vercelignore` in root:

```
# .vercelignore
.git
node_modules
.next
dist
apps/api/**
packages/config/**

# Keep only web app
!apps/web/**
```

### Create `render.yaml` for API:

Create `render.yaml` at the **repo root** (Render Blueprints reads it from the repository root):

```yaml
services:
  - type: web
    name: edusaas-api
    env: node
    plan: starter
    buildCommand: corepack enable && pnpm install --frozen-lockfile && pnpm --filter api build
    startCommand: pnpm --filter api start:prod
    envVars:
      - key: NODE_ENV
        value: production
      # Do NOT hardcode PORT on Render. Render injects PORT automatically.
      - key: DATABASE_URL
        fromDatabase:
          name: edusaas-db
          property: connectionString
      - key: REDIS_URL
        sync: false
databases:
  - name: edusaas-db
    plan: starter
    postgresVersion: 15
```

---

## 🌐 Phase 4: Deploy API to Render

### Method A: Render Dashboard

1. **Connect GitHub:**
   - Go to https://render.com/dashboard
   - Click **New +** → **Web Service**
   - Connect your GitHub repository
   - Select the repository

2. **Configure Service:**
   - **Name:** `edusaas-api`
   - **Root Directory:** `apps/api`
   - **Runtime:** `Node`
   - **Build Command:** `pnpm install && npm run build`
   - **Start Command:** `node dist/main.js`
   - **Plan:** Starter ($7/month)

3. **Environment Variables:**
   - Click **Environment** tab
   - Add all variables from `.env` (see Phase 1)
   - **Important:** Don't commit .env files to Git!

4. **Deploy:**
   - Click **Create Web Service**
   - Render auto-deploys on GitHub push
   - Monitor logs in dashboard

### Method B: Using render.yaml (Infrastructure as Code)

```bash
# At root of project (render.yaml lives here)
git push origin main
# Render detects render.yaml and auto-deploys
```

### Verify API Deployment

```bash
# Test API health
curl https://your-render-url/api/health

# Test with auth endpoint
curl -X POST https://your-render-url/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test@123"}'
```

---

## 🎨 Phase 5: Deploy Web to Vercel

### Setup Steps

1. **Import Project:**
   - Go to https://vercel.com/new
   - Select your GitHub repository
   - Click **Import**

2. **Configure Project:**
   - **Project Name:** `edusaas-web`
   - **Framework Preset:** `Next.js`
   - **Root Directory:** `apps/web`
   - **Build Command:** Leave default (Vercel auto-detects)
   - **Install Command:** `pnpm install`
   - **Output Directory:** `.next`

3. **Environment Variables:**
   - Add **Environment Variables**:
     ```
     NEXT_PUBLIC_API_URL=https://your-render-api-url/api
     ```
   - Select **Production** environment

4. **Deploy:**
   - Click **Deploy**
   - Vercel builds and deploys automatically
   - Get your Vercel URL: `https://edusaas-web.vercel.app`

### Vercel Configuration File

Create `vercel.json` at the **repo root** (so Vercel can build the web app from the monorepo root):

```json
{
  "buildCommand": "pnpm build",
  "devCommand": "pnpm dev",
  "installCommand": "pnpm install"
}
```

---

## 🔐 Phase 6: Setup Custom Domains & HTTPS

### Vercel Custom Domain

1. Go to **Vercel Dashboard** → **Settings** → **Domains**
2. Add your domain (e.g., `app.edusaas.ng`)
3. Update DNS records:
   ```
   CNAME: www → cname.vercel-dns.com
   ALIAS/ANAME: @ → cname.vercel-dns.com
   ```
4. Vercel auto-provisions SSL/TLS

### Render Custom Domain

1. Go to **Render Dashboard** → Service → **Settings**
2. Add Custom Domain (e.g., `api.edusaas.ng`)
3. Update DNS:
   ```
   CNAME: api → your-render-service.onrender.com
   ```
4. Render auto-provisions SSL

---

## 🔗 Phase 7: Configure CORS & Origins

### Update API CORS

In `apps/api/src/main.ts`:

```typescript
app.enableCors({
  origin: [
    "https://app.edusaas.ng", // Vercel production
    "https://www.edusaas.ng",
    "http://localhost:3000", // Local dev
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
});
```

### Update Frontend API URL

In `apps/web/.env.production`:

```env
NEXT_PUBLIC_API_URL=https://api.edusaas.ng/api
```

---

## 📊 Phase 8: Database Migrations

### Run Prisma Migrations on Production

```bash
# From API directory
cd apps/api

# Run migrations
npx prisma migrate deploy

# Or seed initial data
npx prisma db seed
```

**Important:** Render/Vercel can run build commands, but you'll need to add migration step:

Update `apps/api/package.json`:

```json
{
  "scripts": {
    "build": "nest build && npx prisma migrate deploy",
    "start": "node dist/main.js"
  }
}
```

---

## 📝 Phase 9: Monitor & Logging

### Render Logs

```bash
# View real-time logs
# Dashboard → Service → Logs tab
# Or use CLI:
render logs --service edusaas-api --tail

# Search logs
render logs --service edusaas-api --search "error"
```

### Vercel Logs

- Dashboard → Deployments → Click deployment → Logs
- Real-time logs during build and runtime

### Application Logging

Your Winston logger sends JSON logs → Use tools like:

- **Datadog** - Add to Render services
- **LogRocket** - Frontend monitoring
- **Sentry** - Error tracking

---

## 🔄 Phase 10: CI/CD Pipeline

### Auto-Deploy on GitHub Push

Both Vercel and Render watch your GitHub repository:

1. **Development Branch:**
   - Push to `develop` → Auto-deploys to staging/preview
   - Configure in service settings

2. **Production Branch:**
   - Push to `main` → Auto-deploys to production
   - Add branch protection rules:
     ```
     Require PR reviews
     Require status checks to pass
     ```

### GitHub Actions (Optional)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: "18"
          cache: "pnpm"

      - run: pnpm install
      - run: pnpm lint
      - run: pnpm build
      - run: pnpm test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Render
        run: curl ${{ secrets.RENDER_DEPLOY_HOOK }}
```

---

## 🧪 Testing Deployment

### API Tests

```bash
# Register user
curl -X POST https://api.edusaas.ng/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass@123",
    "firstName": "Test",
    "lastName": "User",
    "role": "SCHOOL_ADMIN"
  }'

# Login
curl -X POST https://api.edusaas.ng/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass@123",
    "deviceId": "device-uuid"
  }'

# Check Swagger docs
# https://api.edusaas.ng/api/docs
```

### Web Tests

- Visit https://app.edusaas.ng
- Check Network tab → API requests go to api.edusaas.ng
- Test login/register flow

---

## 🔧 Troubleshooting

### API Won't Start

**Check logs:**

```bash
# Render dashboard → Logs
# Look for: "Cannot find module", "Connection refused"
```

**Common issues:**

- Missing environment variables → Add in Render dashboard
- Database not running → Check database URL
- Build failed → Check `npm run build` locally

### CORS Errors in Frontend

**Error:** `Access to XMLHttpRequest has been blocked by CORS policy`

**Fix:**

1. Check `NEXT_PUBLIC_API_URL` is correct
2. Verify API CORS config includes frontend domain
3. Ensure `credentials: true` in fetch requests

```typescript
// apps/web - correct fetch
const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include", // Send cookies
  body: JSON.stringify(data),
});
```

### Database Connection Issues

```bash
# Test connection locally
DATABASE_URL="..." npx prisma db execute --stdin < test.sql

# Reset database (BE CAREFUL!)
npx prisma migrate reset
```

---

## 📊 Cost Estimation (Monthly)

| Service           | Plan         | Cost                |
| ----------------- | ------------ | ------------------- |
| **Render API**    | Starter Web  | $7                  |
| **PostgreSQL**    | Starter      | $7                  |
| **Redis**         | Starter      | $5                  |
| **Vercel**        | Hobby (Free) | $0                  |
| **Custom Domain** | .ng          | ~₦5,000             |
| **Total**         |              | ~$25/month + domain |

---

## ✅ Deployment Checklist

- [ ] Code pushed to GitHub
- [ ] Environment variables created for both services
- [ ] Database provisioned (PostgreSQL + Redis)
- [ ] Migrations ran successfully
- [ ] API deployed to Render and health check passes
- [ ] Web deployed to Vercel
- [ ] Custom domains configured
- [ ] CORS setup correct
- [ ] Login/register tested end-to-end
- [ ] Logs monitored for errors
- [ ] GitHub Actions set up for CI/CD

---

## 🎉 You're Live!

Your EduSaas app is now deployed!

**Production URLs:**

- 🌐 Frontend: https://app.edusaas.ng
- 🔗 API: https://api.edusaas.ng
- 📚 Swagger Docs: https://api.edusaas.ng/api/docs

---

## 📞 Support & Next Steps

1. **Monitor Metrics** - Set up alerts for errors/downtime
2. **User Feedback** - Gather from initial users
3. **Scale** - Upgrade plan when traffic increases
4. **Backup** - Configure automated database backups
5. **CDN** - Consider Cloudflare for faster content delivery

Happy deploying! 🚀
