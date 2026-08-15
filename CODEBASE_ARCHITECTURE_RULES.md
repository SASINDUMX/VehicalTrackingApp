# United Motors Vehicle Tracking — Codebase Architecture & Engineering Rules

This document establishes the official production-grade engineering standards, architectural patterns, and coding guidelines for the **United Motors Vehicle Tracking Application**. All contributors and AI agents must adhere to these rules to maintain a modular, scalable, and robust codebase.

---

## 🏛️ 1. Directory & Feature Structure

The project follows a **Feature-First Modular Architecture**:

```
UnitedMoters-VehicalTrackingApp/
├── App.tsx                          # Root entry & Auth/Vehicle provider gates
├── index.js                         # Expo registerRootComponent
├── app.json                         # Expo configuration
├── metro.config.js                  # Metro bundler resolver & polyfills
├── tsconfig.json                    # Strict Expo TypeScript configuration
├── CODEBASE_ARCHITECTURE_RULES.md   # Architectural standards & guidelines (this file)
└── src/
    ├── components/                  # Feature-organized UI components
    │   ├── advisor/                 # Advisor inspection & delivery screens
    │   ├── auth/                    # Login & authentication screens
    │   ├── layout/                  # Navigation bar, header, and layout shells
    │   ├── shared/                  # Cross-feature modals & reusable UI elements
    │   ├── supervisor/              # Floor plan map, telemetry radar, add vehicle screen
    │   └── technician/              # Tech station queues, stopwatch clocks, checklist matrix
    ├── constants/                   # Design tokens & business constants
    │   ├── theme.ts                 # Colors, Spacing, FontSize, Radius design tokens
    │   └── bays.ts                  # Bay zone definitions & helper utilities
    ├── context/                     # Application state providers
    │   ├── AuthContext.tsx           # Supabase Auth session & user profile state
    │   └── VehicleContext.tsx        # Vehicles state & Supabase Realtime channels
    ├── hooks/                       # Custom reusable React hooks
    │   └── usePermissions.ts        # Role-based action permission guards
    ├── lib/                         # External API clients & mock data
    │   ├── supabase.ts              # Supabase client singleton
    │   └── mockData.ts              # Offline fallback data
    └── types/                       # Centralized TypeScript domain models
        └── vehicle.ts               # Vehicle, Task, Bay, and UserRole types
```

### Rule 1.1: File Placement
- **DO NOT** create flat component files directly in `src/components/`.
- Every new component **MUST** be placed in its corresponding feature sub-folder (`layout`, `supervisor`, `technician`, `advisor`, `shared`, `auth`).

---

## 🎨 2. Design System & UI Discipline

### Rule 2.1: Design Tokens Only
- **NEVER** hardcode hex colors (e.g. `#123456`) or arbitrary pixel values in component inline styles.
- **ALWAYS** import and use design tokens from `src/constants/theme.ts`:
  ```typescript
  import { Colors, Spacing, FontSize, Radius } from '../../constants/theme';
  ```

### Rule 2.2: Scrollbar-Free UI Guarantee
- Standard browser/mobile scrollbars are forbidden in the UI.
- All `ScrollView` instances **MUST** set:
  ```tsx
  <ScrollView
    showsVerticalScrollIndicator={false}
    showsHorizontalScrollIndicator={false}
  >
  ```
- Web scrollbars are globally hidden via CSS rule injection in `App.tsx`.

### Rule 2.3: Sri Lankan License Plate Design
- All vehicle license plates **MUST** render using the standardized Sri Lankan plate component design (Yellow metallic background `#facc15`, blue left country bar with `🇱🇰` & `LK`, bold monospace plate text).

---

## 🔐 3. Authentication & Permission Guards

### Rule 3.1: Fine-Grained Action Guards
- All editing/action components **MUST** consume `usePermissions()`:
  ```typescript
  const { canAddVehicle, canMarkTaskDone, canTransferVehicle, canFinishJob } = usePermissions();
  ```
- Non-permitted action buttons **MUST NOT** be hidden abruptly (users must be able to view all screens). Instead, they **MUST** display a muted disabled state (`opacity: 0.4`, `disabled: true`).

---

## ⚡ 4. State & Realtime Synchronization

### Rule 4.1: Realtime Synchronization
- All database state mutations (`addVehicle`, `toggleTaskCompletion`, `transferVehicleZone`, `finishVehicleJobSheet`) must update both local React state and Supabase tables simultaneously.
- Realtime channels via `supabase.channel('public:vehicles')` must handle remote changes broadcast to connected client instances.

### Rule 4.2: Graceful Offline Fallback
- If Supabase connection fails or is absent, `VehicleContext` must gracefully fallback to `localStorage` (on web) or `INITIAL_MOCK_VEHICLES` so the app remains 100% operational in demo mode.

---

## 💻 5. TypeScript & Code Hygiene

### Rule 5.1: Strict Typing
- `any` is strictly prohibited unless handling unexpected third-party library errors.
- Props interfaces **MUST** be declared for every component.
- All domain types are exported from `src/types/vehicle.ts`.

### Rule 5.2: Environment Variables
- All client-side env vars **MUST** use the `EXPO_PUBLIC_` prefix (e.g. `EXPO_PUBLIC_SUPABASE_URL`) so Expo Metro bundler exposes them securely.
