#!/bin/sh
cd "$(dirname "$0")/.." && npx vitest run tests/director-quality.test.ts --reporter=verbose
