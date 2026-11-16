import { useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const STORAGE_KEY = "synqui-waitlist"

function readSaved() {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? ""
  } catch {
    return ""
  }
}

export function WaitlistForm() {
  const [email, setEmail] = useState(readSaved)
  const [done, setDone] = useState(() => readSaved().length > 0)
  const [error, setError] = useState("")

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
      setError("Enter an email address.")
      return
    }
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* the success state still stands on this page */
    }
    setEmail(next)
    setError("")
    setDone(true)
  }

  return (
    <form className="waitlist" onSubmit={onSubmit} noValidate>
      <label htmlFor="waitlist-email">Email</label>
      <div className="waitlist-row">
        <Input
          id="waitlist-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@domain.com"
          value={email}
          disabled={done}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "waitlist-error" : "waitlist-hint"}
          onChange={(event) => {
            setEmail(event.target.value)
            if (error) setError("")
          }}
          className="waitlist-input"
        />
        <Button
          type="submit"
          disabled={done}
          className="waitlist-button"
        >
          {done ? "Noted" : "Join the TestFlight waitlist"}
        </Button>
      </div>
      <p id="waitlist-hint" className={done ? "sr-only" : undefined}>
        TestFlight, when it opens.
      </p>
      {error ? (
        <p id="waitlist-error" role="alert">
          {error}
        </p>
      ) : null}
      <p role="status" className={done ? undefined : "sr-only"}>
        {done ? "Noted on this device." : ""}
      </p>
    </form>
  )
}
