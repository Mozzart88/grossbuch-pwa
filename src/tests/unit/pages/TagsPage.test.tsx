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
        findIncomeTags: vi.fn(),
        findExpenseTags: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        canDelete: vi.fn(),
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
        vi.mocked(tagRepository.findExpenseTags).mockResolvedValue(mockExpenseTags)
        vi.mocked(tagRepository.findIncomeTags).mockResolvedValue(mockIncomeTags)
        vi.mocked(tagRepository.canDelete).mockResolvedValue({ canDelete: true })
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
})
