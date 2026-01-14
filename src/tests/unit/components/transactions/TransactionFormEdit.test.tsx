import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TransactionForm } from '../../../../components/transactions/TransactionForm'
import type { Wallet, Tag, Counterparty, Currency, Account, Transaction } from '../../../../types'
import { SYSTEM_TAGS } from '../../../../types'

// Mock repositories
vi.mock('../../../../services/repositories', () => ({
    walletRepository: {
        findActive: vi.fn(),
    },
    tagRepository: {
        findIncomeTags: vi.fn(),
        findExpenseTags: vi.fn(),
    },
    counterpartyRepository: {
        findAll: vi.fn(),
    },
    currencyRepository: {
        findAll: vi.fn(),
        setExchangeRate: vi.fn(),
    },
    transactionRepository: {
        createIncome: vi.fn(),
        createExpense: vi.fn(),
        createTransfer: vi.fn(),
        createExchange: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
    },
}))

import {
    walletRepository,
    tagRepository,
    counterpartyRepository,
    currencyRepository,
    transactionRepository,
} from '../../../../services/repositories'

const mockWalletRepository = vi.mocked(walletRepository)
const mockTagRepository = vi.mocked(tagRepository)
const mockCounterpartyRepository = vi.mocked(counterpartyRepository)
const mockCurrencyRepository = vi.mocked(currencyRepository)
const mockTransactionRepository = vi.mocked(transactionRepository)

const mockAccount: Account = {
    id: 1,
    wallet_id: 1,
    currency_id: 1,
    real_balance: 15000,
    actual_balance: 15000,
    created_at: 1704067200,
    updated_at: 1704067200,
    wallet: 'Cash',
    currency: 'USD',
    is_default: true,
}

const mockAccount2: Account = {
    id: 2,
    wallet_id: 2,
    currency_id: 2,
    real_balance: 20000,
    actual_balance: 20000,
    created_at: 1704067200,
    updated_at: 1704067200,
    wallet: 'Bank',
    currency: 'EUR',
}

const mockWallets: Wallet[] = [
    {
        id: 1,
        name: 'Cash',
        icon: '💵',
        color: '#4CAF50',
        created_at: 1704067200,
        updated_at: 1704067200,
        is_default: true,
        accounts: [mockAccount],
    },
    {
        id: 2,
        name: 'Bank',
        icon: '🏦',
        color: '#2196F3',
        created_at: 1704067200,
        updated_at: 1704067200,
        accounts: [mockAccount2],
    },
]

const mockExpenseTags: Tag[] = [
    { id: 10, name: 'Food', created_at: 1704067200, updated_at: 1704067200 },
]

const mockIncomeTags: Tag[] = [
    { id: 20, name: 'Salary', created_at: 1704067200, updated_at: 1704067200 },
]

const mockFeeTags: Tag[] = [
    { id: SYSTEM_TAGS.FEE, name: 'Fee', created_at: 1704067200, updated_at: 1704067200 },
]

const mockCurrencies: Currency[] = [
    { id: 1, code: 'USD', name: 'US Dollar', symbol: '$', decimal_places: 2, created_at: 1704067200, updated_at: 1704067200, is_default: true },
    { id: 2, code: 'EUR', name: 'Euro', symbol: '€', decimal_places: 2, created_at: 1704067200, updated_at: 1704067200 },
]

describe('TransactionForm Editing mode', () => {
    const mockOnSubmit = vi.fn()
    const mockOnCancel = vi.fn()

    beforeEach(() => {
        vi.clearAllMocks()
        mockWalletRepository.findActive.mockResolvedValue(mockWallets)
        mockTagRepository.findExpenseTags.mockResolvedValue(mockExpenseTags)
        mockTagRepository.findIncomeTags.mockResolvedValue(mockIncomeTags)
        mockCounterpartyRepository.findAll.mockResolvedValue([])
        mockCurrencyRepository.findAll.mockResolvedValue(mockCurrencies)
        mockTransactionRepository.create.mockResolvedValue({} as any)
        mockTransactionRepository.update.mockResolvedValue({} as any)
    })

    const renderForm = (initialData?: Transaction) => {
        return render(
            <TransactionForm
                initialData={initialData}
                onSubmit={mockOnSubmit}
                onCancel={mockOnCancel}
            />
        )
    }

    it('populates fields for an expense transaction', async () => {
        const expenseData: Transaction = {
            id: new Uint8Array(16),
            created_at: 1704803400,
            updated_at: 1704803400,
            lines: [
                {
                    id: new Uint8Array(16),
                    trx_id: new Uint8Array(16),
                    account_id: 1,
                    tag_id: 10,
                    sign: '-',
                    real_amount: 5000,
                    actual_amount: 5000,
                    wallet: 'Cash',
                    currency: 'USD',
                    tag: 'Food',
                },
            ],
        }

        renderForm(expenseData)

        await waitFor(() => {
            expect(screen.getByLabelText(/^Amount/i)).toHaveValue(50)
            expect(screen.getByRole('combobox', { name: /account/i })).toHaveValue('1')
            expect(screen.getByRole('combobox', { name: /category/i })).toHaveValue('10')
            expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument()
        })
    })

    it('populates fields for an income transaction', async () => {
        const incomeData: Transaction = {
            id: new Uint8Array(16),
            created_at: 1704803400,
            updated_at: 1704803400,
            lines: [
                {
                    id: new Uint8Array(16),
                    trx_id: new Uint8Array(16),
                    account_id: 1,
                    tag_id: 20,
                    sign: '+',
                    real_amount: 100000,
                    actual_amount: 100000,
                    wallet: 'Cash',
                    currency: 'USD',
                    tag: 'Salary',
                },
            ],
        }

        renderForm(incomeData)

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Income' }).className).toContain('shadow')
            expect(screen.getByLabelText(/^Amount/i)).toHaveValue(1000)
            expect(screen.getByRole('combobox', { name: /category/i })).toHaveValue('20')
        })
    })

    it('populates fields for a transfer transaction', async () => {
        const transferData: Transaction = {
            id: new Uint8Array(16),
            created_at: 1704803400,
            updated_at: 1704803400,
            lines: [
                {
                    id: new Uint8Array(16),
                    trx_id: new Uint8Array(16),
                    account_id: 1,
                    tag_id: SYSTEM_TAGS.TRANSFER,
                    sign: '-',
                    real_amount: 2000,
                    actual_amount: 2000,
                },
                {
                    id: new Uint8Array(16),
                    trx_id: new Uint8Array(16),
                    account_id: 1, // To account (simplifying mock wallets)
                    tag_id: SYSTEM_TAGS.TRANSFER,
                    sign: '+',
                    real_amount: 2000,
                    actual_amount: 2000,
                },
            ],
        }

        renderForm(transferData)

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Transfer' }).className).toContain('shadow')
            expect(screen.getByLabelText(/^Amount/i)).toHaveValue(20)
        })
    })

    it('updates instead of creating when initialData is present', async () => {
        const expenseData: Transaction = {
            id: new Uint8Array([1, 2, 3]),
            created_at: 1704803400,
            updated_at: 1704803400,
            lines: [
                {
                    id: new Uint8Array(16),
                    trx_id: new Uint8Array([1, 2, 3]),
                    account_id: 1,
                    tag_id: 10,
                    sign: '-',
                    real_amount: 5000,
                    actual_amount: 5000,
                },
            ],
        }

        renderForm(expenseData)

        await waitFor(() => {
            expect(screen.getByLabelText(/^Amount/i)).toHaveValue(50)
            expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument()
        })

        fireEvent.click(screen.getByRole('button', { name: 'Update' }))

        await waitFor(() => {
            expect(mockTransactionRepository.update).toHaveBeenCalled()
            expect(mockTransactionRepository.create).not.toHaveBeenCalled()
        })
    })

    it('updates instead of creating when initialData is present (income)', async () => {
        const incomeData: Transaction = {
            id: new Uint8Array([1, 2, 3]),
            created_at: 1704803400,
            updated_at: 1704803400,
            lines: [
                {
                    id: new Uint8Array(16),
                    trx_id: new Uint8Array([1, 2, 3]),
                    account_id: 1,
                    tag_id: 20,
                    sign: '+',
                    real_amount: 100000,
                    actual_amount: 100000,
                },
            ],
        }

        renderForm(incomeData)
        await waitFor(() => {
            expect(screen.getByLabelText(/^Amount/i)).toHaveValue(1000)
        })

        fireEvent.click(screen.getByRole('button', { name: 'Update' }))
        await waitFor(() => {
            expect(mockTransactionRepository.update).toHaveBeenCalled()
        })
    })

    it('updates instead of creating when initialData is present (transfer)', async () => {
        const transferData: Transaction = {
            id: new Uint8Array([1, 2, 3]),
            created_at: 1704803400,
            updated_at: 1704803400,
            lines: [
                {
                    id: new Uint8Array(16),
                    trx_id: new Uint8Array([1, 2, 3]),
                    account_id: 1,
                    tag_id: SYSTEM_TAGS.TRANSFER,
                    sign: '-',
                    real_amount: 2000,
                    actual_amount: 2000,
                },
                {
                    id: new Uint8Array(16),
                    trx_id: new Uint8Array([1, 2, 3]),
                    account_id: 2,
                    tag_id: SYSTEM_TAGS.TRANSFER,
                    sign: '+',
                    real_amount: 2000,
                    actual_amount: 2000,
                },
            ],
        }

        renderForm(transferData)
        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Transfer' }).className).toContain('shadow')
        })

        fireEvent.click(screen.getByRole('button', { name: 'Update' }))
        await waitFor(() => {
            expect(mockTransactionRepository.update).toHaveBeenCalled()
        })
    })

    it('updates instead of creating when initialData is present (exchange)', async () => {
        const exchangeData: Transaction = {
            id: new Uint8Array([1, 2, 3]),
            created_at: 1704803400,
            updated_at: 1704803400,
            lines: [
                {
                    id: new Uint8Array(16),
                    trx_id: new Uint8Array([1, 2, 3]),
                    account_id: 1,
                    tag_id: SYSTEM_TAGS.EXCHANGE,
                    sign: '-',
                    real_amount: 10000,
                    actual_amount: 10000,
                },
                {
                    id: new Uint8Array(16),
                    trx_id: new Uint8Array([1, 2, 3]),
                    account_id: 2,
                    tag_id: SYSTEM_TAGS.EXCHANGE,
                    sign: '+',
                    real_amount: 9200,
                    actual_amount: 9200,
                },
            ],
        }

        renderForm(exchangeData)
        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Exchange' }).className).toContain('shadow')
        })

        fireEvent.click(screen.getByRole('button', { name: 'Update' }))
        await waitFor(() => {
            expect(mockTransactionRepository.update).toHaveBeenCalled()
        })
    })

    it('shows error if account is not selected', async () => {
        render(
            <TransactionForm
                onSubmit={() => { }}
                onCancel={() => { }}
            />
        )

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
        })

        // Force clear account select
        fireEvent.change(screen.getByRole('combobox', { name: /account/i }), { target: { value: '' } })
        fireEvent.click(screen.getByRole('button', { name: 'Add' }))

        await waitFor(() => {
            expect(screen.getByText('Account is required')).toBeInTheDocument()
        })
    })

    it('early returns when initialData has no lines', async () => {
        const emptyData: Transaction = {
            id: new Uint8Array(16),
            created_at: 1704803400,
            updated_at: 1704803400,
            lines: [],
        }

        renderForm(emptyData)

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument()
            // Should stay in default (expense) mode
            expect(screen.getByRole('button', { name: 'Expense' }).className).toContain('shadow')
        })
    })
})
