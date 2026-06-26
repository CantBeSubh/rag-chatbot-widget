"use client"

import { Plus, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

import { AllowedDomainsInputProps } from "./interface"
import { useAllowedDomainsInput } from "./logic"

export function AllowedDomainsInput({ value, onChange }: AllowedDomainsInputProps) {
  const {
    inputValue,
    setInputValue,
    setError,
    handleKeyDown,
    addDomain,
    removeDomain,
    error,
  } = useAllowedDomainsInput({ value, onChange })

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          id="allowed_domains"
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value)
            setError("")
          }}
          onKeyDown={handleKeyDown}
          placeholder="example.com"
          className="flex-1"
        />
        <Button type="button" size="sm" onClick={addDomain}>
          <Plus />
          Add
        </Button>
      </div>

      <FieldError>{error || null}</FieldError>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((domain) => (
            <Badge key={domain} variant="secondary" className="gap-1 pr-1">
              {domain}
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="size-4 hover:bg-transparent"
                onClick={() => removeDomain(domain)}
                aria-label={`Remove ${domain}`}
              >
                <X />
              </Button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
