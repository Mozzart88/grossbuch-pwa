export class LazyRelation<T extends object> {
  private _cache: T[] | null = null
  private _pending: Array<{ op: 'add' | 'remove'; item: T }> = []
  private readonly _loader: () => Promise<T[]>

  constructor(loader: () => Promise<T[]>) {
    this._loader = loader
  }

  // Thenable: `await tag.parents`
  then<R1 = T[], R2 = never>(
    onfulfilled?: ((value: T[]) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
  ): Promise<R1 | R2> {
    return this._load().then(onfulfilled, onrejected)
  }

  catch<R = never>(
    onrejected?: ((reason: unknown) => R | PromiseLike<R>) | null
  ): Promise<T[] | R> {
    return this._load().catch(onrejected)
  }

  private async _load(): Promise<T[]> {
    if (this._cache === null) {
      this._cache = await this._loader()
    }
    return this._cache
  }

  append(item: T): void {
    this._pending.push({ op: 'add', item })
    this._cache?.push(item)
  }

  remove(item: T): void {
    this._pending.push({ op: 'remove', item })
    if (this._cache) {
      this._cache = this._cache.filter(i => i !== item)
    }
  }

  /** Consume and clear staged changes (called by BaseModel.save) */
  drainPending(): Array<{ op: 'add' | 'remove'; item: T }> {
    const pending = [...this._pending]
    this._pending = []
    return pending
  }

  invalidate(): void {
    this._cache = null
  }
}
