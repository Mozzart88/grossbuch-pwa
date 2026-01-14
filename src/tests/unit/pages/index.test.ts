import { describe, it, expect } from 'vitest'
import * as pages from '../../../pages'

describe('pages index', () => {
  it('exports TransactionsPage', () => {
    expect(pages.TransactionsPage).toBeDefined()
  })

  it('exports AddTransactionPage', () => {
    expect(pages.AddTransactionPage).toBeDefined()
  })

  it('exports EditTransactionPage', () => {
    expect(pages.EditTransactionPage).toBeDefined()
  })

  it('exports SettingsPage', () => {
    expect(pages.SettingsPage).toBeDefined()
  })

  it('exports AccountsPage', () => {
    expect(pages.AccountsPage).toBeDefined()
  })

  it('exports TagsPage', () => {
    expect(pages.TagsPage).toBeDefined()
  })

  it('exports CounterpartiesPage', () => {
    expect(pages.CounterpartiesPage).toBeDefined()
  })

  it('exports CurrenciesPage', () => {
    expect(pages.CurrenciesPage).toBeDefined()
  })

  it('exports ExportPage', () => {
    expect(pages.ExportPage).toBeDefined()
  })

  it('exports DownloadPage', () => {
    expect(pages.DownloadPage).toBeDefined()
  })
})
