import type { RestorePlan } from './inspection'
export interface RestoreInput { name: string; bytes: ArrayBuffer }
export interface RestoreCredentials { appKey: string; sharedKey: string; settings: Record<string, string>; salt: string }
export interface RestoreRequest { inputs: RestoreInput[]; sharedKey?: string; session?: string; credentials?: RestoreCredentials }
export interface PreparedRestore { plan: RestorePlan; files: { destination: string; bytes: Uint8Array }[] }
