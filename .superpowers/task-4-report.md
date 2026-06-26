# Task 4: WidgetPreview Component

## Summary
Created `admin/src/components/widget-preview.tsx` — a React component that displays a static mockup of the chatbot widget with dynamic configuration values.

## Implementation Details

### File Created
- `admin/src/components/widget-preview.tsx` (82 lines)

### Component Specification
- **Props**: `config: Partial<WidgetConfig>` (optional fields with fallbacks)
- **Import**: `WidgetConfig` type from `@/server/config`

### Layout & Styling
The component renders a widget mockup with three main sections:

1. **Header** (colored background)
   - Displays `config.bot_name` with fallback "Your Bot"
   - Background color from `config.color` (default: `#6366f1`)
   - White text, semibold font

2. **Chat Area** (main content)
   - Sample message bubble: "Hi! I'm [bot_name]. How can I help you today?"
   - Gray background for message bubble
   - Minimum height of 200px for preview visibility

3. **Input Area** (bottom)
   - Disabled text input with placeholder text from `config.placeholder` (default: "Ask me anything...")
   - Disabled send button with colored background
   - Button displays emoji: 💬

### Styling Approach
- **Tailwind CSS** for layout, spacing, borders, and shadows
- **Inline styles** for dynamic colors (`backgroundColor`, `--tw-ring-color`)
- **Fixed width**: 280px (realistic widget mockup size)
- **Responsive design**: flex layout for scalability

### Fallback Values
- `bot_name`: "Your Bot"
- `color`: "#6366f1" (indigo)
- `placeholder`: "Ask me anything..."

### Interactive State
- Input and button are disabled (this is a preview mockup, not interactive)
- Focus ring color matches the widget color theme

## Testing
- Component accepts partial config objects (all fields optional)
- Displays fallback values when config is incomplete or empty
- Colors applied dynamically via inline styles
- Layout preserves structure at fixed 280px width

## Design Compliance
- Follows spec exactly as provided
- Matches admin panel VIEWS.md pattern (reusable component in `src/components/`)
- Uses Next.js 16+ (from project context)
- Compatible with Tailwind CSS and shadcn/ui stack

## Files Modified
None (new file created)

## Files Created
- `admin/src/components/widget-preview.tsx`
