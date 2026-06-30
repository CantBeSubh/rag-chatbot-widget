"use client"

import { useEffect, useRef, useState } from "react"

import { Input } from "@/components/ui/input"

const HEX_RE = /^#[0-9a-fA-F]{6}$/

interface ColorPickerFieldProps {
  id: string
  value: string
  placeholder?: string
  delay?: number
  onChange: (value: string) => void
  onBlur?: () => void
}

export function ColorPickerField({
  id,
  value,
  placeholder = "#6366f1",
  delay = 400,
  onChange,
  onBlur,
}: ColorPickerFieldProps) {
  const [local, setLocal] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync when the form resets or an external value change comes in
  useEffect(() => {
    setLocal(value)
  }, [value])

  function handleChange(next: string) {
    setLocal(next)
    if (timer.current) clearTimeout(timer.current)
    if (HEX_RE.test(next)) {
      timer.current = setTimeout(() => onChange(next), delay)
    }
  }

  function handleBlur() {
    // Flush immediately so the form value is up-to-date before validation
    if (timer.current) clearTimeout(timer.current)
    if (HEX_RE.test(local)) onChange(local)
    onBlur?.()
  }

  const pickerValue = HEX_RE.test(local) ? local : placeholder

  return (
    <div className="flex gap-2">
      <Input
        type="color"
        id={id}
        value={pickerValue}
        onChange={(e) => handleChange(e.target.value)}
        className="h-9 w-12 shrink-0 cursor-pointer p-1"
      />
      <Input
        value={local}
        placeholder={placeholder}
        className="flex-1"
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
      />
    </div>
  )
}
