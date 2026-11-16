"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const WAITLIST_EMAIL = "waitlist@synqui.com";

export default function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const subject = encodeURIComponent("Synqui TestFlight waitlist");
    const body = encodeURIComponent(`Please add ${email.trim()} to the Synqui TestFlight waitlist.`);
    window.location.href = `mailto:${WAITLIST_EMAIL}?subject=${subject}&body=${body}`;
    setSent(true);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col items-center gap-3">
      <div className="flex flex-row items-center gap-2">
        <Input
          id="waitlist-email"
          type="email"
          name="email"
          required
          autoComplete="email"
          aria-label="Email address"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="h-10 w-48 sm:w-64 bg-background dark:bg-background 4xl:h-18 4xl:w-96 4xl:text-2xl"
        />
        <Button type="submit" className="w-fit 4xl:text-2xl 4xl:px-12 4xl:h-18" size="lg">
          Join the waitlist
        </Button>
      </div>
      <p role="status" className="text-sm min-h-5 4xl:text-2xl">
        {sent
          ? `Your mail app should open with the request. If it doesn't, write to ${WAITLIST_EMAIL}.`
          : ""}
      </p>
    </form>
  );
}
