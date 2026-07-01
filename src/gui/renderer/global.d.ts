import type { GuiApi } from '../shared/types.ts'

declare global {
  interface Window {
    microcode: GuiApi
  }
}

export {}
