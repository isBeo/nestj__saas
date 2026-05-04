# 📅 Day 6 — Next.js Frontend: App Router, Auth UI, Dashboard & Protected Routes
### EduSaas Nigeria | Modern React with TypeScript

---

## 🎯 Day 6 Goals
- [ ] Understand Next.js App Router deeply
- [ ] Configure Axios with interceptors
- [ ] Build the Auth store with Zustand
- [ ] Build Login page with device fingerprinting
- [ ] Build Security Recovery UI (device conflict flow)
- [ ] Build protected route middleware
- [ ] Build the Dashboard shell with role-based navigation
- [ ] Build Students list with pagination and search
- [ ] Set up React Query for server state
- [ ] Connect WebSocket for real-time notifications

---

## 🧠 Concept: App Router Mental Model

Next.js App Router changed how we think about React. Before diving into code, nail this mental model:

```
Every file in app/ is either:
  ├── page.tsx      → A ROUTE (renders a page at that URL)
  ├── layout.tsx    → A WRAPPER (wraps all pages below it)
  ├── loading.tsx   → SHOWN while page.tsx is loading
  ├── error.tsx     → SHOWN when page.tsx throws
  └── not-found.tsx → SHOWN for 404s

Every component is either:
  ├── Server Component (DEFAULT) → Runs on server, no hooks, faster
  └── Client Component ('use client') → Runs in browser, can use hooks
```

### When to use Server vs Client Components

```typescript
// ✅ USE SERVER COMPONENT when:
// - Fetching data (can go straight to DB or API)
// - No interactivity needed (just displaying data)
// - SEO matters (search engines see the HTML)

// apps/web/src/app/dashboard/students/page.tsx
async function StudentsPage() {
  // This runs on the SERVER — no useEffect, no loading state needed
  const students = await fetch(`${process.env.API_URL}/students`);
  return <StudentsList students={students} />;
}

// ✅ USE CLIENT COMPONENT when:
// - Using useState, useEffect, useCallback
// - Event handlers (onClick, onChange)
// - Browser APIs (localStorage, window)
// - Real-time updates (WebSocket)

'use client';
function LoginForm() {
  const [email, setEmail] = useState('');
  // ...
}
```

💡 **Rule of Thumb**: Start with Server Components. Only add `'use client'` when you hit a wall (need hooks or event handlers). This keeps your bundle small and your pages fast.

---

## 🧠 Concept: Route Groups

```
app/
├── (auth)/              ← Route GROUP — the () means no URL impact
│   ├── layout.tsx       → Auth layout (centered card, no nav)
│   ├── login/page.tsx   → /login
│   └── register/page.tsx→ /register
├── (dashboard)/         ← Route GROUP — protected area
│   ├── layout.tsx       → Dashboard layout (sidebar + header)
│   ├── page.tsx         → /  (redirects to /dashboard)
│   └── dashboard/
│       └── page.tsx     → /dashboard
```

Route groups let you share layouts without affecting URLs. The `(auth)` folder applies the auth-specific centered layout to login and register pages — without making the URL `/auth/login`.

---

## 📁 Complete Folder Structure

```
apps/web/src/
├── app/
│   ├── globals.css
│   ├── layout.tsx                    ← Root layout (providers)
│   ├── (auth)/
│   │   ├── layout.tsx                ← Centered auth card layout
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── register/
│   │   │   └── page.tsx
│   │   └── verify-email/
│   │       └── page.tsx
│   └── (dashboard)/
│       ├── layout.tsx                ← Dashboard shell (sidebar)
│       ├── dashboard/
│       │   └── page.tsx
│       ├── students/
│       │   ├── page.tsx              ← Students list
│       │   └── [id]/page.tsx         ← Student detail
│       ├── teachers/
│       │   └── page.tsx
│       ├── results/
│       │   └── page.tsx
│       └── settings/
│           └── page.tsx
├── components/
│   ├── ui/                           ← shadcn/ui components
│   ├── shared/
│   │   ├── PageHeader.tsx
│   │   ├── DataTable.tsx
│   │   ├── Pagination.tsx
│   │   ├── SearchInput.tsx
│   │   ├── StatusBadge.tsx
│   │   └── LoadingSpinner.tsx
│   └── features/
│       ├── auth/
│       │   ├── LoginForm.tsx
│       │   ├── DeviceConflictModal.tsx
│       │   └── SecurityRecoveryForm.tsx
│       ├── students/
│       │   ├── StudentCard.tsx
│       │   ├── EnrollStudentForm.tsx
│       │   └── StudentFilters.tsx
│       └── dashboard/
│           ├── StatsCard.tsx
│           ├── Sidebar.tsx
│           └── Header.tsx
├── hooks/
│   ├── useAuth.ts
│   ├── useStudents.ts
│   ├── useWebSocket.ts
│   └── useDebounce.ts
├── lib/
│   ├── axios.ts                      ← Configured Axios instance
│   ├── queryClient.ts                ← React Query setup
│   └── utils.ts                      ← cn(), formatDate(), etc.
├── services/
│   ├── auth.service.ts
│   ├── students.service.ts
│   ├── teachers.service.ts
│   └── results.service.ts
├── store/
│   └── auth.store.ts                 ← Zustand auth state
├── types/
│   └── index.ts
└── middleware.ts                     ← Route protection
```

---

## ⚙️ Step 1 — Root Layout & Providers

```typescript
// apps/web/src/app/layout.tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'sonner';
import { Providers } from '@/components/shared/Providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    template: '%s | EduSaas Nigeria',
    default: 'EduSaas Nigeria — School Management System',
  },
  description: 'Modern school management for Nigerian schools',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>
          {children}
          <Toaster position="top-right" richColors />
        </Providers>
      </body>
    </html>
  );
}
```

```typescript
// apps/web/src/components/shared/Providers.tsx
'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ThemeProvider } from 'next-themes';
import { queryClient } from '@/lib/queryClient';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
        {children}
        {/* Shows React Query cache in dev — remove in prod */}
        {process.env.NODE_ENV === 'development' && (
          <ReactQueryDevtools initialIsOpen={false} />
        )}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
```

---

## 🌐 Step 2 — Axios Instance with Interceptors

```typescript
// apps/web/src/lib/axios.ts
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/store/auth.store';
import { getDeviceId } from '@/lib/device';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export const apiClient = axios.create({
  baseURL: `${API_URL}/v1`,
  timeout: 15000,         // 15 second timeout
  withCredentials: true,  // Send cookies
  headers: {
    'Content-Type': 'application/json',
  },
});

// ─── REQUEST INTERCEPTOR ─────────────────────────────────────
// Runs before EVERY request — attach token and device ID
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = useAuthStore.getState().accessToken;

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Always send device ID so server can validate session
    config.headers['x-device-id'] = getDeviceId();

    return config;
  },
  (error) => Promise.reject(error),
);

// ─── RESPONSE INTERCEPTOR ────────────────────────────────────
// Runs after EVERY response — handle token refresh and errors

let isRefreshing = false;
// Queue of failed requests waiting for token refresh
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: any) => void;
}> = [];

function processQueue(error: any, token: string | null = null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token!);
  });
  failedQueue = [];
}

apiClient.interceptors.response.use(
  // Success — pass through
  (response) => response,

  // Error — handle smartly
  async (error: AxiosError<any>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // ─── 401 Unauthorized — try token refresh ───────────────
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Another refresh is in progress — queue this request
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return apiClient(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = useAuthStore.getState().refreshToken;
        const { data } = await axios.post(`${API_URL}/v1/auth/refresh`, {
          refreshToken,
        });

        const newToken = data.data.accessToken;
        useAuthStore.getState().setTokens(newToken, data.data.refreshToken);

        processQueue(null, newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;

        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        // Refresh failed — logout
        useAuthStore.getState().logout();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // ─── 403 Device Conflict ─────────────────────────────────
    if (
      error.response?.status === 403 &&
      error.response?.data?.message === 'DEVICE_CONFLICT'
    ) {
      // Emit a custom event — the UI listens and shows the recovery modal
      window.dispatchEvent(
        new CustomEvent('device:conflict', {
          detail: error.response.data,
        }),
      );
    }

    return Promise.reject(error);
  },
);
```

💡 **WHY the refresh queue?**: If 3 API calls fail simultaneously with 401, without a queue you'd fire 3 refresh requests. With the queue, only 1 refresh fires, and the other 2 wait in line to reuse the new token. This is a real production pattern called **request deduplication**.

---

## 🗄️ Step 3 — Zustand Auth Store

```typescript
// apps/web/src/store/auth.store.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'SUPER_ADMIN' | 'SCHOOL_ADMIN' | 'TEACHER' | 'STUDENT' | 'PARENT';
  schoolId?: string;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;

  // Actions
  setAuth: (user: AuthUser, accessToken: string, refreshToken: string) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      setAuth: (user, accessToken, refreshToken) =>
        set({ user, accessToken, refreshToken, isAuthenticated: true }),

      setTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken }),

      logout: () =>
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        }),
    }),
    {
      name: 'edusaas-auth',           // localStorage key
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Only persist these fields — don't persist functions
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
```

---

## 🔑 Step 4 — Auth Service

```typescript
// apps/web/src/services/auth.service.ts
import { apiClient } from '@/lib/axios';
import { getDeviceId, getDeviceName } from '@/lib/device';

export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    schoolId?: string;
  };
}

export interface RecoveryPayload {
  email: string;
  nin?: string;
  bvn?: string;
  firstName: string;
  lastName: string;
}

export const authService = {
  async login(payload: LoginPayload): Promise<LoginResponse> {
    const { data } = await apiClient.post('/auth/login', {
      ...payload,
      deviceId: getDeviceId(),
      deviceName: getDeviceName(),
    });
    return data.data;
  },

  async register(payload: any) {
    const { data } = await apiClient.post('/auth/register', payload);
    return data.data;
  },

  async logout() {
    await apiClient.post('/auth/logout');
  },

  async verifyEmail(email: string, otp: string) {
    const { data } = await apiClient.post('/auth/verify-email', {
      email, otp, purpose: 'EMAIL_VERIFY',
    });
    return data;
  },

  async forgotPassword(email: string) {
    const { data } = await apiClient.post('/auth/forgot-password', { email });
    return data;
  },

  async resetPassword(email: string, otp: string, newPassword: string) {
    const { data } = await apiClient.post('/auth/reset-password', {
      email, otp, newPassword,
    });
    return data;
  },

  async initiateSecurityRecovery(payload: RecoveryPayload) {
    const { data } = await apiClient.post('/auth/security-recovery', {
      ...payload,
      deviceId: getDeviceId(),
      deviceName: getDeviceName(),
    });
    return data.data;
  },
};
```

---

## 🛡️ Step 5 — Middleware (Route Protection)

```typescript
// apps/web/src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that don't need authentication
const PUBLIC_ROUTES = ['/login', '/register', '/verify-email', '/forgot-password'];

// Routes mapped to the minimum role required
const ROLE_ROUTES: Record<string, string[]> = {
  '/dashboard/schools': ['SUPER_ADMIN'],
  '/dashboard/settings': ['SCHOOL_ADMIN', 'SUPER_ADMIN'],
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Allow Next.js internals and static files
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Check for auth token in cookies
  // NOTE: We store a "session" cookie on login (httpOnly from server)
  // For client-side stores we read from a cookie set by the client
  const token = request.cookies.get('edusaas-token')?.value;

  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname); // Remember where they were going
    return NextResponse.redirect(loginUrl);
  }

  // Role-based route protection
  const userRole = request.cookies.get('edusaas-role')?.value;

  for (const [route, allowedRoles] of Object.entries(ROLE_ROUTES)) {
    if (pathname.startsWith(route) && userRole && !allowedRoles.includes(userRole)) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  // Run middleware on all routes except static files
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

---

## 🔐 Step 6 — Login Page

```typescript
// apps/web/src/app/(auth)/layout.tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 
                    flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-lg">E</span>
            </div>
            <span className="text-2xl font-bold text-gray-900">EduSaas</span>
          </div>
          <p className="text-gray-500 text-sm">Nigeria's School Management Platform</p>
        </div>
        {children}
      </div>
    </div>
  );
}
```

```typescript
// apps/web/src/app/(auth)/login/page.tsx
import type { Metadata } from 'next';
import { LoginForm } from '@/components/features/auth/LoginForm';

export const metadata: Metadata = { title: 'Login' };

export default function LoginPage() {
  // Server Component — just renders the client form
  return <LoginForm />;
}
```

```typescript
// apps/web/src/components/features/auth/LoginForm.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Eye, EyeOff, Loader2, LogIn } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { authService } from '@/services/auth.service';
import { DeviceConflictModal } from './DeviceConflictModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [deviceConflict, setDeviceConflict] = useState<{
    show: boolean;
    email: string;
    existingDevice: string;
  } | null>(null);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  // Listen for device conflict events from Axios interceptor
  useEffect(() => {
    const handleDeviceConflict = (event: CustomEvent) => {
      setDeviceConflict({
        show: true,
        email: getValues('email'),
        existingDevice: event.detail.existingDevice || 'another device',
      });
    };

    window.addEventListener('device:conflict', handleDeviceConflict as EventListener);
    return () =>
      window.removeEventListener('device:conflict', handleDeviceConflict as EventListener);
  }, [getValues]);

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      const result = await authService.login(data);

      // Save to Zustand store (persisted to localStorage)
      setAuth(result.user as any, result.accessToken, result.refreshToken);

      // Also set cookies for middleware to read
      document.cookie = `edusaas-token=${result.accessToken}; path=/; max-age=900`;
      document.cookie = `edusaas-role=${result.user.role}; path=/; max-age=900`;

      toast.success(`Welcome back, ${result.user.firstName}!`);

      // Redirect to where they were trying to go, or dashboard
      const from = searchParams.get('from') || '/dashboard';
      router.push(from);
      router.refresh(); // Clear any cached server components

    } catch (error: any) {
      const message = error?.response?.data?.message;

      // Device conflict is handled by the event listener above
      if (error?.response?.data?.code === 'DEVICE_CONFLICT') return;

      if (message === 'Please verify your email before logging in') {
        toast.error(message, {
          action: {
            label: 'Verify Now',
            onClick: () => router.push(`/verify-email?email=${getValues('email')}`),
          },
        });
      } else {
        toast.error(message || 'Login failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Card className="shadow-xl border-0">
        <CardHeader className="space-y-1 pb-4">
          <CardTitle className="text-2xl font-bold text-center">Welcome back</CardTitle>
          <CardDescription className="text-center">
            Sign in to your EduSaas account
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@school.edu.ng"
                autoComplete="email"
                {...register('email')}
                className={errors.email ? 'border-red-500' : ''}
              />
              {errors.email && (
                <p className="text-sm text-red-500">{errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="password">Password</Label>
                <a
                  href="/forgot-password"
                  className="text-sm text-indigo-600 hover:underline"
                >
                  Forgot password?
                </a>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  {...register('password')}
                  className={errors.password ? 'border-red-500 pr-10' : 'pr-10'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400
                             hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && (
                <p className="text-sm text-red-500">{errors.password.message}</p>
              )}
            </div>

            {/* Submit */}
            <Button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-700"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn className="mr-2 h-4 w-4" />
                  Sign in
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Device Conflict Modal */}
      {deviceConflict && (
        <DeviceConflictModal
          email={deviceConflict.email}
          existingDevice={deviceConflict.existingDevice}
          onClose={() => setDeviceConflict(null)}
          onRecoverySuccess={() => {
            setDeviceConflict(null);
            // Re-attempt login after recovery
            handleSubmit(onSubmit)();
          }}
        />
      )}
    </>
  );
}
```

---

## 🔒 Step 7 — Device Conflict Modal

```typescript
// apps/web/src/components/features/auth/DeviceConflictModal.tsx
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { AlertTriangle, Shield, Loader2 } from 'lucide-react';
import { authService } from '@/services/auth.service';
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

const recoverySchema = z.object({
  firstName: z.string().min(1, 'Required'),
  lastName: z.string().min(1, 'Required'),
  verificationType: z.enum(['nin', 'bvn']),
  nin: z.string().optional(),
  bvn: z.string().optional(),
}).refine((data) => {
  if (data.verificationType === 'nin') return !!data.nin && data.nin.length === 11;
  if (data.verificationType === 'bvn') return !!data.bvn && data.bvn.length === 11;
  return false;
}, {
  message: 'Provide a valid 11-digit NIN or BVN',
  path: ['nin'],
});

type RecoveryFormData = z.infer<typeof recoverySchema>;

interface Props {
  email: string;
  existingDevice: string;
  onClose: () => void;
  onRecoverySuccess: () => void;
}

export function DeviceConflictModal({
  email, existingDevice, onClose, onRecoverySuccess,
}: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<'warning' | 'verify'>('warning');

  const { register, handleSubmit, watch, formState: { errors } } =
    useForm<RecoveryFormData>({
      resolver: zodResolver(recoverySchema),
      defaultValues: { verificationType: 'nin' },
    });

  const verificationType = watch('verificationType');

  const onSubmit = async (data: RecoveryFormData) => {
    setIsLoading(true);
    try {
      await authService.initiateSecurityRecovery({
        email,
        firstName: data.firstName,
        lastName: data.lastName,
        nin: data.verificationType === 'nin' ? data.nin : undefined,
        bvn: data.verificationType === 'bvn' ? data.bvn : undefined,
      });

      toast.success('Identity verified! Old session terminated. Logging you in...');
      onRecoverySuccess();
    } catch (error: any) {
      const message = error?.response?.data?.message;
      toast.error(message || 'Verification failed. Check your details and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        {step === 'warning' ? (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>
                <DialogTitle>Account Active on Another Device</DialogTitle>
              </div>
              <DialogDescription className="text-left space-y-2">
                <p>
                  Your account is currently active on{' '}
                  <span className="font-semibold text-gray-900">{existingDevice}</span>.
                </p>
                <p>
                  To continue on this device, you must verify your identity.
                  This will terminate the existing session.
                </p>
              </DialogDescription>
            </DialogHeader>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              ⚠️ If you did not initiate the other session, someone else may have 
              access to your account. Proceed with caution.
            </div>

            <div className="flex gap-3 mt-2">
              <Button variant="outline" onClick={onClose} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={() => setStep('verify')}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700"
              >
                <Shield className="w-4 h-4 mr-2" />
                Verify Identity
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                  <Shield className="w-5 h-5 text-indigo-600" />
                </div>
                <DialogTitle>Identity Verification</DialogTitle>
              </div>
              <DialogDescription>
                Provide your details to confirm you are the account owner.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>First Name</Label>
                  <Input placeholder="Chidi" {...register('firstName')} />
                  {errors.firstName && (
                    <p className="text-xs text-red-500">{errors.firstName.message}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Last Name</Label>
                  <Input placeholder="Okonkwo" {...register('lastName')} />
                  {errors.lastName && (
                    <p className="text-xs text-red-500">{errors.lastName.message}</p>
                  )}
                </div>
              </div>

              {/* Verification Type */}
              <div className="space-y-2">
                <Label>Verification Method</Label>
                <RadioGroup
                  defaultValue="nin"
                  className="flex gap-4"
                  {...register('verificationType')}
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="nin" id="nin" />
                    <Label htmlFor="nin" className="cursor-pointer">NIN</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="bvn" id="bvn" />
                    <Label htmlFor="bvn" className="cursor-pointer">BVN</Label>
                  </div>
                </RadioGroup>
              </div>

              {verificationType === 'nin' ? (
                <div className="space-y-1">
                  <Label>NIN (11 digits)</Label>
                  <Input
                    placeholder="12345678901"
                    maxLength={11}
                    {...register('nin')}
                  />
                </div>
              ) : (
                <div className="space-y-1">
                  <Label>BVN (11 digits)</Label>
                  <Input
                    placeholder="12345678901"
                    maxLength={11}
                    {...register('bvn')}
                  />
                </div>
              )}
              {errors.nin && (
                <p className="text-xs text-red-500">{errors.nin.message}</p>
              )}

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep('warning')}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    'Verify & Continue'
                  )}
                </Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

---

## 🏠 Step 8 — Dashboard Layout

```typescript
// apps/web/src/app/(dashboard)/layout.tsx
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { Sidebar } from '@/components/features/dashboard/Sidebar';
import { Header } from '@/components/features/dashboard/Header';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side auth check (belt AND suspenders alongside middleware)
  const cookieStore = cookies();
  const token = cookieStore.get('edusaas-token');

  if (!token) redirect('/login');

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
```

```typescript
// apps/web/src/components/features/dashboard/Sidebar.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, GraduationCap, BookOpen,
  ClipboardList, FileText, Bell, Settings,
  ChevronLeft, Building2, CreditCard,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  roles: string[];
  badge?: number;
}

const navItems: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    roles: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'PARENT'],
  },
  {
    label: 'Schools',
    href: '/dashboard/schools',
    icon: Building2,
    roles: ['SUPER_ADMIN'],
  },
  {
    label: 'Students',
    href: '/dashboard/students',
    icon: GraduationCap,
    roles: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER'],
  },
  {
    label: 'Teachers',
    href: '/dashboard/teachers',
    icon: Users,
    roles: ['SUPER_ADMIN', 'SCHOOL_ADMIN'],
  },
  {
    label: 'Subjects',
    href: '/dashboard/subjects',
    icon: BookOpen,
    roles: ['SCHOOL_ADMIN', 'TEACHER'],
  },
  {
    label: 'Exams / CBT',
    href: '/dashboard/exams',
    icon: ClipboardList,
    roles: ['SCHOOL_ADMIN', 'TEACHER', 'STUDENT'],
  },
  {
    label: 'Results',
    href: '/dashboard/results',
    icon: FileText,
    roles: ['SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'PARENT'],
  },
  {
    label: 'Billing',
    href: '/dashboard/billing',
    icon: CreditCard,
    roles: ['SCHOOL_ADMIN', 'PARENT'],
  },
  {
    label: 'Notifications',
    href: '/dashboard/notifications',
    icon: Bell,
    roles: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'PARENT'],
  },
  {
    label: 'Settings',
    href: '/dashboard/settings',
    icon: Settings,
    roles: ['SUPER_ADMIN', 'SCHOOL_ADMIN'],
  },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);

  const visibleItems = navItems.filter(
    (item) => user && item.roles.includes(user.role),
  );

  return (
    <aside
      className={cn(
        'flex flex-col bg-gray-900 text-white transition-all duration-300 ease-in-out',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">E</span>
            </div>
            <span className="font-bold text-lg">EduSaas</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-lg hover:bg-gray-700 transition-colors ml-auto"
        >
          <ChevronLeft
            className={cn(
              'w-4 h-4 transition-transform duration-300',
              collapsed && 'rotate-180',
            )}
          />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {visibleItems.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium',
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white',
                collapsed && 'justify-center px-2',
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
              {!collapsed && item.badge && (
                <span className="ml-auto bg-red-500 text-white text-xs rounded-full
                                 w-5 h-5 flex items-center justify-center">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User info at bottom */}
      {user && !collapsed && (
        <div className="p-4 border-t border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center text-sm font-bold">
              {user.firstName[0]}{user.lastName[0]}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-xs text-gray-400 truncate">{user.role}</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
```

---

## 📊 Step 9 — Dashboard Home Page

```typescript
// apps/web/src/app/(dashboard)/dashboard/page.tsx
import type { Metadata } from 'next';
import { GraduationCap, Users, FileText, CreditCard } from 'lucide-react';
import { StatsCard } from '@/components/features/dashboard/StatsCard';
import { PageHeader } from '@/components/shared/PageHeader';

export const metadata: Metadata = { title: 'Dashboard' };

// This is a Server Component — it can fetch data directly
export default async function DashboardPage() {
  // In production, fetch real data from your API
  // using a server-side fetch with the session token
  const stats = {
    totalStudents: 1247,
    totalTeachers: 48,
    pendingResults: 12,
    overdueInvoices: 5,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Welcome back. Here's what's happening in your school today."
      />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Total Students"
          value={stats.totalStudents.toLocaleString()}
          icon={GraduationCap}
          trend={{ value: 5.2, label: 'vs last term' }}
          color="blue"
        />
        <StatsCard
          title="Teaching Staff"
          value={stats.totalTeachers.toString()}
          icon={Users}
          color="green"
        />
        <StatsCard
          title="Pending Results"
          value={stats.pendingResults.toString()}
          icon={FileText}
          trend={{ value: -3, label: 'vs yesterday' }}
          color="amber"
        />
        <StatsCard
          title="Overdue Invoices"
          value={stats.overdueInvoices.toString()}
          icon={CreditCard}
          color="red"
        />
      </div>
    </div>
  );
}
```

```typescript
// apps/web/src/components/features/dashboard/StatsCard.tsx
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatsCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  color: 'blue' | 'green' | 'amber' | 'red';
  trend?: { value: number; label: string };
}

const colorMap = {
  blue:  { bg: 'bg-blue-50',  icon: 'bg-blue-100 text-blue-600',  text: 'text-blue-600' },
  green: { bg: 'bg-green-50', icon: 'bg-green-100 text-green-600', text: 'text-green-600' },
  amber: { bg: 'bg-amber-50', icon: 'bg-amber-100 text-amber-600', text: 'text-amber-600' },
  red:   { bg: 'bg-red-50',   icon: 'bg-red-100 text-red-600',     text: 'text-red-600' },
};

export function StatsCard({ title, value, icon: Icon, color, trend }: StatsCardProps) {
  const colors = colorMap[color];
  const isPositive = trend && trend.value > 0;

  return (
    <div className={cn('rounded-xl p-5 border border-gray-100 bg-white shadow-sm')}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
          {trend && (
            <div className={cn(
              'flex items-center gap-1 mt-2 text-xs font-medium',
              isPositive ? 'text-green-600' : 'text-red-500',
            )}>
              {isPositive
                ? <TrendingUp className="w-3.5 h-3.5" />
                : <TrendingDown className="w-3.5 h-3.5" />
              }
              <span>{Math.abs(trend.value)}% {trend.label}</span>
            </div>
          )}
        </div>
        <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', colors.icon)}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}
```

---

## 👨‍🎓 Step 10 — Students List Page with React Query

```typescript
// apps/web/src/services/students.service.ts
import { apiClient } from '@/lib/axios';

export interface Student {
  id: string;
  admissionNumber: string;
  isActive: boolean;
  user: {
    firstName: string; lastName: string;
    email: string; avatar?: string; gender: string;
  };
  classroom: { name: string; level: string };
}

export interface StudentsResponse {
  data: Student[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export const studentsService = {
  async getAll(params: {
    page?: number; limit?: number; search?: string; classroomId?: string;
  }): Promise<StudentsResponse> {
    const { data } = await apiClient.get('/students', { params });
    return data.data;
  },

  async getById(id: string): Promise<Student> {
    const { data } = await apiClient.get(`/students/${id}`);
    return data.data;
  },

  async enroll(payload: any) {
    const { data } = await apiClient.post('/students/enroll', payload);
    return data;
  },
};
```

```typescript
// apps/web/src/hooks/useStudents.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { studentsService } from '@/services/students.service';
import { toast } from 'sonner';

export function useStudents(params: {
  page?: number; limit?: number; search?: string; classroomId?: string;
}) {
  return useQuery({
    queryKey: ['students', params],  // Cache key — auto-invalidated when params change
    queryFn: () => studentsService.getAll(params),
    staleTime: 30_000,               // Data considered fresh for 30 seconds
    placeholderData: (prev) => prev, // Keep old data while fetching new (no loading flash)
  });
}

export function useStudent(id: string) {
  return useQuery({
    queryKey: ['students', id],
    queryFn: () => studentsService.getById(id),
    enabled: !!id,                   // Only run if id exists
  });
}

export function useEnrollStudent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: studentsService.enroll,
    onSuccess: () => {
      // Invalidate the students list so it refetches
      queryClient.invalidateQueries({ queryKey: ['students'] });
      toast.success('Student enrolled successfully!');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Enrollment failed');
    },
  });
}
```

```typescript
// apps/web/src/app/(dashboard)/students/page.tsx
import type { Metadata } from 'next';
import { StudentsList } from '@/components/features/students/StudentsList';
import { PageHeader } from '@/components/shared/PageHeader';

export const metadata: Metadata = { title: 'Students' };

export default function StudentsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Students"
        subtitle="Manage student enrollments and records"
      />
      {/* Client component handles the data fetching via React Query */}
      <StudentsList />
    </div>
  );
}
```

```typescript
// apps/web/src/components/features/students/StudentsList.tsx
'use client';

import { useState } from 'react';
import { Search, UserPlus, Filter } from 'lucide-react';
import { useStudents } from '@/hooks/useStudents';
import { useDebounce } from '@/hooks/useDebounce';
import { Pagination } from '@/components/shared/Pagination';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

export function StudentsList() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');

  // Debounce search — wait 400ms after user stops typing before querying
  const search = useDebounce(searchInput, 400);

  const { data, isLoading, isFetching } = useStudents({
    page,
    limit: 20,
    search: search || undefined,
  });

  const students = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search by name or admission number..."
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setPage(1); // Reset to page 1 on search
            }}
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="sm">
          <Filter className="w-4 h-4 mr-2" />
          Filter
        </Button>
        <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700">
          <UserPlus className="w-4 h-4 mr-2" />
          Enroll Student
        </Button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="font-semibold text-gray-900">
            {meta ? `${meta.total.toLocaleString()} students` : 'Students'}
          </h3>
          {isFetching && !isLoading && (
            <span className="text-xs text-gray-400">Refreshing...</span>
          )}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="divide-y">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-4">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : students.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-gray-500">No students found.</p>
            {search && (
              <p className="text-sm text-gray-400 mt-1">
                Try adjusting your search terms.
              </p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {students.map((student) => (
              <div
                key={student.id}
                className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50
                           transition-colors cursor-pointer"
              >
                <Avatar className="w-10 h-10">
                  <AvatarFallback className="bg-indigo-100 text-indigo-700 font-semibold text-sm">
                    {student.user.firstName[0]}{student.user.lastName[0]}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">
                    {student.user.firstName} {student.user.lastName}
                  </p>
                  <p className="text-sm text-gray-500 truncate">
                    {student.admissionNumber} · {student.classroom.name}
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <Badge variant={student.user.gender === 'MALE' ? 'secondary' : 'outline'}>
                    {student.user.gender}
                  </Badge>
                  <Badge variant={student.isActive ? 'default' : 'destructive'}>
                    {student.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="px-6 py-4 border-t">
            <Pagination
              currentPage={meta.page}
              totalPages={meta.totalPages}
              onPageChange={setPage}
            />
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## 🔌 Step 11 — WebSocket Hook

```typescript
// apps/web/src/hooks/useWebSocket.ts
'use client';

import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/auth.store';
import { getDeviceId } from '@/lib/device';

export function useWebSocket() {
  const socketRef = useRef<Socket | null>(null);
  const { accessToken, logout } = useAuthStore();

  const connect = useCallback(() => {
    if (!accessToken || socketRef.current?.connected) return;

    socketRef.current = io(`${process.env.NEXT_PUBLIC_WS_URL}/notifications`, {
      auth: { token: accessToken, deviceId: getDeviceId() },
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    const socket = socketRef.current;

    socket.on('connect', () => {
      console.log('🔌 WebSocket connected');
    });

    // ── Device terminated by another login ──────────────────
    socket.on('device:terminated', (data: { message: string; reason: string }) => {
      toast.error('Session Terminated', {
        description: data.message,
        duration: 10000,
        action: {
          label: 'Login Again',
          onClick: () => {
            logout();
            window.location.href = '/login';
          },
        },
      });

      // Auto-logout after 5 seconds
      setTimeout(() => {
        logout();
        window.location.href = '/login';
      }, 5000);
    });

    // ── General notifications ────────────────────────────────
    socket.on('notification:new', (data: {
      title: string; body: string; type: string;
    }) => {
      toast.info(data.title, { description: data.body });
    });

    socket.on('disconnect', (reason) => {
      console.log('🔌 WebSocket disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
      console.error('🔌 WebSocket error:', err.message);
    });
  }, [accessToken, logout]);

  useEffect(() => {
    connect();
    return () => {
      socketRef.current?.disconnect();
    };
  }, [connect]);

  return { socket: socketRef.current };
}
```

---

## 🔧 Step 12 — Utility Files

```typescript
// apps/web/src/lib/utils.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Merge Tailwind classes safely (handles conflicts)
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// apps/web/src/hooks/useDebounce.ts
import { useEffect, useState } from 'react';

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// apps/web/src/lib/queryClient.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,                    // Retry once on failure
      refetchOnWindowFocus: false, // Don't refetch when user tabs back
      staleTime: 30_000,           // Cache fresh for 30 seconds
    },
    mutations: {
      retry: 0,                    // Never retry mutations
    },
  },
});
```

---

## 📝 Day 6 Checklist

- [ ] Root layout with Providers (React Query, ThemeProvider)
- [ ] Axios instance with request interceptor (token + device ID)
- [ ] Axios response interceptor (token refresh queue + device conflict)
- [ ] Zustand auth store with localStorage persistence
- [ ] Auth service methods for all endpoints
- [ ] Next.js middleware for route protection
- [ ] Auth layout (centered card)
- [ ] Login form with React Hook Form + Zod
- [ ] Device Conflict Modal with 2-step flow
- [ ] Dashboard layout (collapsible sidebar + header)
- [ ] Role-based navigation in sidebar
- [ ] Dashboard home page with stats cards
- [ ] Students list with React Query, search, debounce, pagination
- [ ] WebSocket hook for real-time device notifications
- [ ] Utility hooks (useDebounce)

---

*Next: Day 7 — Docker, CI/CD, Testing & Production Deployment*
