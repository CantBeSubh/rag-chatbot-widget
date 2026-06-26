"use client"

import { useState } from "react"
import { AllowedDomainsInputProps } from "./interface"

const DOMAIN_REGEX = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

export function AllowedDomainsInput({ value, onChange }: AllowedDomainsInputProps) {
  const [inputValue, setInputValue] = useState("")
  const [error, setError] = useState("")

  const addDomain = () => {
    if (!inputValue.trim()) {
      setError("Domain cannot be empty")
      return
    }

    if (!DOMAIN_REGEX.test(inputValue)) {
      setError("Invalid domain format (e.g., example.com)")
      return
    }

    if (value.includes(inputValue)) {
      setError("Domain already added")
      return
    }

    onChange([...value, inputValue])
    setInputValue("")
    setError("")
  }

  const removeDomain = (domain: string) => {
    onChange(value.filter((d) => d !== domain))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      addDomain()
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value)
            setError("")
          }}
          onKeyDown={handleKeyDown}
          placeholder="example.com"
          className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          onClick={addDomain}
          className="px-4 py-2 bg-indigo-600 text-white rounded text-sm font-medium hover:bg-indigo-700"
        >
          Add
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {value.map((domain) => (
          <div
            key={domain}
            className="inline-flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-full text-sm"
          >
            <span>{domain}</span>
            <button
              onClick={() => removeDomain(domain)}
              className="text-gray-600 hover:text-gray-900 font-bold text-lg leading-none"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
