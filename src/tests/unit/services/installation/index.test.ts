import { describe, it, expect } from 'vitest'
import * as installation from '../../../../services/installation'

describe('installation index', () => {
  it('exports registerInstallation', () => {
    expect(installation.registerInstallation).toBeDefined()
  })
})
