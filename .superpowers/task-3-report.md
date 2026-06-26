# Task 3: Create Server Actions for Config

## Summary
Successfully created Next.js server actions (`admin/src/server/config.ts`) for widget configuration management.

## Implementation Details

### File Created
- **Path:** `admin/src/server/config.ts`
- **Commit:** `87f4087`

### Functions Implemented
1. **getConfig()**: Server action that fetches widget configuration from FastAPI backend
   - Returns `WidgetConfig` type on success
   - Falls back to defaults if API call fails (404 or network error)
   - Defaults: bot_name="Your Bot", color="#6366f1", placeholder="Ask me anything...", allowed_domains=[]

2. **updateConfig()**: Server action that updates widget configuration on backend
   - Sends PUT request to `/config` endpoint
   - Returns `{ saved: boolean }` status
   - Uses `apiFetch` helper for type-safe API communication

3. **apiFetch()**: Generic HTTP helper utility
   - Reads from `NEXT_PUBLIC_API_URL` environment variable
   - Defaults to `http://localhost:8000` if not set
   - Automatically adds Content-Type: application/json header
   - Throws error on non-2xx responses

### Type Definition
- **WidgetConfig**: Exported type with fields:
  - `bot_name`: string
  - `color`: string
  - `placeholder`: string
  - `allowed_domains`: string[]

## Self-Review Checklist
- [x] File starts with `"use server"` directive
- [x] Both functions exported
- [x] WidgetConfig type exported
- [x] TypeScript syntax is correct
- [x] apiFetch helper properly typed with generic `<T>`
- [x] Error handling with sensible defaults for getConfig
- [x] PUT request with JSON body in updateConfig

## Testing Notes
The implementation is ready for integration with Next.js views. The server actions will be called by React components to manage widget configuration. The fallback defaults ensure graceful degradation if the backend is unavailable.
