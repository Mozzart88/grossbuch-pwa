import { describe, it, expect } from 'vitest'
import * as repositories from '../../../services/repositories'

describe('repositories index', () => {
  it('exports accountRepository', () => {
    expect(repositories.accountRepository).toBeDefined()
  })

  it('exports tagRepository', () => {
    expect(repositories.tagRepository).toBeDefined()
  })

  it('exports walletRepository', () => {
    expect(repositories.walletRepository).toBeDefined()
  })

  it('exports counterpartyRepository', () => {
    expect(repositories.counterpartyRepository).toBeDefined()
  })

  it('exports currencyRepository', () => {
    expect(repositories.currencyRepository).toBeDefined()
  })

  it('exports transactionRepository', () => {
    expect(repositories.transactionRepository).toBeDefined()
  })

  it('exports settingsRepository', () => {
    expect(repositories.settingsRepository).toBeDefined()
  })
})
