"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const STORAGE_KEY = "synqui-waitlist";

export default function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [noted, setNoted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    setEmail(saved);
    setNoted(true);
  }, []);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    localStorage.setItem(STORAGE_KEY, email.trim());
    setNoted(true);
  }

  return (
    <form
      id="waitlist"
      onSubmit={onSubmit}
      className="flex flex-col gap-2 items-center min-[1070px]:items-start"
    >
      <div className="flex flex-col sm:flex-row items-center gap-2">
        <Input
          id="waitlist-email"
          type="email"
          name="email"
          required
          autoComplete="email"
          aria-label="Email address"
          placeholder="you@example.com"
          value={email}
          disabled={noted}
          onChange={(event) => setEmail(event.target.value)}
          className="h-10 w-64 sm:w-60 bg-background dark:bg-background"
        />
        <Button
          type="submit"
          size="lg"
          disabled={noted}
          className="w-fit hover:bg-white hover:text-foreground dark:hover:bg-secondary/80 dark:hover:text-foreground"
        >
          {noted ? "Noted" : "Join the TestFlight waitlist"}
        </Button>
      </div>
      <p role="status" className="text-sm min-h-5">
        {noted ? "Noted on this device." : ""}
      </p>
    </form>
  );
}
