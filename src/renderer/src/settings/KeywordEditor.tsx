import styles from './fields.module.css';
import { useState } from 'react';

export function KeywordEditor({
  label,
  value,
  change,
}: {
  label: string;
  value: string[];
  change: (value: string[]) => void;
}) {
  const [input, setInput] = useState('');
  const add = () => {
    const text = input.trim();
    if (text) change([...new Set([...value, text])]);
    setInput('');
  };
  return (
    <div className={'keyword-editor'}>
      <label>
        {label}
        <input
          aria-label={label}
          value={input}
          placeholder="输入关键字，按回车添加"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              add();
            }
          }}
        />
      </label>
      <div className={styles.keywordTags}>
        {value.map((keyword) => (
          <span className={styles.keywordTag} key={keyword}>
            {keyword}
            <button
              type="button"
              aria-label={'删除 ' + keyword}
              onClick={() => change(value.filter((v) => v !== keyword))}
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
