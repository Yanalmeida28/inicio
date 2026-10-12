import { useLayoutEffect, useRef, type ReactNode } from 'react';

export function AdminResponsiveTable({ children }: { children: ReactNode }) {
  const container = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const table = container.current?.querySelector('table');
    const labels = Array.from(table?.querySelectorAll('thead th') ?? []).map(th => th.textContent ?? '');
    table?.querySelectorAll('tbody tr').forEach(row => {
      row.querySelectorAll('td').forEach((cell, index) => {
        if (cell.colSpan === 1) cell.dataset.label = labels[index] ?? '';
      });
    });
  }, [children]);
  return <div ref={container} className="stock-table-wrap admin-responsive-table">{children}</div>;
}
