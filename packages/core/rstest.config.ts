import { defineConfig } from '@rstest/core';

/**
 * The core engine is pure logic, so tests run in the default Node environment
 * with no DOM dependency. Colocated `*.test.ts` files are discovered under src.
 */
export default defineConfig({});
