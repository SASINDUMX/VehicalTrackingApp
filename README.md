# 🚗 Vehicle Tracking System

A full-stack, real-time automotive workshop vehicle tracking and station management application Built with React Native & Expo for web, mobile, and Progressive Web App (PWA) standalone deployment.

---

## 🏛️ Architecture & Separation of Concerns

The application strictly enforces **Separation of Concerns (SoC)** and **Feature-Driven Modular Architecture**:

```
UnitedMoters-VehicalTrackingApp/
├── App.tsx                          # Root Gate, Safe Area, and Auth Gate
├── CODEBASE_ARCHITECTURE_RULES.md   # Architectural & coding standards
├── supabase_schema.sql              # PostgreSQL tables, RPCs, & RLS policies
└── src/
    ├── components/                  # Pure UI Presentation Components (No direct business logic)
    │   ├── advisor/                 # Advisor Inspection & Final Handover View
    │   ├── auth/                    # Login Screen & Error Banners
    │   ├── layout/                  # Header, SearchBarRow, SegmentedTabs, RoleSwitcher
    │   ├── shared/                  # LicensePlate, EmptyStateCard, TimerPill, Modals
    │   ├── supervisor/              # 2D Workshop Floor Map & AddVehicleModal
    │   └── technician/              # Station Views, Action Confirmation Modals
    ├── constants/                   # Design tokens & domain mappings
    │   ├── theme.ts                 # Theme Colors, Spacing, Typography tokens
    │   └── bays.ts                  # Bay definitions, Station colors, & Role mappings
    ├── context/                     # Global State & Realtime Communication
    │   ├── AuthContext.tsx          # Supabase Auth session & profile management
    │   └── VehicleContext.tsx       # Live vehicle state, CDC realtime & 3-tier fallback
    ├── hooks/                       # Business Logic, Computed State & Action Handlers
    │   ├── useFloorPlan.ts          # Floor plan spatial logic & telemetry filters
    │   ├── useTechnicianStation.ts  # Station queues, dispatch flow & timer map
    │   ├── useAdvisorInspection.ts  # Final delivery queue & inspection actions
    │   ├── usePermissions.ts        # Fine-grained role capability guards
    │   └── useElapsedTimer.ts       # Net working time stopwatch engine
    ├── lib/                         # External Services & Hardware Integrations
    │   ├── chime.ts                 # Web Audio API synthetic dual-tone alerts
    │   ├── haptics.ts               # Native cross-platform vibration patterns
    │   └── supabase.ts              # Supabase client singleton & safeStorage
    ├── types/                       # TypeScript Domain Models
    │   └── vehicle.ts               # Vehicle, Task, BayZone, UserRole schemas
    └── utils/                       # Pure Functional Reusable Utilities
        ├── vehicleNumberUtils.ts    # Sri Lanka plate auto-formatting & validation
        ├── workshopHoursUtils.ts    # Scheduled break overlap & net hours calculations
        ├── vehicleUtils.ts          # Stage duration breakdowns & progress metrics
        └── searchUtils.ts           # Plate normalization & fuzzy search filter
```

---

## 📐 Key Design Patterns & Engineering Principles

### 1. UI Doesn't Own Logic (Container/Hook Pattern)
- **UI Components** (`FloorPlan2D`, `TechnicianStationView`, `AdvisorInspectionView`, `AddVehicleModal`) are strictly presentational.
- **Custom Hooks** (`useFloorPlan`, `useTechnicianStation`, etc.) encapsulate all filtering, timer intervals, confirmation dialog states, and mutation calls.

### 2. 3-Tier Database Mutation & RPC Fallback
1. **0ms Optimistic UI Update**: Screen updates instantly with snapshot rollback protection.
2. **Atomic PostgreSQL RPC**: Calls server-side transactional stored procedures (`transfer_vehicle_zone`, `toggle_task_completion`, `finish_vehicle_job`).
3. **Direct Table Fallback**: If RPC fails, automatically attempts direct table mutations.
4. **Auto-Rollback**: Reverts local state and presents a non-intrusive alert if network/server is unreachable.

### 3. Hardware Integration (Zero External Assets)
- **Audio Chimes** (`src/lib/chime.ts`): Synthesized sine-wave dual tone (`659.25Hz -> 880Hz`) via browser Web Audio API with zero audio file download footprint.
- **Haptic Vibration** (`src/lib/haptics.ts`): Distinct vibration patterns for bay arrival alerts (`[200ms, 100ms, 200ms, 100ms, 450ms]`), task clicks (`80ms`), and job completions.

### 4. Workshop Break Hours System (Sri Lanka Standard Time)
Automatically calculates productive **Net Working Time** by deducting scheduled breaks:
- **Morning Tea**: `09:45 AM – 10:00 AM` (15 mins)
- **Lunch Break**: `12:30 PM – 01:00 PM` (30 mins)
- **Evening Tea**: `02:45 PM – 03:00 PM` (15 mins)

---

## 🔒 Role Permission Matrix

| Feature / Action | Supervisor | Tech 1 (Workshop) | Tech 2 (Hoist) | Tech 3 (Alignment) | Service Advisor |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Add Vehicle & Dispatch** | ✅ YES | ❌ NO | ❌ NO | ❌ NO | ❌ NO |
| **Edit Job Order / Relocate** | ✅ YES | ❌ NO | ❌ NO | ❌ NO | ❌ NO |
| **Workshop Bay Tasks** | ❌ Read-Only | ✅ YES | ❌ NO | ❌ NO | ❌ NO |
| **Hoist Bay Tasks** | ❌ Read-Only | ❌ NO | ✅ YES | ❌ NO | ❌ NO |
| **Alignment Bay Tasks** | ❌ Read-Only | ❌ NO | ❌ NO | ✅ YES | ❌ NO |
| **Transfer to Next Bay** | ❌ Read-Only | ✅ Workshop | ✅ Hoist | ✅ Alignment | ❌ NO |
| **Finish Job & Handover** | ❌ Read-Only | ❌ NO | ❌ NO | ❌ NO | ✅ Advisor Only |

---

## 🇱🇰 Vehicle Registration Number Validation Rules

- **Vintage / Provincial Numbers**: `##-####` (e.g. `14-1234`, `64-9842`). Auto-hyphens after 2 numbers.
- **Modern Letter Numbers**: `AA-####` or `AAA-####` (e.g. `WP-1234`, `CAB-7712`). Auto-hyphens after 3 letters or when a number follows 2 letters.
- **Active Duplicate Prevention**: Automatically blocks duplicate active entries in real-time.

---

## 🚀 Deployment & CI/CD

- **Framework**: Expo (React Native Web)
- **Hosting**: Vercel Global Edge CDN
- **PWA Capabilities**: Standalone mobile home-screen installation with iOS/Android full-screen meta tags.
- **Automated Pipeline**: Every `git push origin main` triggers CI verification and zero-downtime CD rollout.
