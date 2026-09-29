import { useState, type KeyboardEvent } from 'react';
import { Badge, Button, Input } from '@polymirror/ui';

export interface TagInputProps {
  id: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  maxLength?: number;
  ariaDescribedBy?: string;
}

/** Free-text tag list: Enter or "Add" appends, each tag has a remove button. */
export function TagInput({
  id,
  value,
  onChange,
  placeholder,
  maxLength = 128,
  ariaDescribedBy,
}: TagInputProps) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const tag = draft.trim().slice(0, maxLength);
    if (tag && !value.some((v) => v.toLowerCase() === tag.toLowerCase())) onChange([...value, tag]);
    setDraft('');
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add();
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          aria-describedby={ariaDescribedBy}
        />
        <Button type="button" variant="secondary" onClick={add} disabled={!draft.trim()}>
          Add
        </Button>
      </div>
      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-1" aria-label="Added items">
          {value.map((tag) => (
            <li key={tag}>
              <Badge className="gap-1.5">
                {tag}
                <button
                  type="button"
                  className="cursor-pointer text-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  aria-label={`Remove ${tag}`}
                  onClick={() => onChange(value.filter((v) => v !== tag))}
                >
                  ✕
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
