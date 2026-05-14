import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useLayoutContext } from '../store/LayoutContext'
import { PageHeader } from '../components/layout/PageHeader'
import { MonthNavigator } from '../components/transactions/MonthNavigator'
import { MonthSummary } from '../components/transactions/MonthSummary'
import { PageTabs, Card, Spinner, DropdownMenu, Modal, AmountInput, Select, Button, useToast, ChevronIcon } from '../components/ui'
import { transactionRepository, currencyRepository, accountRepository, budgetRepository, tagRepository } from '../services/repositories'
import { getCurrentMonth } from '../utils/dateUtils'
import { formatCurrencyValue } from '../utils/formatters'
import { fromIntFrac, toIntFrac } from '../utils/amount'
import type {
  MonthSummary as MonthSummaryType,
  MonthlyTagSummary,
  MonthlyCounterpartySummary,
  MonthlyCategoryBreakdown,
  Budget,
  BudgetInput,
  Tag,
  TagHierarchy,
} from '../types'
import { SYSTEM_TAGS } from '../types'
import { useDataRefresh } from '../hooks/useDataRefresh'

const TABS = [
  { id: 'income-expense', label: 'Budgets' },
  { id: 'tags', label: 'By Tags' },
  { id: 'counterparties', label: 'By Counterparties' },
]

type SummaryTreeItem = {
  tag_id: number
  tag_context_id?: number | null
}

export function SummariesPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { setPlusButtonConfig } = useLayoutContext()
  const dataVersion = useDataRefresh()
  const [searchParams, setSearchParams] = useSearchParams()
  const monthParam = searchParams.get('month') || getCurrentMonth()
  const tabParam = searchParams.get('tab') || 'income-expense'

  const todayMonth = getCurrentMonth()
  const [month, setMonth] = useState(monthParam)
  const [activeTab, setActiveTab] = useState(tabParam)
  const [loading, setLoading] = useState(true)
  const [decimalPlaces, setDecimalPlaces] = useState(2)
  const [currencySymbol, setCurrencySymbol] = useState('$')

  const [summary, setSummary] = useState<MonthSummaryType>({
    income: 0,
    expenses: 0,
    totalBalance: 0,
    displayCurrencySymbol: '$',
  })

  const [tagsSummary, setTagsSummary] = useState<MonthlyTagSummary[]>([])
  const [counterpartiesSummary, setCounterpartiesSummary] = useState<MonthlyCounterpartySummary[]>([])
  const [categoryBreakdown, setCategoryBreakdown] = useState<MonthlyCategoryBreakdown[]>([])

  // Budget state
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [incomeTags, setIncomeTags] = useState<Tag[]>([])
  const [expenseTags, setExpenseTags] = useState<Tag[]>([])
  const [tagHierarchy, setTagHierarchy] = useState<TagHierarchy[]>([])
  const [expandedSummaryTagIds, setExpandedSummaryTagIds] = useState<Set<number>>(new Set())
  const [modalOpen, setModalOpen] = useState(false)
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null)
  const [selectedBudgetType, setSelectedBudgetType] = useState<'income' | 'expense'>('expense')
  const [selectedTagId, setSelectedTagId] = useState<number | ''>('')
  const [budgetAmount, setBudgetAmount] = useState('')
  const [budgetPeriod, setBudgetPeriod] = useState(getCurrentMonth()) // defaults to current month
  const [submitting, setSubmitting] = useState(false)
  const [incomeExpanded, setIncomeExpanded] = useState(true)
  const [expensesExpanded, setExpensesExpanded] = useState(true)

  const isCurrentMonth = month === todayMonth

  // Update URL when month or tab changes
  useEffect(() => {
    const params = new URLSearchParams()
    params.set('month', month)
    params.set('tab', activeTab)
    setSearchParams(params, { replace: true })
  }, [month, activeTab, setSearchParams])

  // Override FAB to open Set Budget modal
  useEffect(() => {
    setPlusButtonConfig({
      onClick: () => {
        setSelectedTagId('')
        setEditingBudget(null)
        setSelectedBudgetType('expense')
        setBudgetAmount('')
        setBudgetPeriod(getCurrentMonth())
        setModalOpen(true)
      }
    })
    return () => setPlusButtonConfig(null)
  }, [setPlusButtonConfig])

  // Load data when month changes
  useEffect(() => {
    loadData()
  }, [month, dataVersion])

  const loadData = async () => {
    setLoading(true)
    try {
      const defaultCurrency = await currencyRepository.findSystem()
      const symbol = defaultCurrency?.symbol ?? '$'
      const decimals = defaultCurrency?.decimal_places ?? 2

      setCurrencySymbol(symbol)
      setDecimalPlaces(decimals)

      const [monthSum, totalBalance, tags, counterparties, breakdown, monthBudgets, allIncomeTags, allExpenseTags, hierarchy] = await Promise.all([
        transactionRepository.getMonthSummary(month),
        accountRepository.getTotalBalance(),
        transactionRepository.getMonthlyTagsSummary(month),
        transactionRepository.getMonthlyCounterpartiesSummary(month),
        transactionRepository.getMonthlyCategoryBreakdown(month),
        budgetRepository.findByMonth(month),
        tagRepository.findIncomeTags(),
        tagRepository.findExpenseTags(),
        tagRepository.getHierarchy?.() ?? Promise.resolve([]),
      ])

      setSummary({
        income: monthSum.income,
        expenses: monthSum.expenses,
        totalBalance: totalBalance,
        displayCurrencySymbol: symbol,
      })

      setTagsSummary(tags)
      setCounterpartiesSummary(counterparties)
      setCategoryBreakdown(breakdown)

      setBudgets(monthBudgets)
      setIncomeTags((allIncomeTags ?? []).filter((t) => t.id > 10 && t.id !== SYSTEM_TAGS.ARCHIVED))
      setExpenseTags((allExpenseTags ?? []).filter((t) => t.id > 10 && t.id !== SYSTEM_TAGS.ARCHIVED))
      setTagHierarchy(hierarchy)
      setExpandedSummaryTagIds(prev => {
        if (prev.size > 0) return prev
        return new Set(hierarchy.map(h => h.parent_id))
      })
    } catch (error) {
      console.error('Failed to load summaries:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleMonthChange = (newMonth: string) => {
    setMonth(newMonth)
  }

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId)
  }

  // Navigation handlers for clicking cards
  const buildTagFilterUrl = useCallback((type: 'income' | 'expense' | null, tagId: number, includeChildren = false, tagContextId?: number | null) => {
    const params = new URLSearchParams()
    params.set('month', month)
    if (type) params.set('type', type)
    params.set('tag', tagId.toString())
    if (includeChildren) params.set('includeChildren', '1')
    if (tagContextId) params.set('tagContext', tagContextId.toString())
    return `/?${params.toString()}`
  }, [month])

  const handleTagClick = useCallback((tagId: number, includeChildren = false, tagContextId?: number | null) => {
    navigate(buildTagFilterUrl(null, tagId, includeChildren, tagContextId))
  }, [buildTagFilterUrl, navigate])

  const handleCounterpartyClick = useCallback((counterpartyId: number) => {
    navigate(`/?month=${month}&counterparty=${counterpartyId}`)
  }, [month, navigate])

  const handleCategoryClick = useCallback((type: 'income' | 'expense', tagId?: number, includeChildren = false, tagContextId?: number | null) => {
    if (tagId === undefined) {
      navigate(`/?month=${month}&type=${type}`)
      return
    }
    navigate(buildTagFilterUrl(type, tagId, includeChildren, tagContextId))
  }, [buildTagFilterUrl, month, navigate])

  // Budget helpers
  const budgetType = (budget: Budget): 'income' | 'expense' => budget.type ?? 'expense'

  const getBudgetForTag = useCallback((tagId: number, type: 'income' | 'expense'): Budget | undefined => {
    return budgets.find(b => b.tag_id === tagId && budgetType(b) === type)
  }, [budgets])

  const generateMonthOptions = (): { value: string; label: string }[] => {
    const options: { value: string; label: string }[] = []
    const now = new Date()
    // Generate current month + 12 months ahead
    for (let i = 0; i <= 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() + i, 1)
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      options.push({ value, label })
    }
    return options
  }

  const parseAmountToIntFrac = (value: string): { int: number; frac: number } => {
    const parsed = parseFloat(value)
    if (isNaN(parsed)) return { int: 0, frac: 0 }
    return toIntFrac(Math.abs(parsed))
  }

  const openBudgetModal = (type: 'income' | 'expense', tagId: number, suggestedAmount: number, existingBudget?: Budget) => {
    setSelectedTagId(tagId)
    setSelectedBudgetType(type)
    if (existingBudget) {
      setEditingBudget(existingBudget)
      setSelectedBudgetType(budgetType(existingBudget))
      setBudgetAmount(fromIntFrac(existingBudget.amount_int, existingBudget.amount_frac).toString())
      // Convert budget start timestamp to YYYY-MM format
      const budgetDate = new Date(existingBudget.start * 1000)
      setBudgetPeriod(`${budgetDate.getFullYear()}-${String(budgetDate.getMonth() + 1).padStart(2, '0')}`)
    } else {
      setEditingBudget(null)
      setBudgetAmount(suggestedAmount.toFixed(decimalPlaces))
      setBudgetPeriod(getCurrentMonth()) // Always default to current month for new budgets
    }
    setModalOpen(true)
  }

  const openSetBudgetModal = async (type: 'income' | 'expense', tagId: number, suggestedAmount: number) => {
    setSelectedTagId(tagId)
    setSelectedBudgetType(type)
    setEditingBudget(null)
    setBudgetAmount(suggestedAmount.toFixed(decimalPlaces))
    try {
      const allForTag = await budgetRepository.findByTagId(tagId, type)
      const occupied = new Set(
        allForTag.map(b => {
          const d = new Date(b.start * 1000)
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        })
      )
      const [cy, cm] = getCurrentMonth().split('-').map(Number)
      let d = new Date(cy, cm - 1, 1)
      let target = getCurrentMonth()
      for (let i = 0; i < 24; i++) {
        const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        if (!occupied.has(m)) { target = m; break }
        d = new Date(d.getFullYear(), d.getMonth() + 1, 1)
      }
      setBudgetPeriod(target)
    } catch {
      setBudgetPeriod(getCurrentMonth())
    }
    setModalOpen(true)
  }

  const closeBudgetModal = () => {
    setModalOpen(false)
    setEditingBudget(null)
    setSelectedTagId('')
    setSelectedBudgetType('expense')
    setBudgetAmount('')
    setBudgetPeriod(getCurrentMonth())
  }

  const handleBudgetSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (selectedTagId === '' || !budgetAmount.trim()) return

    setSubmitting(true)
    try {
      const [year, mo] = budgetPeriod.split('-').map(Number)
      const startDate = new Date(year, mo - 1, 1)
      const endDate = new Date(year, mo, 1)

      const { int: amount_int, frac: amount_frac } = parseAmountToIntFrac(budgetAmount)
      const data: BudgetInput = {
        tag_id: selectedTagId as number,
        type: selectedBudgetType,
        amount_int,
        amount_frac,
        start: Math.floor(startDate.getTime() / 1000),
        end: Math.floor(endDate.getTime() / 1000),
      }

      if (editingBudget) {
        await budgetRepository.update(editingBudget.id, data)
        showToast('Budget updated', 'success')
      } else {
        await budgetRepository.create(data)
        showToast('Budget created', 'success')
      }

      closeBudgetModal()
      loadData()
    } catch (error) {
      console.error('Failed to save budget:', error)
      showToast(error instanceof Error ? error.message : 'Failed to save', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleBudgetDelete = async (budget: Budget) => {
    if (!confirm(`Delete budget for "${budget.tag}"? This cannot be undone.`)) return

    try {
      await budgetRepository.delete(budget.id)
      showToast('Budget deleted', 'success')
      loadData()
    } catch (error) {
      console.error('Failed to delete budget:', error)
      showToast(error instanceof Error ? error.message : 'Failed to delete', 'error')
    }
  }

  const buildBudgetCategories = (type: 'income' | 'expense'): MonthlyCategoryBreakdown[] => {
    const categoriesFromBreakdown = categoryBreakdown.filter(c => c.type === type)
    const tagIds = new Set(categoriesFromBreakdown.map(c => c.tag_id))
    const budgetOnlyCategories: MonthlyCategoryBreakdown[] = budgets
      .filter(b => budgetType(b) === type && !tagIds.has(b.tag_id))
      .map(b => ({
        tag_id: b.tag_id,
        tag: b.tag || '',
        tag_context_id: null,
        tag_context: null,
        amount: 0,
        type,
      }))

    return [...categoriesFromBreakdown, ...budgetOnlyCategories]
  }

  const getHierarchyTagName = (tagId: number): string =>
    tagHierarchy.find(h => h.parent_id === tagId)?.parent
    || tagHierarchy.find(h => h.child_id === tagId)?.child
    || incomeTags.find(t => t.id === tagId)?.name
    || expenseTags.find(t => t.id === tagId)?.name
    || ''

  const isTopLevelCategoryTag = (tagId: number): boolean =>
    tagHierarchy.some(h =>
      h.child_id === tagId &&
      (h.parent_id === SYSTEM_TAGS.INCOME || h.parent_id === SYSTEM_TAGS.EXPENSE)
    )

  const getAncestorIdsForTree = (tagId: number, validIds?: Set<number>, contextId?: number | null): number[] => {
    const result: number[] = []
    const visit = (childId: number) => {
      tagHierarchy
        .filter(h => h.child_id === childId)
        .forEach(h => {
          if (h.parent_id === SYSTEM_TAGS.INCOME || h.parent_id === SYSTEM_TAGS.EXPENSE || h.parent_id === SYSTEM_TAGS.SYSTEM || h.parent_id === SYSTEM_TAGS.DEFAULT) {
            return
          }
          if (contextId !== null && contextId !== undefined && h.parent_id === contextId) {
            return
          }
          if (!validIds || validIds.has(h.parent_id)) {
            result.push(h.parent_id)
          }
          visit(h.parent_id)
        })
    }
    visit(tagId)
    return result
  }

  const summaryItemKey = (item: SummaryTreeItem): string => `${item.tag_id}:${item.tag_context_id ?? ''}`

  const withSummaryAncestors = (items: MonthlyTagSummary[]): MonthlyTagSummary[] => {
    const byId = new Map(items.map(item => [summaryItemKey(item), { ...item }]))
    for (const item of items) {
      for (const ancestorId of getAncestorIdsForTree(item.tag_id, undefined, item.tag_context_id ?? null)) {
        const ancestorKey = summaryItemKey({ tag_id: ancestorId, tag_context_id: item.tag_context_id ?? null })
        const existing = byId.get(ancestorKey)
        if (existing) {
          existing.income += item.income
          existing.expense += item.expense
          existing.net += item.net
        } else {
          byId.set(ancestorKey, {
            tag_id: ancestorId,
            tag: getHierarchyTagName(ancestorId),
            tag_context_id: item.tag_context_id ?? null,
            tag_context: item.tag_context ?? null,
            income: item.income,
            expense: item.expense,
            net: item.net,
          })
        }
      }
    }
    return Array.from(byId.values())
  }

  const withCategoryAncestors = (items: MonthlyCategoryBreakdown[], type: 'income' | 'expense'): MonthlyCategoryBreakdown[] => {
    const typeTagIds = new Set((type === 'income' ? incomeTags : expenseTags).map(t => t.id))
    const byId = new Map(items.map(item => [summaryItemKey(item), { ...item }]))
    for (const item of items) {
      for (const ancestorId of getAncestorIdsForTree(item.tag_id, typeTagIds.size ? typeTagIds : undefined, item.tag_context_id ?? null)) {
        const ancestorKey = summaryItemKey({ tag_id: ancestorId, tag_context_id: item.tag_context_id ?? null })
        const existing = byId.get(ancestorKey)
        if (existing) {
          existing.amount += item.amount
        } else {
          byId.set(ancestorKey, {
            tag_id: ancestorId,
            tag: getHierarchyTagName(ancestorId),
            tag_context_id: item.tag_context_id ?? null,
            tag_context: item.tag_context ?? null,
            amount: item.amount,
            type,
          })
        }
      }
    }
    return Array.from(byId.values())
  }

  const tagsSummaryWithAncestors = withSummaryAncestors(tagsSummary)
  const incomeCategories = withCategoryAncestors(buildBudgetCategories('income'), 'income')
  const expenseCategories = withCategoryAncestors(buildBudgetCategories('expense'), 'expense')
  const incomeBudgets = budgets.filter(b => budgetType(b) === 'income')
  const expenseBudgets = budgets.filter(b => budgetType(b) === 'expense')
  const incomeBudgetTotal = incomeBudgets.reduce((acc, b) => fromIntFrac(b.amount_int, b.amount_frac) + acc, 0)
  const expenseBudgetTotal = expenseBudgets.reduce((acc, b) => fromIntFrac(b.amount_int, b.amount_frac) + acc, 0)
  const getCategoryActual = (category: MonthlyCategoryBreakdown, type: 'income' | 'expense'): number => {
    const budget = getBudgetForTag(category.tag_id, type)
    if (!budget || fromIntFrac(budget.amount_int, budget.amount_frac) <= 0) return category.amount
    return budget.actual ?? category.amount
  }
  const incomeActualTotal = incomeCategories.reduce((acc, c) => acc + getCategoryActual(c, 'income'), 0)
  const expenseActualTotal = expenseCategories.reduce((acc, c) => acc + getCategoryActual(c, 'expense'), 0)
  const typeTags = selectedBudgetType === 'income' ? incomeTags : expenseTags

  const toggleSummaryTag = (tagId: number) => {
    setExpandedSummaryTagIds(prev => {
      const next = new Set(prev)
      if (next.has(tagId)) next.delete(tagId)
      else next.add(tagId)
      return next
    })
  }

  const getChildIds = useCallback((tagId: number): number[] =>
    tagHierarchy
      .filter(h => h.parent_id === tagId)
      .map(h => h.child_id),
  [tagHierarchy])

  const getBranchContextId = (root: SummaryTreeItem): number | null =>
    root.tag_context_id ?? (isTopLevelCategoryTag(root.tag_id) ? root.tag_id : null)

  const getChildItems = <T extends SummaryTreeItem>(parent: T, allItems: T[], branchContextId: number | null): T[] =>
    getChildIds(parent.tag_id)
      .flatMap(childId => allItems.filter(item =>
        item.tag_id === childId &&
        (branchContextId === null
          ? (item.tag_context_id ?? null) === null
          : item.tag_context_id === branchContextId)
      ))

  const getTopLevelSummaryItems = <T extends SummaryTreeItem>(items: T[]): T[] =>
    items.filter(item => (item.tag_context_id ?? null) === null)

  const sectionProgress = (actual: number, budget: number): number => {
    if (budget <= 0) return actual > 0 ? 100 : 0
    return Math.min(100, (actual / budget) * 100)
  }

  const sectionBarColor = (type: 'income' | 'expense', progress: number): string => {
    if (type === 'income') {
      if (progress >= 100) return 'bg-green-500'
      if (progress >= 80) return 'bg-yellow-500'
      return 'bg-red-500'
    }
    if (progress >= 100) return 'bg-red-500'
    if (progress >= 80) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  const renderBudgetCategoryCard = (type: 'income' | 'expense', root: MonthlyCategoryBreakdown, allCategories: MonthlyCategoryBreakdown[]): React.ReactNode => (
    <Card key={`${type}-root-${summaryItemKey(root)}`} className="divide-y divide-gray-200 dark:divide-gray-700">
      {renderCategoryTree(type, [root], allCategories)}
    </Card>
  )

  const renderBudgetSection = (
    type: 'income' | 'expense',
    title: string,
    categories: MonthlyCategoryBreakdown[],
    actualTotal: number,
    budgetTotal: number,
    expanded: boolean,
    setExpanded: (value: boolean) => void
  ) => {
    const progress = sectionProgress(actualTotal, budgetTotal)
    return (
      <div className="mb-4">
        <button type="button" className="w-full text-left px-1 mb-2" onClick={() => setExpanded(!expanded)}>
          <div className="flex items-center justify-between text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            <span>
              {title} {formatCurrencyValue(actualTotal, currencySymbol, decimalPlaces)}/{formatCurrencyValue(budgetTotal, currencySymbol, decimalPlaces)}
            </span>
            <span className="text-xs">{expanded ? 'Hide' : 'Show'}</span>
          </div>
          <div className="mt-2 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div className={`h-full ${sectionBarColor(type, progress)} rounded-full transition-all duration-300`} style={{ width: `${progress}%` }} />
          </div>
        </button>
        {expanded && (
          categories.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 px-1">No {title.toLowerCase()} this month</p>
          ) : (
            <div className="space-y-4">
              {getTopLevelSummaryItems(categories).map(root => renderBudgetCategoryCard(type, root, categories))}
            </div>
          )
        )}
      </div>
    )
  }

  const renderTagsSummaryTree = (items: MonthlyTagSummary[], allItems = tagsSummaryWithAncestors, depth = 0, branchContextId: number | null = null): React.ReactNode => {
    return items.flatMap(tag => {
      const currentBranchContextId = depth === 0 ? getBranchContextId(tag) : branchContextId
      const children = getChildItems(tag, allItems, currentBranchContextId)
      const hasVisibleChildren = children.length > 0
      const expanded = expandedSummaryTagIds.has(tag.tag_id)
      const row = (
          <SummaryCard
            key={`tag-${summaryItemKey(tag)}`}
            asRow
            title={tag.tag}
            income={tag.income}
            expense={tag.expense}
            net={tag.net}
            currencySymbol={currencySymbol}
            decimalPlaces={decimalPlaces}
            depth={depth}
            hasChildren={hasVisibleChildren}
            expanded={expanded}
            onClick={() => hasVisibleChildren ? toggleSummaryTag(tag.tag_id) : handleTagClick(tag.tag_id, false, tag.tag_context_id)}
            onTitleClick={hasVisibleChildren ? () => handleTagClick(tag.tag_id, true, currentBranchContextId) : undefined}
          />
      )
      return hasVisibleChildren && expanded
        ? [row, renderTagsSummaryTree(children, allItems, depth + 1, currentBranchContextId)]
        : [row]
    })
  }

  const renderTagSummaryCard = (root: MonthlyTagSummary): React.ReactNode => (
    <Card key={`tag-root-${summaryItemKey(root)}`} className="divide-y divide-gray-200 dark:divide-gray-700">
      {renderTagsSummaryTree([root], tagsSummaryWithAncestors)}
    </Card>
  )

  const renderCategoryTree = (
    type: 'income' | 'expense',
    categories: MonthlyCategoryBreakdown[],
    allCategories = categories,
    depth = 0,
    branchContextId: number | null = null
  ): React.ReactNode => {
    const currentItems = depth === 0
      ? getTopLevelSummaryItems(categories)
      : categories
    return currentItems.flatMap(cat => {
      const currentBranchContextId = depth === 0 ? getBranchContextId(cat) : branchContextId
      const children = getChildItems(cat, allCategories, currentBranchContextId)
      const hasVisibleChildren = children.length > 0
      const expanded = expandedSummaryTagIds.has(cat.tag_id)
      const budget = getBudgetForTag(cat.tag_id, type)
      const sectionTags = type === 'income' ? incomeTags : expenseTags
      const canSetBudget = type === 'expense' || sectionTags.some(tag => tag.id === cat.tag_id)
      const row = (
          <CategoryCard
            key={`${type}-${summaryItemKey(cat)}`}
            asRow
            title={cat.tag}
            amount={cat.amount}
            total={type === 'income' ? summary.income : summary.expenses}
            currencySymbol={currencySymbol}
            decimalPlaces={decimalPlaces}
            type={type}
            depth={depth}
            hasChildren={hasVisibleChildren}
            expanded={expanded}
            onClick={() => hasVisibleChildren ? toggleSummaryTag(cat.tag_id) : handleCategoryClick(type, cat.tag_id, false, cat.tag_context_id)}
            onTitleClick={hasVisibleChildren ? () => handleCategoryClick(type, cat.tag_id, true, currentBranchContextId) : undefined}
            budget={budget}
            onSetBudget={canSetBudget ? () => openSetBudgetModal(type, cat.tag_id, cat.amount) : undefined}
            onAdjustBudget={budget && isCurrentMonth ? () => openBudgetModal(type, cat.tag_id, cat.amount, budget) : undefined}
            onDeleteBudget={budget ? () => handleBudgetDelete(budget) : undefined}
          />
      )
      return hasVisibleChildren && expanded
        ? [row, renderCategoryTree(type, children, allCategories, depth + 1, currentBranchContextId)]
        : [row]
    })
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Summaries" showBack />
      <MonthNavigator month={month} onChange={handleMonthChange} />
      <MonthSummary {...summary} decimalPlaces={decimalPlaces} />
      <PageTabs tabs={TABS} activeTab={activeTab} onChange={handleTabChange} />

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <div className="flex-1 overflow-visible p-4 space-y-3">
          {activeTab === 'tags' && (
            <>
              {tagsSummary.length === 0 ? (
                <EmptyState message="No transactions this month" />
              ) : (
                <div className="space-y-4">
                  {getTopLevelSummaryItems(tagsSummaryWithAncestors).map(renderTagSummaryCard)}
                </div>
              )}
            </>
          )}

          {activeTab === 'counterparties' && (
            <>
              {counterpartiesSummary.length === 0 ? (
                <EmptyState message="No transactions this month" />
              ) : (
                counterpartiesSummary.map((cp) => (
                  <SummaryCard
                    key={cp.counterparty_id}
                    title={cp.counterparty}
                    income={cp.income}
                    expense={cp.expense}
                    net={cp.net}
                    currencySymbol={currencySymbol}
                    decimalPlaces={decimalPlaces}
                    onClick={() => handleCounterpartyClick(cp.counterparty_id)}
                  />
                ))
              )}
            </>
          )}

          {activeTab === 'income-expense' && (
            <>
              {incomeCategories.length === 0 && expenseCategories.length === 0 ? (
                <EmptyState message="No transactions this month" />
              ) : (
                <>
                  {renderBudgetSection('income', 'Income', incomeCategories, incomeActualTotal, incomeBudgetTotal, incomeExpanded, setIncomeExpanded)}
                  {renderBudgetSection('expense', 'Expenses', expenseCategories, expenseActualTotal, expenseBudgetTotal, expensesExpanded, setExpensesExpanded)}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Budget Modal */}
      <Modal isOpen={modalOpen} onClose={closeBudgetModal} title={editingBudget ? 'Edit Budget' : 'Set Budget'}>
        <form onSubmit={handleBudgetSubmit} className="space-y-4">
          <Select
            label="Type"
            value={selectedBudgetType}
            onChange={(e) => {
              setSelectedBudgetType(e.target.value as 'income' | 'expense')
              setSelectedTagId('')
            }}
            required
            disabled={!!editingBudget}
            options={[
              { value: 'income', label: 'Income' },
              { value: 'expense', label: 'Expense' },
            ]}
          />

          <Select
            label="Category"
            value={selectedTagId.toString()}
            onChange={(e) => setSelectedTagId(e.target.value ? parseInt(e.target.value) : '')}
            required
            disabled={!!editingBudget || selectedTagId !== ''}
            placeholder="Select a category"
            options={typeTags.map((tag) => ({
              value: tag.id,
              label: tag.name,
            }))}
          />

          <AmountInput
            label={`Budget Amount (${currencySymbol})`}
            isPositive
            value={budgetAmount}
            onChange={setBudgetAmount}
            placeholder="500.00"
            required
          />

          <Select
            label="Budget Period"
            value={budgetPeriod}
            onChange={(e) => setBudgetPeriod(e.target.value)}
            required
            options={generateMonthOptions()}
          />

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={closeBudgetModal} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="flex-1">
              {submitting ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

// Empty state component
function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
      <svg className="w-12 h-12 mb-3 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
      <p className="text-sm">{message}</p>
    </div>
  )
}

// Summary card for tags and counterparties
interface SummaryCardProps {
  asRow?: boolean
  title: string
  income: number
  expense: number
  net: number
  currencySymbol: string
  decimalPlaces: number
  onClick: () => void
  onTitleClick?: () => void
  depth?: number
  hasChildren?: boolean
  expanded?: boolean
}

function SummaryCard({ asRow = false, title, income, expense, net, currencySymbol, decimalPlaces, onClick, onTitleClick, depth = 0, hasChildren = false, expanded = false }: SummaryCardProps) {
  const clickableStyles = 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 active:bg-gray-100 dark:active:bg-gray-800 transition-colors'
  const content = (
    <>
      <div className="flex items-center justify-between mb-2">
        <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: depth * 16 }}>
          <span className="w-4 shrink-0 text-gray-400">
            {hasChildren ? <ChevronIcon expanded={expanded} /> : null}
          </span>
          {onTitleClick ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onTitleClick()
              }}
              className="truncate font-medium text-gray-900 dark:text-gray-100 hover:text-primary-600 dark:hover:text-primary-400"
            >
              {title}
            </button>
          ) : (
            <h4 className="truncate font-medium text-gray-900 dark:text-gray-100">{title}</h4>
          )}
        </div>
        <span className={`text-sm font-semibold ${net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
          {formatCurrencyValue(net, currencySymbol, decimalPlaces)}
        </span>
      </div>
      {income > 0 && expense > 0 &&
        <div className="flex gap-4 text-sm" style={{ paddingLeft: depth * 16 + 24 }}>
          <div>
            <span className="text-gray-500 dark:text-gray-400">In: </span>
            <span className="text-green-600 dark:text-green-400">{formatCurrencyValue(income, currencySymbol, decimalPlaces)}</span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Out: </span>
            <span className="text-red-600 dark:text-red-400">{formatCurrencyValue(expense, currencySymbol, decimalPlaces)}</span>
          </div>
        </div>
      }
    </>
  )

  if (asRow) {
    return (
      <div className={`px-4 py-3 ${clickableStyles}`} onClick={onClick}>
        {content}
      </div>
    )
  }

  return (
    <Card className={`p-4 ${clickableStyles}`} onClick={onClick}>
      {content}
    </Card>
  )
}

// Category card for income/expense breakdown with progress bar
interface CategoryCardProps {
  asRow?: boolean
  title: string
  amount: number
  total: number
  currencySymbol: string
  decimalPlaces: number
  type: 'income' | 'expense'
  onClick: () => void
  onTitleClick?: () => void
  depth?: number
  hasChildren?: boolean
  expanded?: boolean
  budget?: Budget
  onSetBudget?: () => void
  onAdjustBudget?: () => void
  onDeleteBudget?: () => void
}

function CategoryCard({ asRow = false, title, amount, total, currencySymbol, decimalPlaces, type, onClick, onTitleClick, depth = 0, hasChildren = false, expanded = false, budget, onSetBudget, onAdjustBudget, onDeleteBudget }: CategoryCardProps) {
  const clickableStyles = 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 active:bg-gray-100 dark:active:bg-gray-800 transition-colors'

  // Calculate progress based on whether we have a budget
  const budgetAmountFloat = budget ? fromIntFrac(budget.amount_int, budget.amount_frac) : 0
  const hasBudget = budget && budgetAmountFloat > 0
  const budgetAmountDecimal = hasBudget ? budgetAmountFloat : 0
  const budgetActualDecimal = hasBudget ? (budget.actual ?? 0) : 0

  // Progress calculation
  let progress: number
  let barColor: string

  if (hasBudget) {
    // budgetAmountDecimal is guaranteed > 0 since hasBudget requires budget.amount > 0
    progress = Math.min(100, (budgetActualDecimal / budgetAmountDecimal) * 100)
    if (type === 'income') {
      if (progress >= 100) {
        barColor = 'bg-green-500'
      } else if (progress >= 80) {
        barColor = 'bg-yellow-500'
      } else {
        barColor = 'bg-red-500'
      }
    } else {
      if (progress >= 100) {
        barColor = 'bg-red-500'
      } else if (progress >= 80) {
        barColor = 'bg-yellow-500'
      } else {
        barColor = 'bg-green-500'
      }
    }
  } else {
    // Default percentage of total behavior
    progress = total > 0 ? (amount / total) * 100 : 0
    barColor = type === 'income' ? 'bg-green-500' : 'bg-red-500'
  }

  // Build dropdown menu items for budget actions
  const dropdownItems = []
  if (onAdjustBudget) {
    dropdownItems.push({ label: 'Adjust budget', onClick: onAdjustBudget })
  }
  if (onSetBudget) {
    dropdownItems.push({ label: 'Set budget', onClick: onSetBudget })
  }
  if (budget && onDeleteBudget) {
    dropdownItems.push({ label: 'Delete budget', onClick: onDeleteBudget, variant: 'danger' as const })
  }

  const content = (
    <>
      <div className="flex items-center justify-between mb-1">
        <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: depth * 16 }}>
          <span className="w-4 shrink-0 text-gray-400">
            {hasChildren ? <ChevronIcon expanded={expanded} /> : null}
          </span>
          {onTitleClick ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onTitleClick()
              }}
              className="truncate text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-primary-600 dark:hover:text-primary-400"
            >
              {title}
            </button>
          ) : (
            <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{title}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {hasBudget
              ? `${formatCurrencyValue(budgetActualDecimal, currencySymbol, decimalPlaces)}/${formatCurrencyValue(budgetAmountDecimal, currencySymbol, decimalPlaces)}`
              : formatCurrencyValue(amount, currencySymbol, decimalPlaces)
            }
          </span>
          {dropdownItems.length > 0 && (
            <div onClick={(e) => e.stopPropagation()}>
              <DropdownMenu items={dropdownItems} />
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div className={`h-full ${barColor} rounded-full transition-all duration-300`} style={{ width: `${progress}%` }} />
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400 w-10 text-right">
          {progress.toFixed(0)}%
        </span>
      </div>
    </>
  )

  if (asRow) {
    return (
      <div className={`px-4 py-3 ${clickableStyles}`} onClick={onClick}>
        {content}
      </div>
    )
  }

  return (
    <Card className={`p-3 ${clickableStyles}`} onClick={onClick}>
      {content}
    </Card>
  )
}
