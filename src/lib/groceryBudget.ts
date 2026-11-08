// The monthly grocery budget (brief grocery-budget): how much of it is used, and what to say about it. Pure; the card keeps the typing.

export interface BudgetStatus {
  /** Share of the budget spent, 0 to 100 (the bar stops at full). */
  pct: number;
  /** Cents left, or 0 once spent reaches the budget. */
  left: number;
  /** Cents spent above the budget. */
  over: number;
  /** `ok` under 80%, `near` from 80% to the budget, `over` above it. */
  tone: 'ok' | 'near' | 'over';
  /** Cents the whole month's list is planned above the budget while spending is still inside it (0 when not). */
  plannedOver: number;
}

export function budgetStatus(budget: number, spent: number, planned: number): BudgetStatus {
  const over = Math.max(0, spent - budget);
  const tone = spent > budget ? 'over' : spent >= budget * 0.8 ? 'near' : 'ok';
  return { pct: Math.min(100, Math.round((spent / budget) * 100)), left: Math.max(0, budget - spent), over, tone, plannedOver: !over && planned > budget ? planned - budget : 0 };
}
