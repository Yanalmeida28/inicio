export function SupportUnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return <span role="status" aria-label={`${count} mensagens não lidas`} style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 22, height: 22, padding: '0 6px', marginLeft: 6, borderRadius: 12, background: '#dc2626', color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0}}>{count > 99 ? '99+' : count}</span>;
}
