import { WidgetConfig } from "@/server/config"

interface WidgetPreviewProps {
  config: Partial<WidgetConfig>
}

export function WidgetPreview({ config }: WidgetPreviewProps) {
  const botName = config.bot_name || "Your Bot"
  const color = config.color || "#6366f1"
  const placeholder = config.placeholder || "Ask me anything..."

  return (
    <div
      className="flex flex-col rounded-lg border border-gray-200 overflow-hidden shadow-sm"
      style={{ width: "280px" }}
    >
      <div
        className="px-4 py-3 text-white font-semibold"
        style={{ backgroundColor: color }}
      >
        {botName}
      </div>

      <div className="flex-1 p-4 bg-white flex flex-col gap-3 min-h-[200px]">
        <div className="flex justify-start">
          <div className="bg-gray-100 rounded-lg px-3 py-2 text-sm text-gray-800 max-w-[80%]">
            Hi! I'm {botName}. How can I help you today?
          </div>
        </div>
      </div>

      <div className="border-t border-gray-200 p-3 bg-white flex gap-2">
        <input
          type="text"
          placeholder={placeholder}
          className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-offset-0 text-black"
          style={{ "--tw-ring-color": color } as any}
          disabled
        />
        <button
          className="p-2 rounded text-white flex-shrink-0"
          style={{ backgroundColor: color }}
        >
          Send
        </button>
      </div>
    </div>
  )
}
