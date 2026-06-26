# Task 7: Config View Component

## Summary
Created `admin/src/views/dashboard/config/view.tsx` — the main view component for the widget configuration page.

## Implementation Details

### File Created
- **Path**: `admin/src/views/dashboard/config/view.tsx`
- **Type**: React client component ("use client" directive)

### Component Structure

#### Imports
- `useConfigPage` hook from `./logic` — provides form state, validation, preview data, save handler
- `WidgetPreview` from `@/components/widget-preview` — displays live preview
- `AllowedDomainsInput` from `./_components/allowed-domains-input/view` — domain management UI
- `Input` from `@/components/ui/input` — shadcn form input component

#### Layout
- **Grid layout**: `grid grid-cols-[1fr_auto] gap-8 p-8`
  - Left column (1fr): Form with configuration fields
  - Right column (auto): Live preview widget

#### Loading State
- Shows "Loading configuration..." message while fetching initial config

#### Form Fields (Left Column)
1. **Bot Name**
   - Text input with placeholder "Your Bot"
   - Required field (min 1, max 50 chars)
   - Error display below field

2. **Primary Color**
   - Dual input: color picker + hex input
   - Both bound to same form field `color`
   - Bidirectional sync: hex input validates regex and updates color picker
   - Error display below field

3. **Placeholder Text**
   - Text input with placeholder "Ask me anything..."
   - Required field (min 1, max 100 chars)
   - Error display below field

4. **Allowed Domains**
   - Custom `AllowedDomainsInput` component
   - Receives value from `form.watch("allowed_domains")`
   - Updates via `form.setValue("allowed_domains", domains)`
   - Error display below field

5. **Save Button**
   - Full-width submit button
   - Disabled while saving
   - Shows spinner icon during save operation
   - Text: "Save Changes"

#### Live Preview (Right Column)
- `WidgetPreview` component receives `preview` prop
- Preview data comes from `form.watch()` — updates in real-time as user types
- Shows:
  - Widget header with bot name and selected color
  - Chat area with greeting message
  - Input field with placeholder text
  - Send button with selected color

## Validation
- Form validation via Zod schema (defined in `logic.ts`)
- Inline error messages below each field
- Real-time preview updates via `form.watch()`

## Specifications Compliance
- ✓ "use client" directive at top
- ✓ Correct imports with proper paths
- ✓ Two-column grid layout: `grid grid-cols-[1fr_auto] gap-8 p-8`
- ✓ Loading state handled
- ✓ All form fields in correct order
- ✓ Error messages displayed below each field
- ✓ Color input bidirectional sync with regex validation
- ✓ AllowedDomainsInput integration with form.watch/setValue
- ✓ Save button with disabled state and spinner
- ✓ WidgetPreview receives watched values for live updates
