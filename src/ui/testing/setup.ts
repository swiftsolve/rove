// Setup for the DOM tests (`*.test.tsx`): jest-dom's matchers
// (`toBeVisible`, `toHaveAttribute`…) and a clean document after each test.
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
})
