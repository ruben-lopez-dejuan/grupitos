"use client";

import { useI18n } from "@/components/i18n";
import { TASK_CODES } from "@/lib/assignments";
import { normalizeTaskOrder, TASK_ORDER_ITEMS, type TaskOrderItem } from "@/lib/group-generator";
import { keyOf } from "@/lib/i18n";

/** The order in which tasks are given, moved with arrows; switched-off tasks stay in place, greyed out. */
export function TaskOrderPanel({ order, onChange, active, weighted }: {
  order: TaskOrderItem[] | undefined;
  onChange: (order: TaskOrderItem[]) => void;
  /** Tasks the current options actually assign. */
  active: Record<TaskOrderItem, boolean>;
  /** Scoring on: scramblers, runners and judges are solved together. */
  weighted: boolean;
}) {
  const { t } = useI18n();
  const items = normalizeTaskOrder(order);
  const move = (index: number, step: -1 | 1) => {
    const next = [...items];
    [next[index], next[index + step]] = [next[index + step], next[index]];
    onChange(next);
  };
  const isDefault = items.every((item, index) => item === TASK_ORDER_ITEMS[index]);
  return <div className="task-order">
    <p className="setup-note">{weighted ? t("taskOrder.weighted") : t("taskOrder.rules")}</p>
    <ol>{items.map((item, index) => <li key={item} className={active[item] ? "" : "off"}>
      <span className="task-order-position">{index + 1}</span>
      <i className={`cell-chip mini ${item}`} aria-hidden="true">{TASK_CODES[item]}</i>
      <strong>{t(keyOf("taskOrder.items", item))}</strong>
      {!active[item] && <small>{t("taskOrder.off")}</small>}
      <span className="task-order-moves">
        <button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={t("taskOrder.up", { task: t(keyOf("taskOrder.items", item)) })}>↑</button>
        <button type="button" disabled={index === items.length - 1} onClick={() => move(index, 1)} aria-label={t("taskOrder.down", { task: t(keyOf("taskOrder.items", item)) })}>↓</button>
      </span>
    </li>)}</ol>
    {!isDefault && <button type="button" className="plain" onClick={() => onChange([...TASK_ORDER_ITEMS])}>{t("taskOrder.reset")}</button>}
  </div>;
}
