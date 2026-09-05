# United Motors Vehicle Tracking — Industrial-Grade Architecture & Engineering Specification

This document establishes the official **Gold-Standard Engineering & Architecture Specification** for the **United Motors Vehicle Tracking Application**. 

Every contributor, engineer, and AI agent **MUST strictly adhere** to the patterns, boundary rules, and constraints documented herein to guarantee:
* **Predictable, zero-regression behavior** across all shop-floor operations.
* **Rock-solid data integrity** with zero orphan records or race conditions.
* **Sub-16ms optimistic UI responsiveness** under fluctuating shop-floor Wi-Fi.
* **Audit-grade telemetry accuracy** separating gross turnaround time, queue idle time, wrench time, and automated shift breaks.
* **Effortless multi-branch scalability** as United Motors expands.

---

## 🏛️ 1. Four-Tier Clean Architecture

The application strictly enforces a **Four-Tier Clean Architecture** with unidirectional data flow and bounded contexts:

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                           TIER 1: PRESENTATION LAYER                          │
│   src/components/ (supervisor, technician, advisor, layout, shared, reports)  │
│   src/hooks/ (useFloorPlan, useTechnicianStation, useAdvisorInspection, etc.)  │
└──────────────────────────────────────┬────────────────────────────────────────┘
                                       │ Calls hooks & dispatches actions
┌──────────────────────────────────────▼────────────────────────────────────────┐
│                        TIER 2: REACTIVE STATE & SYNC                          │
│   src/context/VehicleContext.tsx (Domain Entity State & Realtime CDC)         │
│   src/context/AuthContext.tsx    (Session & Role Profile)                     │
│   src/context/ThemeContext.tsx   (Carbon Dark / High-Contrast Tokens)         │
└──────────────────┬────────────────────────────────────────▲───────────────────┘
                   │ Dispatches mutations                   │ Subscribes to events
┌──────────────────▼────────────────────────────────────────┴───────────────────┐
│                    TIER 3: DOMAIN REPOSITORIES & TELEMETRY                    │
│   src/services/vehicleService.ts (API / Database Access Repositories)         │
│   src/utils/vehicleUtils.ts      (Timing State Machine & TAT Breakdown)       │
│   src/utils/workshopHoursUtils.ts(Automated Shift Break Deduction Engine)     │
│   src/utils/reportExportUtils.ts (Telemetry Aggregator, CSV & PDF Engines)    │
└──────────────────┬────────────────────────────────────────▲───────────────────┘
                   │ Executes parameterized SQL / RPCs      │ PostgreSQL WAL stream
┌──────────────────▼────────────────────────────────────────┴───────────────────┐
│                        TIER 4: PERSISTENCE & DATA LAYER                       │
│   PostgreSQL on Supabase (Row-Level Security, Cascade FKs, Identity Full)     │
│   Offline Cache (safeStorage / LocalStorage Hydration Layer)                  │
└───────────────────────────────────────────────────────────────────────────────┘
```

### Boundary Rules Between Tiers:
1. **Tier 1 (Components) CANNOT talk directly to Tier 3 (Services) or Tier 4 (Supabase)**. Components may only invoke methods exposed by Tier 2 Context or Tier 1 Hooks.
2. **Tier 1 (Components) MUST NOT contain business math or timing algorithms**. Mathematical calculations (TAT, break overlaps, idle seconds) belong strictly in Tier 3 pure utilities.
3. **Tier 2 (Context) DOES NOT construct raw SQL queries**. Context delegates all network fetching and Supabase RPC/table execution to Tier 3 Service Repositories.
4. **Data flow is strictly unidirectional**: User Action $\to$ Hook $\to$ Context Optimistic Mutator $\to$ Service Repository $\to$ Database $\to$ Realtime WebSocket CDC $\to$ Context Reconciliation $\to$ Re-render.

---

## 📂 2. Directory Structure & Feature-Slice Partitioning

The filesystem layout uses **Feature-Sliced Partitioning**:

```
UnitedMoters-VehicalTrackingApp/
├── App.tsx                          # Application root, provider gate & modal mounting
├── CODEBASE_ARCHITECTURE_RULES.md   # Architectural single source of truth (this file)
├── README.md                        # High-level overview & setup instructions
├── supabase_schema.sql              # Clean production database schema & migrations
└── src/
    ├── components/                  # Tier 1 UI Presentation Components
    │   ├── advisor/                 # Advisor ready zone, inspection audits, handover modal
    │   ├── auth/                    # Clean glassmorphic sign-in screen
    │   ├── layout/                  # Fixed navigation header, break banner, role switcher
    │   ├── reports/                 # Service reports modal, table preview, KPI grid
    │   ├── shared/                  # Reusable design atoms (Plate, TimerPill, StatusPill, UrgentModal)
    │   ├── supervisor/              # 2D floor plan, spatial bay cards, add vehicle modal
    │   └── technician/              # Bay queues, idle lock indicators, task matrix
    ├── constants/                   # Static Design Tokens & Workshop Configurations
    │   ├── bays.ts                  # Bay metadata, color mappings, technician roles
    │   └── theme.ts                 # Colors, Spacing, FontSize, Radius design tokens
    ├── context/                     # Tier 2 Application State Containers
    │   ├── AuthContext.tsx          # Supabase auth session & user profile state
    │   ├── ThemeContext.tsx         # Theme mode toggling & token resolution
    │   └── VehicleContext.tsx       # Live workshop domain state & Realtime channels
    ├── hooks/                       # Tier 1 View-Controller Custom Hooks
    │   ├── useAdvisorInspection.ts  # Advisor ready zone state & action handlers
    │   ├── useDateWatcher.ts        # Midnight date rollover watcher
    │   ├── useElapsedTimer.ts       # Live ticking timer loop
    │   ├── useFloorPlan.ts          # Floor plan spatial groupings & bay filtering
    │   ├── usePermissions.ts        # Role-based action capability guards
    │   ├── usePinnedVehicles.ts     # Date-keyed vehicle bookmark persistence
    │   └── useTechnicianStation.ts  # Technician queues, expand states & transfer handlers
    ├── lib/                         # External SDKs & Hardware Interfaces
    │   ├── chime.ts                 # Synthetic dual-tone Web Audio chimes
    │   ├── haptics.ts               # Multi-platform haptic pulse engine
    │   └── supabase.ts              # Supabase client singleton & safeStorage polyfill
    ├── services/                    # Tier 3 Data Access Repositories
    │   └── vehicleService.ts        # Pure Supabase query execution & RPC handlers
    ├── types/                       # Centralized Domain Models
    │   └── vehicle.ts               # Vehicle, Task, StageLog, BayZone, and UserRole types
    └── utils/                       # Tier 3 Pure Business Logic & Calculation Engines
        ├── reportExportUtils.ts     # Telemetry aggregation, CSV formatters, PDF HTML builder
        ├── searchUtils.ts           # License plate normalization & fuzzy searching
        ├── vehicleNumberUtils.ts    # Sri Lankan license plate formatting & validation
        ├── vehicleUtils.ts          # Stage timing state machine & gross/net TAT calculators
        └── workshopHoursUtils.ts    # Scheduled break deduction engine (Tea/Lunch)
```

---

## ⚡ 3. State Management & Realtime Synchronization Standards

### Rule 3.1: Optimistic UI with Guaranteed Rollback
All user-triggered state mutations (`startStageWork`, `toggleTaskCompletion`, `transferVehicleZone`, `finishVehicleJobSheet`, `deleteVehicle`) must execute **optimistically in < 16ms**:
1. Take an immutable snapshot of current state (`const prevVehicles = vehicles`).
2. Mutate local React state immediately so the technician sees instant feedback.
3. Asynchronously trigger the Tier 3 Service call.
4. If the server request rejects, **immediately restore `prevVehicles`** and display an in-app error banner.

### Rule 3.2: Derived & Reactive Selection (No Stale Modals)
When a vehicle is opened in a modal or inspector, **NEVER** freeze it as an isolated static object.
It **MUST** be derived reactively from the live domain array:
```typescript
const [selectedVehicleState, setSelectedVehicleState] = useState<Vehicle | null>(null);

// Reactive derived selector: Realtime background updates immediately reflect in open modal
const selectedVehicle = useMemo(() => {
  if (!selectedVehicleState) return null;
  return vehicles.find(v => v.id === selectedVehicleState.id) || selectedVehicleState;
}, [vehicles, selectedVehicleState]);
```

### Rule 3.3: Realtime Debounced Reconciliation
* Multiple connected tablets on the shop floor can trigger rapid simultaneous PostgreSQL CDC events.
* Realtime handlers must debounce database refetches by **300ms** to prevent the thundering-herd problem.

### Rule 3.4: Selective In-Memory Querying (Zero Full-Table Scans)
* When hydrating or refetching live vehicles, tasks and stage logs **MUST NOT** perform unconstrained `.select('*')`.
* They **MUST** filter by `.in('vehicle_id', vehicleIds)` to ensure initial payload sizes remain lightweight (< 50KB) regardless of database age.

---

## ⏱️ 4. Shop-Floor Telemetry & Working Time State Machine

In industrial automotive workshop environments, technician productivity requires separating **Queue/Idle Time (Lead Time)** from **Wrench Time (Cycle Time)**.

```
Vehicle Enters Bay
        │
        ▼
┌────────────────────────┐
│      IDLE STATE        │ ──▶ Stage Log: work_started_at = NULL
│   (Waiting in Queue)   │ ──▶ Timer: Amber "IDLE · 04m 12s"
└───────────┬────────────┘ ──▶ Checklist: Locked with 🔒 START WORK FIRST
            │
            │ Technician taps start arrowhead (▶)
            ▼
┌────────────────────────┐
│      ACTIVE STATE      │ ──▶ Stage Log: work_started_at = NOW(), idle_seconds = computed
│   (Wrench Work Live)   │ ──▶ Timer: Cyan live elapsed time
└───────────┬────────────┘ ──▶ Checklist: Unlocked for task completion
            │
            │ Bay tasks completed -> Dispatch requested & confirmed
            ▼
┌────────────────────────┐
│     TRANSFERRED        │ ──▶ Active Stage Log: exited_at = NOW(), duration_seconds saved
│   (Next Bay or Final)  │ ──▶ Next Stage Log: created with work_started_at = NULL
└────────────────────────┘
```

### Rule 4.1: Deterministic Idle Lock
* While a vehicle is idle in a bay (`!lastLog.work_started_at`), all task checkboxes and action buttons are hard-locked (`!isStageIdle`).
* The UI displays an amber `🔒 LOCKED · START WORK TO EDIT` warning.

### Rule 4.2: Automated Shift Break Deduction Engine
* The workshop enforces fixed daily breaks:
  * ☕ **Morning Tea**: `09:45 AM – 10:00 AM` (15 mins)
  * 🍱 **Lunch Break**: `12:30 PM – 01:00 PM` (30 mins)
  * ☕ **Evening Tea**: `02:45 PM – 03:00 PM` (15 mins)
* [`workshopHoursUtils.ts`](file:///c:/Users/mxsas/Documents/GitHub/UnitedMoters-VehicalTrackingApp/src/utils/workshopHoursUtils.ts) calculates break overlap intervals down to the exact second.
* **Telemetry Mathematical Formula**:
  $$\text{Gross TAT} = \text{Delivery Time} - \text{Intake Time}$$
  $$\text{Net Wrench Time} = \text{Gross TAT} - \text{Deducted Break Seconds} - \text{Queue Idle Seconds}$$
* Reports and exports **MUST** display both Gross and Net metrics with dedicated break deduction columns.

---

## 🗄️ 5. Persistence, Retention & Multi-Branch Schema Standards

### Rule 5.1: Option B Soft Filtering
To guarantee instant rendering (< 100ms) on low-power workshop tablets:
* The live app queries **only** active in-workshop vehicles (`is_finished = false`) plus jobs finished within the last **48 hours** (`created_at >= NOW() - 48h`).
* Older historical records are queried **on demand** inside the Service Reports modal.

### Rule 5.2: Cascade Delete & Replica Identity Guarantees
* Every child table (`vehicle_tasks`, `stage_logs`) **MUST** declare `REFERENCES vehicles(id) ON DELETE CASCADE`.
* All operational tables **MUST** have `REPLICA IDENTITY FULL` enabled in PostgreSQL so Realtime WebSocket payloads supply complete data on `DELETE` and `UPDATE` events.

### Rule 5.3: Silent 90-Day Retention Auto-Purge
* To prevent database degradation, the schema defines `purge_records_older_than_90_days()`.
* The client invokes this RPC fire-and-forget on supervisor launch.

### Rule 5.4: Future-Proof Multi-Branch Architecture
All operational tables must support multi-dealership expansion by including:
```sql
branch_id VARCHAR(50) NOT NULL DEFAULT 'main_workshop';
```
This ensures zero-friction migration when United Motors adds new regional branches (e.g., Kandy, Galle, Kurunegala).

---

## 🎨 6. Design System & Component Discipline

### Rule 6.1: Unified Design Tokens Only
* **NEVER** use arbitrary hex codes or margins.
* **ALWAYS** import from [`src/constants/theme.ts`](file:///c:/Users/mxsas/Documents/GitHub/UnitedMoters-VehicalTrackingApp/src/constants/theme.ts) (`Colors`, `Spacing`, `FontSize`, `Radius`).

### Rule 6.2: Standardized Atomic Components
* **License Plates**: Must always use `<LicensePlate number={...} size="sm"|"md"|"lg" />` reflecting Sri Lankan plate specifications.
* **Status Pills**: Must use `<StatusPill variant="success"|"warning"|"danger"|"timer"|"neutral" label={...} />`.
* **Timers**: Must use `<TimerPill elapsedText={...} variant="cyan"|"amber" size="sm"|"md" />`.
* **Action Buttons**: Standardized to `28×28px` (`borderRadius: 6`) for card headers (play arrowhead, bookmark pin, chevron expand).
* **Empty States**: Must use `<EmptyStateCard icon={...} title={...} subtitle={...} />`.

### Rule 6.3: Strictly Zero Browser/OS Popups
* Native browser `window.alert(...)`, `window.confirm(...)`, or `Alert.alert(...)` are **strictly forbidden** in production flows.
* Priority alerts must open `<UrgentNoteModal />`.
* Destructive actions (vehicle deletion, final vehicle handover) must render themed in-app confirmation dialogs.

### Rule 6.4: Zero-Scrollbar Guarantee
* All `ScrollView` and `FlatList` elements must set:
  ```tsx
  showsVerticalScrollIndicator={false}
  showsHorizontalScrollIndicator={false}
  ```

---

## 🔐 7. Security, Permissions & Role Enforcement

### Rule 7.1: Principle of Least Privilege
The system enforces strict role-based capabilities via `usePermissions()`:

| Capability | Supervisor | Tech · Workshop | Tech · Hoist | Tech · Alignment | Advisor |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Intake New Vehicle** | ✅ Yes | ❌ No | ❌ No | ❌ No | ❌ No |
| **Edit Job Order / Remarks** | ✅ Yes | ❌ No | ❌ No | ❌ No | ❌ No |
| **Start Stage Work** | ❌ No | ✅ Bay 01 Only | ✅ Bay 03 Only | ✅ Bay 02 Only | ❌ No |
| **Mark Task Done** | ❌ No | ✅ Bay 01 Only | ✅ Bay 03 Only | ✅ Bay 02 Only | ❌ No |
| **Dispatch Vehicle** | ❌ No | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No |
| **Handover & Finish Job** | ❌ No | ❌ No | ❌ No | ❌ No | ✅ Yes |
| **Delete Vehicle** | ✅ Yes | ❌ No | ❌ No | ❌ No | ❌ No |

### Rule 7.2: Disabled Over Hidden
Restricted actions must not vanish abruptly. They must render with reduced opacity (`0.35–0.4`) and clear explanatory labels (e.g. `'ADVISOR ACCESS REQUIRED'`).

---

## 🛡️ 8. Strict Engineering Hygiene & CI Gates

1. **TypeScript Strictness**: No `any` types permitted on domain logic. All props must have typed interfaces.
2. **Build Verification**: Every code edit **MUST** be verified by running:
   ```bash
   npx tsc --noEmit
   ```
   Code must compile with **0 errors**.
3. **Commit & Push Discipline**: Under no circumstances should `git commit` or `git push` be executed unless the user explicitly gives the command.
