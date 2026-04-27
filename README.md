# 🏫 EduSaas Nigeria — Enterprise School Management System

### Built with the TESLA Methodology | Learn While Building

---

## 📌 What is TESLA Methodology?

TESLA stands for:

- **T**echnical Architecture First
- **E**ngineering Standards Defined
- **S**calable Structure Laid Out
- **L**earn-as-you-Build Approach
- **A**utomation & Deployment Ready

This means: **we plan before we code**, we build with real-world standards, and every decision is explained like a mentor explaining to a junior engineer.

---

## 🎯 Project Vision

EduSaas is a **multi-tenant SaaS platform** that manages:

- Nursery, Primary, and Secondary schools in Nigeria
- Computer-Based Testing (CBT)
- Students, Teachers, Parents, and Admins
- Billing, Results, Attendance, Notifications
- One-device-per-user security

---

## 🗓️ 7-Day Sprint Plan

| Day   | Topic                                      | File                                |
| ----- | ------------------------------------------ | ----------------------------------- |
| Day 1 | Architecture, Concepts & Setup             | `DAY1-Architecture-and-Concepts.md` |
| Day 2 | Database Design & Prisma Schema            | `DAY2-Database-Design-Prisma.md`    |
| Day 3 | NestJS Backend Bootstrap + Auth            | `DAY3-NestJS-Bootstrap-Auth.md`     |
| Day 4 | Device Security, Redis & Guards            | `DAY4-Device-Security-Redis.md`     |
| Day 5 | Core Modules (Schools, Students, Teachers) | `DAY5-Core-Modules.md`              |
| Day 6 | NextJS Frontend + Auth UI                  | `DAY6-NextJS-Frontend.md`           |
| Day 7 | DevOps, Docker, CI/CD & Deployment         | `DAY7-DevOps-Deployment.md`         |

---

## 🏗️ Tech Stack Overview

### Backend

| Tool                | Purpose               | Why This?                                          |
| ------------------- | --------------------- | -------------------------------------------------- |
| **NestJS**          | Backend Framework     | Structured, scalable, Angular-like DI system       |
| **Prisma ORM**      | Database Access       | Type-safe, auto-generated client, great migrations |
| **PostgreSQL**      | Primary Database      | Relational, ACID-compliant, battle-tested          |
| **Redis**           | Sessions, OTP, Queues | In-memory speed, TTL support                       |
| **Zod**             | Schema Validation     | Runtime type safety + TypeScript inference         |
| **class-validator** | DTO Validation        | NestJS-native validation via decorators            |
| **JWT**             | Authentication Tokens | Stateless, scalable auth                           |
| **BullMQ**          | Job Queues            | Background jobs (email, SMS, reports)              |
| **Socket.IO**       | Real-time comms       | Notifications, messaging                           |
| **Swagger**         | API Documentation     | Auto-generated, always up to date                  |
| **Helmet**          | HTTP Security         | Sets secure HTTP headers                           |
| **Winston**         | Logging               | Production-grade structured logging                |

### Frontend

| Tool                       | Purpose            | Why This?                              |
| -------------------------- | ------------------ | -------------------------------------- |
| **Next.js 14+**            | Frontend Framework | App Router, Server Components, SSR     |
| **TypeScript**             | Type Safety        | Catch errors at compile time           |
| **Tailwind CSS**           | Styling            | Utility-first, fast UI development     |
| **shadcn/ui**              | Component Library  | Accessible, customizable components    |
| **Zustand**                | State Management   | Lightweight, simple global state       |
| **React Query (TanStack)** | Data Fetching      | Caching, sync, background refresh      |
| **Axios**                  | HTTP Client        | Interceptors, base URL, error handling |
| **Zod**                    | Form Validation    | Shared with backend schemas            |
| **React Hook Form**        | Form Management    | Performance, minimal re-renders        |

### DevOps

| Tool                        | Purpose                       |
| --------------------------- | ----------------------------- |
| **Docker + Docker Compose** | Containerization              |
| **GitHub Actions**          | CI/CD pipeline                |
| **pnpm**                    | Fast monorepo package manager |
| **Turborepo**               | Monorepo build orchestration  |
| **dotenv-vault**            | Secure env management         |
| **Jest + Supertest**        | Testing                       |

---

## 📁 Monorepo Structure (Top-Level)

```
edusaas/
├── apps/
│   ├── api/          ← NestJS Backend
│   └── web/          ← Next.js Frontend
├── packages/
│   ├── types/        ← Shared TypeScript types
│   ├── config/       ← Shared config (env schemas, constants)
│   └── ui/           ← Shared UI components (optional)
├── docker/
│   ├── postgres/
│   └── redis/
├── .github/
│   └── workflows/
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

### 🧠 Why Monorepo?

**The Problem with Separate Repos:**

- You duplicate types between frontend and backend
- You can't share validation schemas
- Deployments are harder to coordinate
- Changes require updating multiple repos

**The Monorepo Solution:**

- One repo, multiple apps
- Shared `packages/types` means your Prisma models and API response types are used on BOTH frontend and backend
- Turborepo caches builds so it's fast
- pnpm workspaces handle dependencies efficiently

---

## 🔐 Role-Based Access Control (RBAC) Overview

```
SUPER_ADMIN  → Full system access (Anthropic-style platform owner)
SCHOOL_ADMIN → Manages one school completely
TEACHER      → Manages classes, grades, attendance
STUDENT      → Accesses own data, takes CBT exams
PARENT       → Views child's results, communicates with school
```

Every API route is protected by:

1. **JWT Guard** - Is the user authenticated?
2. **Role Guard** - Does the user have permission?
3. **Ownership Guard** - Does the user own this resource?

---

## 📞 Nigerian-Context Considerations

Building for Nigeria means:

- **OTP via SMS** - Use Termii, Infobip, or AfricasTalking (abstracted)
- **BVN/NIN Verification** - Use Smile Identity, Dojah, or Prembly (abstracted)
- **Payment** - Paystack or Flutterwave (abstracted)
- **Phone number format** - +234 validation
- **Intermittent connectivity** - Offline-first considerations for CBT
- **Multi-tenant** - One platform, hundreds of schools

---

## 🧩 How to Use These Docs

1. Read each day's markdown **before** you code
2. Every code snippet has an explanation above it
3. Look for these markers:
   - 💡 **WHY** - Explains the reasoning
   - ⚠️ **BEGINNER MISTAKE** - Common mistakes to avoid
   - 🏆 **BEST PRACTICE** - Senior engineer patterns
   - 🔍 **DEEP DIVE** - Extra detail for curious minds

---

## 🚀 Quick Start (After Reading Day 1)

```bash
# Install pnpm globally
npm install -g pnpm

# Install Turborepo globally
npm install -g turbo

# Clone and setup
git init edusaas
cd edusaas
pnpm init

# Start Day 1!
```

---

_Built with ❤️ for Nigerian students learning world-class engineering._
