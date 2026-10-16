import { useState } from 'react';

type Props = { value: string; onValueChange: (value: string) => void };

export function OperatorPinInput({ value, onValueChange }: Props) {
  const [editing, setEditing] = useState(false);
  function beginEditing() {
    if (!editing) {
      onValueChange('');
      setEditing(true);
    }
  }
  return <input
    type="password"
    inputMode="numeric"
    name="operator-confirmation-pin"
    aria-label="PIN de acesso do operador"
    autoComplete="new-password"
    data-lpignore="true"
    data-1p-ignore="true"
    spellCheck={false}
    autoCapitalize="none"
    readOnly={!editing}
    value={editing ? value : ''}
    onPointerDown={beginEditing}
    onKeyDown={event => {
      if (!editing && /^[0-9]$/.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        setEditing(true);
        onValueChange(event.key);
      }
    }}
    onPaste={event => {
      if (!editing) {
        event.preventDefault();
        setEditing(true);
        onValueChange(event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 8));
      }
    }}
    onChange={event => {
      if (editing) onValueChange(event.target.value.replace(/\D/g, '').slice(0, 8));
    }}
    maxLength={8}
  />;
}
