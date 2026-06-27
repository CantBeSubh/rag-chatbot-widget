// "use client"
// import { useEffect, useState } from "react"
//
// import { getApiFromCookie } from "@/server/setting"
//
// function ScriptTagSection() {
//   const [apiKey, setApiKey] = useState<string>("")
//   const scriptTag = `<script src="${process.env.NEXT_PUBLIC_WIDGET_URL}/widget.js?key=${apiKey}"></script>`
//   const [copied, setCopied] = useState(false)
//
//   const copy = () => {
//     navigator.clipboard.writeText(scriptTag)
//     setCopied(true)
//     setTimeout(() => setCopied(false), 2000)
//   }
//
//   useEffect(() => {
//     const loadkey = async () => {
//       const apikey = await getApiFromCookie()
//       setApiKey(apikey)
//     }
//     loadkey()
//   }, [])
//
//   return (
//     <div className="space-y-3">
//       <h2 className="text-lg font-semibold">Your Script Tag</h2>
//       <p className="text-sm text-gray-600">
//         Paste this into the {"<body>"} of your website to activate the chatbot.
//       </p>
//       <div className="relative">
//         <pre className="bg-gray-950 text-green-400 rounded-lg p-4 text-sm font-mono overflow-x-auto">
//           {scriptTag}
//         </pre>
//         <button
//           onClick={copy}
//           className="absolute top-2 right-2 bg-gray-800 hover:bg-gray-700 text-white text-xs px-3 py-1 rounded"
//         >
//           {copied ? "Copied!" : "Copy"}
//         </button>
//       </div>
//     </div>
//   )
// }
//
// export default function SettingPage() {
//   return <ScriptTagSection />
// }

"use client"

import { useEffect, useState } from "react"

import { useUser } from "@clerk/nextjs"
import { Check, Code2, Copy } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"

function ScriptTagSection() {
  const user = useUser()?.user
  const [apiKey, setApiKey] = useState("")
  const [copied, setCopied] = useState(false)

  const scriptTag = `<script src="${process.env.NEXT_PUBLIC_WIDGET_URL}/widget.js?key=${apiKey}"></script>`

  useEffect(() => {
    const loadKey = async () => {
      const key = user?.publicMetadata?.apikey as string
      setApiKey(key ?? "error-no-key")
    }

    loadKey()
  }, [user])

  const copy = async () => {
    await navigator.clipboard.writeText(scriptTag)
    setCopied(true)

    setTimeout(() => {
      setCopied(false)
    }, 2000)
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Code2 className="h-5 w-5" />
          <CardTitle>Embed Widget</CardTitle>
        </div>

        <CardDescription>
          Copy the script below and paste it before the closing{" "}
          <code>{"</body>"}</code> tag of your website.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <Textarea
          readOnly
          value={scriptTag}
          className="min-h-[90px] font-mono text-sm resize-none"
        />

        <div className="flex items-center justify-between">
          <Badge variant="secondary">
            Loads your chatbot automatically
          </Badge>

          <Button onClick={copy}>
            {copied ? (
              <>
                <Check className="mr-2 h-4 w-4" />
                Copied
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" />
                Copy Script
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default function SettingPage() {
  return (
    <div className="p-6">
      <ScriptTagSection />
    </div>
  )
}
