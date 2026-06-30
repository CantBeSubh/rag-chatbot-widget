"use client"

import { Check, Code2, Copy, Trash2 } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"

import { useSettingsPage } from "./logic"

export function SettingsView() {
  const {
    scriptTag,
    copied,
    copy,
    deleteOpen,
    setDeleteOpen,
    deleting,
    handleDelete,
  } = useSettingsPage()

  return (
    <div className="p-6 space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your chatbot widget and account settings.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Code2 className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Embed Widget</CardTitle>
          </div>
          <CardDescription>
            Copy the script below and paste it before the closing{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">
              {"</body>"}
            </code>{" "}
            tag of your website.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <Textarea
            readOnly
            value={scriptTag}
            className="min-h-[90px] font-mono text-sm resize-none"
          />

          <div className="flex items-center justify-between">
            <Badge variant="secondary">Loads your chatbot automatically</Badge>

            <Button onClick={copy} variant="outline">
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

      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-destructive">
            Danger Zone
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Irreversible actions that affect your entire account.
          </p>
        </div>

        <Separator />

        <Card className="border-destructive/40">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium">Delete account data</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Permanently delete all your sources, logs, and configuration.
                  This cannot be undone.
                </p>
              </div>

              <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" className="shrink-0">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                </AlertDialogTrigger>

                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete all your sources, chat logs,
                      and configuration. Your account will be reset and this
                      action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>

                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={deleting}>
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      disabled={deleting}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {deleting ? "Deleting..." : "Yes, delete everything"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
