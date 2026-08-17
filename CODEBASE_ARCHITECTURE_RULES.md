# United Motors Vehicle Tracking — Codebase Architecture & Engineering Rules

This document establishes the official production-grade engineering standards, architectural patterns, and coding guidelines for the **United Motors Vehicle Tracking Application**. All contributors and AI agents must adhere to these rules to maintain a modular, scalable, and robust codebase.

---

## 🏛️ 1. Directory & Feature Structure

The project follows a **Feature-First Modular Architecture**:

```
UnitedMoters-VehicalTrackingApp/
├── App.tsx                          # Root entry & Auth/Vehicle provider gates
├── README.md                        # Project overview & architectural guide
├── CODEBASE_ARCHITECTURE_RULES.md   # Architectural standards & guidelines (this file)
├── supabase_schema.sql              # PostgreSQL tables, RPCs, & RLS policies
└── src/
    ├── components/                  # Feature-organized UI presentation components
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
    │   ├── AuthContext.tsx          # Supabase Auth session & user profile state
    │   └── VehicleContext.tsx       # Vehicles state & Supabase Realtime channels
    ├── hooks/                       # Custom reusable React hooks (Business Logic Layer)
    │   ├── useFloorPlan.ts          # Floor plan spatial logic & telemetry filters
    │   ├── useTechnicianStation.ts  # Station queues, dispatch flow & timer map
    │   ├── useAdvisorInspection.ts  # Final delivery queue & inspection actions
    │   ├── usePermissions.ts        # Role-based action permission guards
    │   └── useElapsedTimer.ts       # Net working time stopwatch engine
    ├── lib/                         # External API clients & hardware services
    │   ├── chime.ts                 # Web Audio API synthetic dual-tone alerts
    │   ├── haptics.ts               # Native cross-platform vibration patterns
    │   ├── supabase.ts              # Supabase client singleton & safeStorage
    │   └── mockData.ts              # Offline fallback data
    ├── types/                       # Centralized TypeScript domain models
    │   └── vehicle.ts               # Vehicle, Task, Bay, and UserRole types
    └── utils/                       # Pure Functional Reusable Utilities
        ├── vehicleNumberUtils.ts    # Sri Lanka plate auto-formatting & validation
        ├── workshopHoursUtils.ts    # Scheduled break overlap & net hours calculations
        ├── vehicleUtils.ts          # Stage duration breakdowns & progress metrics
        └── searchUtils.ts           # Plate normalization & fuzzy search filter
```

### Rule 1.1: File Placement
- **DO NOT** create flat component files directly in `src/components/`.
- Every new component **MUST** be placed in its corresponding feature sub-folder (`layout`, `supervisor`, `technician`, `advisor`, `shared`, `auth`).

### Rule 1.2: Separation of Concerns (UI Components Don't Own Logic)
- **UI Components** must remain pure presentation layers.
- All state calculations, intervals, filtering, confirmation dialogs, and mutation handlers **MUST** be encapsulated in dedicated custom hooks (`src/hooks/`) or pure utilities (`src/utils/`).

---

## 🎨 2. Design System & UI Discipline

### Rule 2.1: Design Tokens Only
- **NEVER** hardcode arbitrary colors or pixel values in component inline styles.
- **ALWAYS** import and use design tokens from `src/constants/theme.ts`:
  ```typescript
  import { Colors, Spacing, FontSize, Radius } from '../../constants/theme';
  ```

### Rule 2.2: Scrollbar-Free UI Guarantee
- Standard browser/mobile scrollbars are forbidden in the UI.
- All `ScrollView` and `FlatList` instances **MUST** set:
  ```tsx
  showsVerticalScrollIndicator={false}
  showsHorizontalScrollIndicator={false}
  ```
- Web scrollbars are globally hidden via CSS rule injection in `App.tsx`.

### Rule 2.3: Sri Lankan License Plate Design
- All vehicle license plates **MUST** render using the standardized Sri Lankan plate component design (Yellow metallic background `#facc15`, blue left country bar with `🇱🇰` & `LK`, bold monospace plate text).

### Rule 2.4: Consistent Empty States & Responsive Modals
- All empty search/bay states **MUST** consume `<EmptyStateCard />` directly at the view root for 100% uniform spacing and centering.
- All modal footers and metric badges **MUST** support narrow mobile viewports (< 380px) using `flexWrap: 'wrap'` and `minWidth: 0`.

---

## 🔐 3. Authentication & Strict Role Segregation

### Rule 3.1: Principle of Least Privilege
- **Supervisor**: Can only create vehicle intakes and relocate/edit job order notes. Cannot complete station tasks or handover vehicles.
- **Technicians**: Can only check off tasks assigned to their specific bay and dispatch from their station.
- **Service Advisor**: Holds exclusive authority to finish and handover vehicles.

### Rule 3.2: Fine-Grained Action Guards
- All action buttons **MUST** consume `usePermissions()`:
  ```typescript
  const { canAddVehicle, canMarkTaskDone, canTransferVehicle, canFinishJob } = usePermissions();
  ```
- Non-permitted action buttons **MUST NOT** disappear abruptly; they **MUST** display a disabled state with clear guidance (e.g. `'ADVISOR ACCESS REQUIRED'`).

---

## ⚡ 4. State, Hardware & Realtime Synchronization

### Rule 4.1: Realtime Synchronization
- All database state mutations (`addVehicle`, `toggleTaskCompletion`, `transferVehicleZone`, `finishVehicleJobSheet`) must update local React state and Supabase tables simultaneously.
- Realtime channels via `supabase.channel('public:vehicle_changes')` handle remote changes broadcast to connected client instances.

### Rule 4.2: Hardware Alerts & Sensory Feedback
- Bay arrivals, task completions, and handovers must trigger sensory feedback via `chimeService` and `hapticService`.
- All audio/haptic calls must be wrapped in `try/catch` and respect user mute toggles stored in persistent storage.

### Rule 4.3: Graceful Offline Fallback
- If Supabase connection fails or is absent, `VehicleContext` must gracefully fallback to `localStorage` (on web) or `INITIAL_MOCK_VEHICLES` so the app remains 100% operational in demo mode.

---

## 💻 5. TypeScript & Code Hygiene

### Rule 5.1: Strict Typing
- `any` is strictly prohibited unless handling unexpected third-party library errors.
- Props interfaces **MUST** be declared for every component.
- All domain types are exported from `src/types/vehicle.ts`.

### Rule 5.2: Environment Variables
- All client-side env vars **MUST** use the `EXPO_PUBLIC_` prefix (e.g. `EXPO_PUBLIC_SUPABASE_URL`) so Expo Metro bundler exposes them securely.
