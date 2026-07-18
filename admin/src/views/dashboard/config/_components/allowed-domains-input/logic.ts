import { useState } from "react"

import { AllowedDomainsInputProps } from "./interface"

const DOMAIN_REGEX = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

export function useAllowedDomainsInput({ value, onChange }: AllowedDomainsInputProps) {

  const [inputValue, setInputValue] = useState("")
  const [error, setError] = useState("")

  const addDomain = () => {
    if (!inputValue.trim()) {
      setError("Domain cannot be empty")
      return
    }

    if (inputValue !== "*" && !DOMAIN_REGEX.test(inputValue)) {
      setError("Invalid domain format (e.g., example.com or *)")
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

  return {
    inputValue,
    setInputValue,
    error,
    setError,
    addDomain,
    removeDomain,
    handleKeyDown
  }
}
