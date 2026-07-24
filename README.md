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
| 3 | Guided per-room baseline recording + playback | ⏳ Planned |
| 4 | Keyframe extraction pipeline | ⏳ Planned |
| 5 | Inspection recording flow | ⏳ Planned |
| 6 | Anthropic API paired-frame analysis (+ mock mode) | ⏳ Planned |
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

Everything is stored locally on the device — there is **no backend server**.

---

## Where the Anthropic API key goes (later steps)

AI comparison (step 6) calls the Anthropic vision API **directly from the app**
with extracted video frames. The key is read from either:

1. the `EXPO_PUBLIC_ANTHROPIC_API_KEY` environment variable (create a `.env`
   file — it is git-ignored), or
2. a **Settings screen** where you paste your own key (stored on-device).

The key is **never hardcoded**.

> 🔒 **Production warning.** Calling the Anthropic API directly from a mobile
> client exposes your API key to that device. This is fine for local testing,
> but a real production app must route this call through a **backend proxy** so
> the key never ships to the client. This will be called out in the app UI as
> well.

Until step 6 lands, AI analysis runs in a **mock/offline mode** that returns
sample findings, so the whole app is testable without a key or network calls.

---

## Tech stack

- **Expo SDK 57** (React Native 0.86, React 19) + TypeScript
- **expo-sqlite** — structured local data
- **@react-navigation/native** (native stack) — navigation
- **expo-camera** — recording *(step 3)*
- **expo-video** — playback *(step 3; see note below)*
- **expo-file-system** — local video/frame storage *(step 3+)*
- **expo-video-thumbnails** — keyframe extraction *(step 4)*
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
  navigation/
    RootNavigator.tsx    Native stack
    types.ts             Route param types
  screens/
    DashboardScreen.tsx      Property list + status chips
    PropertyFormScreen.tsx   Create / edit property
    PropertyDetailScreen.tsx Property overview + delete
    RoomsScreen.tsx          Add / rename / delete / reorder rooms
    FloorMapScreen.tsx       Drag room pins on a grid or photo
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
