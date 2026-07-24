# Tenant Auditor

A local-first, offline-first mobile app for landlords to record a **move-in**
(baseline) walkthrough video of a property, later record a **move-out**
(inspection) walkthrough, and have AI compare the two to flag damage, missing
items, or areas needing closer inspection — plotted on a simple floor map and
viewable as a side-by-side video comparison.

Built with **Expo (React Native) + TypeScript**, designed to run in **Expo Go**
so it can be tested on an Android phone immediately by scanning a QR code — no
native build or signing required.

> ⚠️ **MVP / human-in-the-loop.** AI findings are *suggestions for review*, not
> verdicts. Camera angle, lighting and timing always differ between two handheld
> walkthroughs, so the app does **not** attempt pixel-level diffing or object
> tracking. It extracts keyframes per room and asks a vision model to compare
> them, surfacing confidence scores you can confirm or dismiss.

---

## Running it

You need [Node.js](https://nodejs.org/) 18+ and the **Expo Go** app installed on
your Android phone (from the Play Store).

```bash
npm install        # first time only
npx expo start     # starts Metro + prints a QR code
```

Then open **Expo Go** on your phone and scan the QR code. The phone and the
computer running `npx expo start` must be on the same Wi-Fi network. If they
can't see each other, run `npx expo start --tunnel`.

> iOS note: Expo Go works on iOS too, but this app is targeted and tested for
> Android per the brief. Camera/recording behavior is validated on Android.

---

## Build status

This project is being built in the sequence below. It is kept **runnable at
every step**.

| Step | Feature | Status |
|------|---------|--------|
| 1 | Project scaffold, navigation shell, SQLite schema, **property CRUD** | ✅ Done |
| 2 | **Room list management + floor-map pin placement** | ✅ Done |
| 3 | **Guided per-room baseline recording + playback** | ✅ Done |
| 4 | **Keyframe extraction pipeline** | ✅ Done |
| 5 | **Inspection recording flow** | ✅ Done |
| 6 | **Anthropic API paired-frame analysis (+ mock mode)** | ✅ Done |
| 7 | Results map + side-by-side comparison view | ⏳ Planned |
| 8 | Polish (permissions, low-storage, empty states, one-handed UX) | ⏳ Planned |

### What works right now (step 1)

- **Home dashboard** listing all properties with a status chip
  (*no baseline yet → baseline complete → inspection in progress → inspection
  complete, N findings*).
- **Create / edit / delete** a property (name + address).
- **Property detail** screen showing rooms (read-only for now) and roadmap
  placeholders for the recording flows.
- A complete **local SQLite schema** (`properties`, `rooms`, `sessions`,
  `clips`, `keyframes`, `findings`, `analysis_jobs`, `app_settings`) created via
  a versioned migration runner, so later steps add UI without schema churn.

### What works right now (step 2)

- **Room management** per property: add, rename (tap a room), delete, and
  reorder with up/down controls. Order is the guided-walkthrough recording
  order, which is how baseline and inspection clips are matched later.
- **Floor map**: a `react-native-svg` grid canvas (or an optional uploaded
  floor-plan photo). Tap a room to drop its labeled pin, then **drag** it into
  place; tap a placed room to remove its pin. Pin positions are stored as
  normalized coordinates so they survive re-layout and background swaps. The
  map is a visual index into rooms, not an architectural drawing.

### What works right now (step 3)

- **Guided baseline recording**: from a property, tap *Start baseline* to walk
  through rooms **in order** — the screen shows "Now recording: Kitchen — Room
  2 of 5", records one **720p** clip per room (`expo-camera`), and lets you
  re-record or advance. Progress dots show which rooms are done.
- **Crash-safe & resumable**: one clip per room (not one long video). Videos are
  copied into persistent local storage (`expo-file-system`) at a deterministic
  path, and the walkthrough **resumes at the first un-recorded room** if you
  leave and come back. *Finish* marks the baseline complete.
- **Playback**: tap ▶ next to any recorded room to play its clip
  (`expo-video`).
- **Permission handling**: a clear camera + microphone explainer with an *Allow
  access* / *Open settings* path — no silent crash on denial.
- **Storage guard**: free space is checked before each recording; if it's low
  you're warned before filling the device.

> Recording uses real camera hardware, so it must be exercised on a physical
> device via Expo Go (it can't run in a simulator without a camera). The rest of
> the app — properties, rooms, floor map, playback of existing clips — works
> everywhere.

### What works right now (steps 4–5)

- **Keyframe extraction**: after each room is recorded, ~1 frame every 1.5s
  (capped at 16) is extracted and stored (`expo-video-thumbnails`); the record
  screen shows the frame count per room.
- **Inspection walkthrough**: once the baseline is complete, *Start inspection*
  runs the **same guided per-room flow** (reusing the record component) for the
  move-out pass. Each inspection room's frames are extracted and a paired
  baseline-vs-inspection **comparison is queued** per room.
- **Non-blocking by design**: comparisons are enqueued into an `analysis_jobs`
  table and executed later (step 6), so a slow/offline AI call never blocks the
  walkthrough. The property screen shows how many rooms are queued.

### What works right now (step 6)

- **AI paired-frame analysis**: from a property → *AI analysis & findings*, tap
  *Run analysis* to process each room's queued comparison. Baseline and
  inspection keyframes for the room are sent to the Anthropic vision model with
  a structured prompt; it returns JSON findings (description, severity,
  confidence, and a normalized box).
- **Mock mode (default)**: returns realistic sample findings with **no key and
  no spend**, so the whole pipeline is testable offline. Toggle it off in
  **Settings** and paste a key to go live.
- **Human-in-the-loop**: every finding shows its confidence and can be
  **Confirmed** or **Dismissed** — the UI states plainly that findings are
  suggestions, not verdicts.
- **Resilient**: each AI call has a **timeout + one retry**; a failed room is
  marked *Failed* with its error and can be re-run — it never blocks the other
  rooms. Per-room status (queued / analyzing / done / failed) updates live.

Everything is stored locally on the device — there is **no backend server**.

---

## Where the Anthropic API key goes

AI comparison calls the Anthropic vision API **directly from the app** with
extracted video frames. The key is read from either:

1. the `EXPO_PUBLIC_ANTHROPIC_API_KEY` environment variable (copy `.env.example`
   to `.env` — it is git-ignored), or
2. the in-app **Settings screen** (⚙︎ on the dashboard), where you paste your
   own key — stored securely on-device via `expo-secure-store`.

The key is **never hardcoded**. The default model is `claude-opus-5`; Settings
also lets you pick Sonnet 5 or Haiku 4.5 (cheaper) and toggle mock mode.

> 🔒 **Production warning.** Calling the Anthropic API directly from a mobile
> client exposes your API key to that device. This is fine for local testing,
> but a real production app must route this call through a **backend proxy** so
> the key never ships to the client. This is called out in the Settings screen
> too.

**Mock vs live.** Out of the box the app runs in **mock mode** — AI analysis
returns realistic sample findings with no key and no network calls, so the whole
app is testable for free. Turn mock mode off in Settings and add a key to run
real comparisons.

---

## Tech stack

- **Expo SDK 57** (React Native 0.86, React 19) + TypeScript
- **expo-sqlite** — structured local data
- **@react-navigation/native** (native stack) — navigation
- **expo-camera** — recording *(step 3)*
- **expo-video** — playback *(step 3; see note below)*
- **expo-file-system** — local video/frame storage *(step 3+)*
- **expo-video-thumbnails** — keyframe extraction *(step 4, live)*
- **expo-secure-store** — on-device storage of the Anthropic API key *(step 6)*
- **react-native-svg** — floor-map / pin overlay canvas *(steps 2 & 7)*
- **expo-image-picker** — optional floor-plan photo for the map *(step 2)*

> **Note on `expo-av`:** the brief specifies `expo-av` for playback, but
> `expo-av` was **removed in Expo SDK 57**. Its replacements are `expo-video`
> (video) and `expo-audio` (audio). This app uses **`expo-video`** for playback
> — the same capability, current API.

---

## Project structure

```
App.tsx                  App root: DB init + navigation container
index.ts                 Expo entry point
src/
  db/
    database.ts          Singleton SQLite handle + PRAGMAs
    schema.ts            DDL + versioned migration runner (PRAGMA user_version)
    properties.ts        Property CRUD + dashboard status + floor-map image
    rooms.ts             Room CRUD, reorder, and pin persistence
    sessions.ts          Walkthrough sessions (baseline/inspection)
    clips.ts             Per-room video clip rows
    keyframes.ts         Extracted keyframe rows
    analysisJobs.ts      Queued per-room AI comparison jobs
    findings.ts          AI findings + confirm/dismiss status
    appSettings.ts       Key/value app settings (mock mode, model)
  ai/
    config.ts            API key (SecureStore/env), mock mode, model
    anthropic.ts         Direct Messages API call (paired frames → JSON)
    mock.ts              Offline sample-finding generator
    analysis.ts          Job runner: pair frames, run, persist findings
    types.ts             RawFinding / FramePayload types
  navigation/
    RootNavigator.tsx    Native stack
    types.ts             Route param types
  screens/
    DashboardScreen.tsx      Property list + status chips
    PropertyFormScreen.tsx   Create / edit property
    PropertyDetailScreen.tsx Property overview + delete
    RoomsScreen.tsx          Add / rename / delete / reorder rooms
    FloorMapScreen.tsx       Drag room pins on a grid or photo
    RecordScreen.tsx         Guided per-room recording (baseline/inspection)
    PlaybackScreen.tsx       Single-clip player (expo-video)
    AnalysisScreen.tsx       Run AI analysis; confirm/dismiss findings
    SettingsScreen.tsx       API key, mock mode, model selection
  media/
    keyframes.ts         Keyframe extraction (~1 frame / 1.5s, capped)
  storage/
    videos.ts            Local clip storage + free-space checks
    frames.ts            Local keyframe image storage
  components/
    Button.tsx           Thumb-friendly button
    StatusChip.tsx       Lifecycle status pill
    EmptyState.tsx       Empty-list placeholder
    TextPromptModal.tsx  Cross-platform single-line input dialog
    GridBackground.tsx   SVG graph-paper canvas
  theme/theme.ts         Design tokens (colors, spacing, touch targets)
  types/models.ts        Domain types mirroring the SQLite schema
  utils/id.ts            UUID helper
```
