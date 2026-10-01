declare module '@lynx-js/types' {
  interface GlobalProps {
    /** Raw host records injected by the native shell (see state/types.ts). */
    hostData?: unknown;
    /** BCP-47-ish system/override locale tag injected by the native shell. */
    locale?: string;
  }
}

export {};
