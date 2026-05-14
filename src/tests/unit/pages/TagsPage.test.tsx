import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '../../../components/ui'
import { TagsPage } from '../../../pages/TagsPage'
import { LayoutProvider } from '../../../store/LayoutContext'
import { TestPlusButton } from '../../helpers/TestPlusButton'
import { tagRepository } from '../../../services/repositories'
import { SYSTEM_TAGS } from '../../../types'

// Mock repositories
vi.mock('../../../services/repositories', () => ({
    tagRepository: {
        findUserTags: vi.fn(),
        findIncomeTags: vi.fn(),
        findExpenseTags: vi.fn(),
        getHierarchy: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        canDelete: vi.fn(),
        addRelation: vi.fn(),
        removeRelation: vi.fn(),
    },
}))

// Mock confirm
const mockConfirm = vi.spyOn(window, 'confirm')

const mockExpenseTags = [
    { id: 11, name: 'Food', created_at: 1704067200, updated_at: 1704067200 },
    { id: 12, name: 'Transport', created_at: 1704067200, updated_at: 1704067200 },
]

const mockIncomeTags = [
    { id: 21, name: 'Salary', created_at: 1704067200, updated_at: 1704067200 },
    { id: 12, name: 'Transport', created_at: 1704067200, updated_at: 1704067200 }, // Shared tag
]

describe('TagsPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(tagRepository.findUserTags).mockResolvedValue([])
        vi.mocked(tagRepository.getHierarchy).mockResolvedValue([])
        vi.mocked(tagRepository.findExpenseTags).mockResolvedValue(mockExpenseTags)
        vi.mocked(tagRepository.findIncomeTags).mockResolvedValue(mockIncomeTags)
        vi.mocked(tagRepository.canDelete).mockResolvedValue({ canDelete: true })
        vi.mocked(tagRepository.addRelation).mockResolvedValue(undefined)
        vi.mocked(tagRepository.removeRelation).mockResolvedValue(undefined)
        mockConfirm.mockReturnValue(true)
    })

    const renderTagsPage = () => {
        return render(
            <MemoryRouter>
                <LayoutProvider>
                    <ToastProvider>
                        <TagsPage />
                        <TestPlusButton />
                    </ToastProvider>
                </LayoutProvider>
            </MemoryRouter>
        )
    }

    it('shows loading spinner initially', () => {
        vi.mocked(tagRepository.findExpenseTags).mockImplementation(() => new Promise(() => { }))
        renderTagsPage()
        expect(screen.getByRole('status')).toBeInTheDocument()
    })

    it('renders expense and income tags correctly', async () => {
        renderTagsPage()

        await waitFor(() => {
            expect(screen.queryByRole('status')).not.toBeInTheDocument()
        })

        expect(screen.getByText('Expense Tags')).toBeInTheDocument()
        expect(screen.getByText('Income Tags')).toBeInTheDocument()

        expect(screen.getByText('Food')).toBeInTheDocument()
        expect(screen.getByText('Salary')).toBeInTheDocument()

        // Transport appears in both sections
        const transportTags = screen.getAllByText('Transport')
        expect(transportTags).toHaveLength(2)

        // Check for "both" badge
        const bothBadges = screen.getAllByText('both')
        expect(bothBadges).toHaveLength(2)
    })

    it('shows empty state when no tags', async () => {
        vi.mocked(tagRepository.findExpenseTags).mockResolvedValue([])
        vi.mocked(tagRepository.findIncomeTags).mockResolvedValue([])

        renderTagsPage()

        await waitFor(() => {
            expect(screen.getByText('No expense tags')).toBeInTheDocument()
            expect(screen.getByText('No income tags')).toBeInTheDocument()
        })
    })

    it('opens and closes the add tag modal', async () => {
        renderTagsPage()
        await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())

        fireEvent.click(screen.getByRole('button', { name: /add/i }))
        expect(screen.getByRole('dialog')).toBeInTheDocument()
        expect(screen.getByText('Add Tag')).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
        await waitFor(() => {
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        })
    })

    it('creates a new expense tag correctly', async () => {
        renderTagsPage()
        await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())

        fireEvent.click(screen.getByRole('button', { name: /add/i }))

        fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'New Tag' } })
        fireEvent.click(screen.getByRole('button', { name: 'Expense' }))
        fireEvent.click(screen.getByRole('button', { name: /save/i }))

        await waitFor(() => {
            expect(tagRepository.create).toHaveBeenCalledWith({
                name: 'New Tag',
                parent_ids: [SYSTEM_TAGS.DEFAULT, SYSTEM_TAGS.EXPENSE],
            })
        })
    })

    it('creates a new "both" tag correctly', async () => {
        renderTagsPage()
        await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())

        fireEvent.click(screen.getByRole('button', { name: /add/i }))

        fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Shared Tag' } })
        fireEvent.click(screen.getByRole('button', { name: 'Both' }))
        fireEvent.click(screen.getByRole('button', { name: /save/i }))

        await waitFor(() => {
            expect(tagRepository.create).toHaveBeenCalledWith({
                name: 'Shared Tag',
                parent_ids: [SYSTEM_TAGS.DEFAULT, SYSTEM_TAGS.EXPENSE, SYSTEM_TAGS.INCOME],
            })
        })
    })

    it('edits an existing tag', async () => {
        renderTagsPage()
        await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())

        const editButtons = screen.getAllByText('Edit')
        fireEvent.click(editButtons[0]) // Edit Food

        expect(screen.getByText('Edit Tag')).toBeInTheDocument()
        expect(screen.getByDisplayValue('Food')).toBeInTheDocument()

        fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Healthy Food' } })
        fireEvent.click(screen.getByRole('button', { name: /save/i }))

        await waitFor(() => {
            expect(tagRepository.update).toHaveBeenCalledWith(11, {
                name: 'Healthy Food',
                parent_ids: [SYSTEM_TAGS.DEFAULT, SYSTEM_TAGS.EXPENSE],
            })
        })
    })

    it('renames a nested tag without replacing its parent relation', async () => {
        const auto = { id: 100, name: 'Auto', created_at: 1704067200, updated_at: 1704067200 }
        const gas = { id: 101, name: 'Gas', created_at: 1704067200, updated_at: 1704067200 }
        vi.mocked(tagRepository.findUserTags).mockResolvedValue([auto, gas])
        vi.mocked(tagRepository.findExpenseTags).mockResolvedValue([auto, gas])
        vi.mocked(tagRepository.findIncomeTags).mockResolvedValue([])
        vi.mocked(tagRepository.getHierarchy).mockResolvedValue([
            { parent_id: SYSTEM_TAGS.EXPENSE, parent: 'expense', child_id: 100, child: 'Auto', depth: 1 },
            { parent_id: 100, parent: 'Auto', child_id: 101, child: 'Gas', depth: 1 },
            { parent_id: SYSTEM_TAGS.EXPENSE, parent: 'expense', child_id: 101, child: 'Gas', depth: 2 },
        ])

        renderTagsPage()
        await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())

        const editButtons = screen.getAllByText('Edit')
        fireEvent.click(editButtons[1])

        expect(screen.getByText('Edit Tag')).toBeInTheDocument()
        expect(screen.getByDisplayValue('Gas')).toBeInTheDocument()
        expect(screen.getByText('Type')).toBeInTheDocument()

        fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Fuel' } })
        fireEvent.click(screen.getByRole('button', { name: /save/i }))

        await waitFor(() => {
            expect(tagRepository.update).toHaveBeenCalledWith(101, {
                name: 'Fuel',
                parent_ids: [100, SYSTEM_TAGS.DEFAULT, SYSTEM_TAGS.EXPENSE],
            })
        })
    })

    it('allows a nested tag to keep its parent and change type to both', async () => {
        const auto = { id: 100, name: 'Auto', created_at: 1704067200, updated_at: 1704067200 }
        const maintenance = { id: 101, name: 'Maintenance', created_at: 1704067200, updated_at: 1704067200 }
        vi.mocked(tagRepository.findUserTags).mockResolvedValue([auto, maintenance])
        vi.mocked(tagRepository.findExpenseTags).mockResolvedValue([auto, maintenance])
        vi.mocked(tagRepository.findIncomeTags).mockResolvedValue([])
        vi.mocked(tagRepository.getHierarchy).mockResolvedValue([
            { parent_id: SYSTEM_TAGS.EXPENSE, parent: 'expense', child_id: 100, child: 'Auto', depth: 1 },
            { parent_id: 100, parent: 'Auto', child_id: 101, child: 'Maintenance', depth: 1 },
            { parent_id: SYSTEM_TAGS.EXPENSE, parent: 'expense', child_id: 101, child: 'Maintenance', depth: 2 },
        ])

        renderTagsPage()
        await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())

        fireEvent.click(screen.getAllByText('Edit')[1])
        fireEvent.click(screen.getByRole('button', { name: 'Both' }))
        fireEvent.click(screen.getByRole('button', { name: /save/i }))

        await waitFor(() => {
            expect(tagRepository.update).toHaveBeenCalledWith(101, {
                name: 'Maintenance',
                parent_ids: [100, SYSTEM_TAGS.DEFAULT, SYSTEM_TAGS.EXPENSE, SYSTEM_TAGS.INCOME],
            })
        })
    })

    it('shows a both-type tag as top-level in the unrelated root after adding it as a sub-tag', async () => {
        const auto = { id: 100, name: 'Auto', created_at: 1704067200, updated_at: 1704067200 }
        const gas = { id: 101, name: 'Gas', created_at: 1704067200, updated_at: 1704067200 }
        vi.mocked(tagRepository.findUserTags).mockResolvedValue([auto, gas])
        vi.mocked(tagRepository.findExpenseTags).mockResolvedValue([auto, gas])
        vi.mocked(tagRepository.findIncomeTags).mockResolvedValue([gas])
        vi.mocked(tagRepository.getHierarchy).mockResolvedValue([
            { parent_id: SYSTEM_TAGS.EXPENSE, parent: 'expense', child_id: 100, child: 'Auto' },
            { parent_id: 100, parent: 'Auto', child_id: 101, child: 'Gas' },
            { parent_id: SYSTEM_TAGS.EXPENSE, parent: 'expense', child_id: 101, child: 'Gas' },
            { parent_id: SYSTEM_TAGS.INCOME, parent: 'income', child_id: 101, child: 'Gas' },
        ])

        renderTagsPage()
        await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())

        expect(screen.getByText('Auto')).toBeInTheDocument()
        expect(screen.getAllByText('Gas')).toHaveLength(2)
        expect(screen.queryByText('No income tags')).not.toBeInTheDocument()
    })

    it('does not show an income-only sub-tag under the expense side of a both-type parent', async () => {
        const work = { id: 100, name: 'Work', created_at: 1704067200, updated_at: 1704067200 }
        const freelance = { id: 101, name: 'Freelance', created_at: 1704067200, updated_at: 1704067200 }
        vi.mocked(tagRepository.findUserTags).mockResolvedValue([work, freelance])
        vi.mocked(tagRepository.findExpenseTags).mockResolvedValue([work])
        vi.mocked(tagRepository.findIncomeTags).mockResolvedValue([work, freelance])
        vi.mocked(tagRepository.getHierarchy).mockResolvedValue([
            { parent_id: SYSTEM_TAGS.EXPENSE, parent: 'expense', child_id: 100, child: 'Work' },
            { parent_id: SYSTEM_TAGS.INCOME, parent: 'income', child_id: 100, child: 'Work' },
            { parent_id: 100, parent: 'Work', child_id: 101, child: 'Freelance' },
            { parent_id: SYSTEM_TAGS.INCOME, parent: 'income', child_id: 101, child: 'Freelance' },
        ])

        renderTagsPage()
        await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())

        const sections = screen.getAllByText('Work').map(node => node.closest('section'))
        const expenseSection = screen.getByText('Expense Tags').closest('section')
        const incomeSection = screen.getByText('Income Tags').closest('section')

        expect(sections.filter(section => section === expenseSection)).toHaveLength(1)
        expect(sections.filter(section => section === incomeSection)).toHaveLength(1)
        expect(expenseSection).not.toHaveTextContent('Freelance')
        expect(incomeSection).toHaveTextContent('Freelance')
    })

    it('folds and unfolds nested tag rows', async () => {
        const auto = { id: 100, name: 'Auto', created_at: 1704067200, updated_at: 1704067200 }
        const gas = { id: 101, name: 'Gas', created_at: 1704067200, updated_at: 1704067200 }
        vi.mocked(tagRepository.findUserTags).mockResolvedValue([auto, gas])
        vi.mocked(tagRepository.findExpenseTags).mockResolvedValue([auto, gas])
        vi.mocked(tagRepository.findIncomeTags).mockResolvedValue([])
        vi.mocked(tagRepository.getHierarchy).mockResolvedValue([
            { parent_id: SYSTEM_TAGS.EXPENSE, parent: 'expense', child_id: 100, child: 'Auto' },
            { parent_id: 100, parent: 'Auto', child_id: 101, child: 'Gas' },
        ])

        renderTagsPage()
        await waitFor(() => expect(screen.getByText('Gas')).toBeInTheDocument())

        fireEvent.click(screen.getByText('Auto'))
        expect(screen.queryByText('Gas')).not.toBeInTheDocument()

        fireEvent.click(screen.getByText('Auto'))
        expect(screen.getByText('Gas')).toBeInTheDocument()
    })

    it('adds an existing tag as a sub-tag', async () => {
        const auto = { id: 100, name: 'Auto', created_at: 1704067200, updated_at: 1704067200 }
        const fuel = { id: 101, name: 'Fuel', created_at: 1704067200, updated_at: 1704067200 }
        vi.mocked(tagRepository.findUserTags).mockResolvedValue([auto, fuel])
        vi.mocked(tagRepository.findExpenseTags).mockResolvedValue([auto, fuel])
        vi.mocked(tagRepository.findIncomeTags).mockResolvedValue([])
        vi.mocked(tagRepository.getHierarchy).mockResolvedValue([
            { parent_id: SYSTEM_TAGS.EXPENSE, parent: 'expense', child_id: 100, child: 'Auto' },
            { parent_id: SYSTEM_TAGS.EXPENSE, parent: 'expense', child_id: 101, child: 'Fuel' },
        ])

        renderTagsPage()
        await waitFor(() => expect(screen.getByText('Auto')).toBeInTheDocument())

        fireEvent.click(screen.getAllByRole('button', { expanded: false })[0])
        await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Add sub-tag' })).toBeInTheDocument())
        fireEvent.click(screen.getByRole('menuitem', { name: 'Add sub-tag' }))
        await waitFor(() => expect(screen.getByText('Add sub-tag to Auto')).toBeInTheDocument())

        const subTagInput = screen.getByRole('combobox', { name: /sub-tag/i })
        fireEvent.focus(subTagInput)
        fireEvent.click(screen.getByRole('option', { name: 'Fuel' }))
        fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0])

        await waitFor(() => {
            expect(tagRepository.addRelation).toHaveBeenCalledWith(101, 100)
        })
    })

    it('creates a new tag from the add sub-tag modal', async () => {
        const auto = { id: 100, name: 'Auto', created_at: 1704067200, updated_at: 1704067200 }
        vi.mocked(tagRepository.findUserTags).mockResolvedValue([auto])
        vi.mocked(tagRepository.findExpenseTags).mockResolvedValue([auto])
        vi.mocked(tagRepository.findIncomeTags).mockResolvedValue([])
        vi.mocked(tagRepository.getHierarchy).mockResolvedValue([
            { parent_id: SYSTEM_TAGS.EXPENSE, parent: 'expense', child_id: 100, child: 'Auto' },
        ])

        renderTagsPage()
        await waitFor(() => expect(screen.getByText('Auto')).toBeInTheDocument())

        fireEvent.click(screen.getByRole('button', { expanded: false }))
        await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Add sub-tag' })).toBeInTheDocument())
        fireEvent.click(screen.getByRole('menuitem', { name: 'Add sub-tag' }))
        await waitFor(() => expect(screen.getByText('Add sub-tag to Auto')).toBeInTheDocument())

        const subTagInput = screen.getByRole('combobox', { name: /sub-tag/i })
        fireEvent.change(subTagInput, { target: { value: 'Fuel' } })
        fireEvent.keyDown(subTagInput, { key: 'Enter' })
        fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0])

        await waitFor(() => {
            expect(tagRepository.create).toHaveBeenCalledWith({
                name: 'Fuel',
                parent_ids: [100],
            })
        })
    })

    it('removes a child relation from a nested tag row', async () => {
        const auto = { id: 100, name: 'Auto', created_at: 1704067200, updated_at: 1704067200 }
        const gas = { id: 101, name: 'Gas', created_at: 1704067200, updated_at: 1704067200 }
        vi.mocked(tagRepository.findUserTags).mockResolvedValue([auto, gas])
        vi.mocked(tagRepository.findExpenseTags).mockResolvedValue([auto, gas])
        vi.mocked(tagRepository.findIncomeTags).mockResolvedValue([])
        vi.mocked(tagRepository.getHierarchy).mockResolvedValue([
            { parent_id: SYSTEM_TAGS.EXPENSE, parent: 'expense', child_id: 100, child: 'Auto' },
            { parent_id: 100, parent: 'Auto', child_id: 101, child: 'Gas' },
        ])

        renderTagsPage()
        await waitFor(() => expect(screen.getByText('Gas')).toBeInTheDocument())

        fireEvent.click(screen.getAllByRole('button', { expanded: false })[1])
        await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Remove relation' })).toBeInTheDocument())
        fireEvent.click(screen.getByRole('menuitem', { name: 'Remove relation' }))

        await waitFor(() => {
            expect(tagRepository.removeRelation).toHaveBeenCalledWith(101, 100)
        })
    })

    it('deletes a tag after confirmation', async () => {
        renderTagsPage()
        await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())

        const deleteButtons = screen.getAllByText('Delete')
        fireEvent.click(deleteButtons[0]) // Delete Food

        await waitFor(() => {
            expect(mockConfirm).toHaveBeenCalled()
        })
        await waitFor(() => {
            expect(tagRepository.delete).toHaveBeenCalledWith(11)
        })
    })

    it('shows error toast when delete is not allowed', async () => {
        vi.mocked(tagRepository.canDelete).mockResolvedValue({
            canDelete: false,
            reason: 'Used in transactions'
        })

        renderTagsPage()
        await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())

        const deleteButtons = screen.getAllByText('Delete')
        fireEvent.click(deleteButtons[0])

        await waitFor(() => {
            expect(screen.getByText(/Cannot delete: Used in transactions/i)).toBeInTheDocument()
        })
        expect(tagRepository.delete).not.toHaveBeenCalled()
    })

    it('handles loading errors', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
        vi.mocked(tagRepository.findExpenseTags).mockRejectedValue(new Error('Load failed'))

        renderTagsPage()

        await waitFor(() => {
            expect(consoleSpy).toHaveBeenCalledWith('Failed to load tags:', expect.any(Error))
        })
        consoleSpy.mockRestore()
    })

    it('does not submit empty tag name', async () => {
        renderTagsPage()
        await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
        fireEvent.click(screen.getByRole('button', { name: 'Add' }))
        await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        expect(tagRepository.create).not.toHaveBeenCalled()
    })

    it('creates income-type tag correctly', async () => {
        renderTagsPage()
        await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
        fireEvent.click(screen.getByRole('button', { name: 'Add' }))
        await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
        const nameInput = screen.getByPlaceholderText('e.g., Groceries')
        fireEvent.change(nameInput, { target: { value: 'Freelance' } })
        // Switch to income type
        fireEvent.click(screen.getByRole('button', { name: 'Income' }))
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() => {
            expect(tagRepository.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'Freelance',
                    parent_ids: expect.arrayContaining([SYSTEM_TAGS.INCOME]),
                })
            )
        })
    })

    it('shows generic message when save throws non-Error', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
        vi.mocked(tagRepository.create).mockRejectedValue('string error')
        renderTagsPage()
        await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
        fireEvent.click(screen.getByRole('button', { name: 'Add' }))
        await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
        const nameInput = screen.getByPlaceholderText('e.g., Groceries')
        fireEvent.change(nameInput, { target: { value: 'NewTag' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() => {
            expect(tagRepository.create).toHaveBeenCalled()
        })
        consoleSpy.mockRestore()
    })

    it('shows generic message when delete throws non-Error', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
        mockConfirm.mockReturnValue(true)
        vi.mocked(tagRepository.canDelete).mockResolvedValue({ canDelete: true })
        vi.mocked(tagRepository.delete).mockRejectedValue('string error')
        renderTagsPage()
        await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
        fireEvent.click(screen.getAllByText('Delete')[0])
        await waitFor(() => expect(tagRepository.delete).toHaveBeenCalled())
        consoleSpy.mockRestore()
    })

    it('does not delete when confirm is cancelled', async () => {
        mockConfirm.mockReturnValue(false)
        vi.mocked(tagRepository.canDelete).mockResolvedValue({ canDelete: true })
        renderTagsPage()
        await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
        fireEvent.click(screen.getAllByText('Delete')[0])
        await waitFor(() => expect(tagRepository.canDelete).toHaveBeenCalled())
        expect(tagRepository.delete).not.toHaveBeenCalled()
    })
})
