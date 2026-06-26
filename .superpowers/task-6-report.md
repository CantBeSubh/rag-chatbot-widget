# Task 6 - Config Page Form Logic

## Status: COMPLETE

## File Created
- **Path:** `admin/src/views/dashboard/config/logic.ts`
- **Type:** Custom React hook for form state orchestration

## Implementation Summary

Created `useConfigPage()` hook that:

1. **Zod Schema Definition**
   - Validates `bot_name` (required, max 50 chars)
   - Validates `color` (hex color format: `#[0-9a-fA-F]{6}`)
   - Validates `placeholder` (required, max 100 chars)
   - Validates `allowed_domains` (array of strings)

2. **Form Initialization**
   - Uses `react-hook-form` with `zodResolver` for validation
   - Sets default values: bot_name="", color="#6366f1", placeholder="", allowed_domains=[]

3. **Data Loading**
   - `useEffect` loads config on component mount via `getConfig()`
   - Resets form with loaded data using `form.reset()`
   - Manages `isLoading` state during fetch

4. **Live Preview**
   - Uses `form.watch()` to capture real-time form value changes
   - Creates preview object with current form state
   - Returns `Partial<WidgetConfig>` for UI preview

5. **Server Integration**
   - `onSubmit` handler calls `updateConfig()` with validated data
   - Manages `saving` state before/after server call
   - Error handling with console logs

## Return Interface
```typescript
{
  form: UseFormReturn<ConfigFormData>,
  preview: Partial<WidgetConfig>,
  onSubmit: (data: ConfigFormData) => Promise<void>,
  saving: boolean,
  isLoading: boolean
}
```

## Validation Details
- bot_name: min 1, max 50 characters, required
- color: strict hex format validation
- placeholder: min 1, max 100 characters, required
- allowed_domains: array of strings

All field validations and error messages match specification exactly.
