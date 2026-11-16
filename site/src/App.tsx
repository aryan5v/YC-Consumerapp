import { motion, useReducedMotion } from "motion/react"

import { AsciiCoast } from "@/components/ascii-coast"
import { PhoneFrame } from "@/components/phone-frame"
import { WaitlistForm } from "@/components/waitlist-form"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const steps = [
  {
    index: "01",
    title: "The day opens",
    body: "One case. One question. That is the whole day.",
  },
  {
    index: "02",
    title: "Five moves",
    body: "Tap an object in the scene. Each tap plays a generated clip and leaves a clue. You have five.",
    pips: true,
  },
  {
    index: "03",
    title: "Name what happened",
    body: "Solve the case. A wrong answer loses the day.",
  },
]

const modes = [
  {
    title: "The case",
    body: "The daily film. Five taps, then an answer.",
    src: "/shots/case.webp",
    alt: "A filmed scene under a bridge. The spire and the red glow are outlined, and the question reads: Do you hear that? Which way?",
  },
  {
    title: "The world",
    body: "An open coast to wander. Landmarks open into filmed scenes.",
    src: "/shots/dawn.webp",
    alt: "The open world at dawn: a quiet coast, a lantern, trees, and the sea, marked day one.",
  },
  {
    title: "Dream a world",
    body: "Type a prompt. A clip comes back in seconds.",
    src: "/shots/tap.webp",
    alt: "A lantern in the world filling with light, the moment a landmark becomes a scene.",
  },
]

export default function App() {
  const reduce = useReducedMotion()

  return (
    <div className="shell">
      <a className="sr-only" href="#content">
        Skip to content
      </a>
      <header className="nav wrap">
        <a className="brand" href="#top">
          <img src="/brand/synqui-logo.png" alt="" width={32} height={32} />
          Synqui
        </a>
        <nav className="nav-links" aria-label="Page">
          <a href="#case">Case</a>
          <a href="#modes">Modes</a>
          <a href="#fasth3">FastH3</a>
          <a className="nav-cta" href="#waitlist">
            Waitlist
          </a>
        </nav>
      </header>

      <main id="content">
        <section className="hero wrap" id="top" aria-labelledby="pitch">
          <motion.div
            className="hero-copy"
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <Badge variant="outline" className="eyebrow h-auto border-moonstone/25 px-3 py-1">
              iPhone
            </Badge>
            <h1 id="pitch">A world you walk into every day.</h1>
            <p className="lead">
              Synqui is a daily case you solve inside generated film. Tap the
              scene, follow the clues, and name what happened before the day
              is gone.
            </p>
            <div id="waitlist">
              <WaitlistForm />
            </div>
            <AsciiCoast />
          </motion.div>
          <motion.div
            className="hero-phone"
            initial={reduce ? false : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: reduce ? 0 : 0.15, ease: "easeOut" }}
          >
            <PhoneFrame
              src="/shots/dusk.webp"
              alt="The Synqui world at dusk on day one: a quiet coast, a lantern, trees, and an open sea."
              caption="The world, day one"
              priority
            />
          </motion.div>
        </section>

        <section className="section wrap" id="case" aria-labelledby="case-title">
          <div className="section-head">
            <h2 id="case-title">How a case works</h2>
            <p>Three beats. Then the day keeps the answer, or it does not.</p>
          </div>
          <ol className="steps">
            {steps.map((step) => (
              <li key={step.index}>
                <Card className="step mode-card h-full">
                  <CardHeader>
                    <p className="step-index">{step.index}</p>
                    <CardTitle className="text-lg">{step.title}</CardTitle>
                    <CardDescription className="text-[0.95rem] leading-relaxed text-moonstone/78">
                      {step.body}
                    </CardDescription>
                    {step.pips ? (
                      <div className="pips" aria-hidden="true">
                        <span data-spent="true" />
                        <span data-spent="true" />
                        <span />
                        <span />
                        <span />
                      </div>
                    ) : null}
                  </CardHeader>
                </Card>
              </li>
            ))}
          </ol>
          <p className="quiet" style={{ marginTop: 18 }}>
            A voice game master is in the room, if you would rather talk than tap.
          </p>
        </section>

        <section className="section wrap" id="modes" aria-labelledby="modes-title">
          <div className="section-head">
            <h2 id="modes-title">Three ways in</h2>
            <p>The case is the day. The world is where you wander. Dream is a prompt that becomes a clip.</p>
          </div>
          <div className="modes">
            {modes.map((mode) => (
              <Card key={mode.title} className="mode-card">
                <div className="mode-stage">
                  <PhoneFrame className="mode-phone" src={mode.src} alt={mode.alt} />
                </div>
                <CardHeader>
                  <CardTitle className="text-lg">{mode.title}</CardTitle>
                  <CardDescription className="text-[0.95rem] leading-relaxed text-moonstone/78">
                    {mode.body}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        <section className="section wrap" id="fasth3" aria-labelledby="tech-title">
          <div className="tech">
            <p className="film" aria-hidden="true">
              [ ] [ ] [ ] [ ] [ ] [ ] [ ]
            </p>
            <p className="tech-kicker">Real time</p>
            <h2 id="tech-title">FastH3, while you are still in the scene</h2>
            <p className="quiet">
              Every clip is rendered by FastH3, a real-time video model on
              NVIDIA GB200s. Convex holds the live state of the case. Built
              with Capy and Revyl.
            </p>
          </div>
        </section>
      </main>

      <footer className="site-footer wrap">
        <a className="footer-brand" href="#top">
          <img src="/brand/synqui-logo.png" alt="" width={36} height={36} />
          Synqui
        </a>
        <p className="quiet">synqui.com</p>
        <p className="quiet">
          Built at the YC Consumer Mobile Hackathon with Capy, Revyl, and Convex.
        </p>
        <nav className="nav-links" aria-label="Footer">
          <a href="#case">Case</a>
          <a href="#modes">Modes</a>
          <a href="#waitlist">Join the TestFlight waitlist</a>
        </nav>
      </footer>
    </div>
  )
}
