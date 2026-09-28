export type DecryptedExportSource =
  | { kind: 'main' }
  | { kind: 'shared' }
  | { kind: 'legacy' }
  | { kind: 'workspace'; workspaceId: number }

export interface DecryptedExportRequest {
  source: DecryptedExportSource
  key: string
  session: string
}
