import { useState } from 'react';
import { type WidgetType, WIDGET_OPTIONS } from '../widget-utils';

export function Onboarding() {
  const [creating, setCreating] = useState<WidgetType | null>(null);

  const createWidget = async (type: WidgetType) => {
    setCreating(type);
    try {
      await window.pinApi.createWidget(type);
    } finally {
      setCreating(null);
    }
  };

  return (
    <main className="app onboarding">
      <div className="onboarding__titlebar">
        <span className="type-label">PIN</span>
      </div>
      <section className="onboarding__content">
        <p className="onboarding__eyebrow">WELCOME</p>
        <h1>还没有任何部件。从这里开一个：</h1>
        <div className="onboarding__options">
          {WIDGET_OPTIONS.map((option) => (
            <button
              className="onboarding__option"
              disabled={creating !== null}
              key={option.type}
              onClick={() => void createWidget(option.type)}
              type="button"
            >
              <span className={`widget-swatch widget-swatch--${option.type}`} />
              {creating === option.type ? '创建中…' : option.label}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
