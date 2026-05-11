import React from 'react';
import type { ConfigPanelProps } from '../registry-types';
import { ResourceCombobox } from './ResourceCombobox';
import { ConfigField } from './fields/ConfigField';
import { TimeoutField } from './fields/TimeoutField';
import { useResourceGroups } from './hooks/useResourceGroups';

const ALL_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '*', '#'];

export function MenuConfigPanel({
  config,
  onConfigChange,
  listResources,
  onCreateResource,
  locale,
}: ConfigPanelProps) {
  const { groups, loading, handleCreateResource } = useResourceGroups(
    [{ type: 'audio_clip', labelKey: 'audioClips', fallback: 'Audio Clips' }],
    listResources,
    onCreateResource,
    locale
  );

  const promptClipId = (config.prompt_clip_id as string) ?? '';
  const timeout = (config.timeout as number) ?? 5;
  const options = (config.options as Array<{ digit: string; label?: string }>) ?? [{ digit: '1' }];

  const usedDigits = new Set(options.map((o) => o.digit));

  function handleAddOption() {
    const next = ALL_DIGITS.find((d) => !usedDigits.has(d));
    if (!next) return;
    onConfigChange({ options: [...options, { digit: next }] });
  }

  function handleRemoveOption(index: number) {
    onConfigChange({ options: options.filter((_, i) => i !== index) });
  }

  function handleDigitChange(index: number, digit: string) {
    onConfigChange({ options: options.map((o, i) => (i === index ? { ...o, digit } : o)) });
  }

  function handleLabelChange(index: number, label: string) {
    onConfigChange({
      options: options.map((o, i) => {
        if (i !== index) return o;
        const next = { ...o };
        if (label) next.label = label;
        else delete next.label;
        return next;
      }),
    });
  }

  return (
    <>
      <ConfigField label={locale?.configLabels.promptClip ?? 'Prompt'}>
        <ResourceCombobox
          groups={groups}
          value={promptClipId}
          loading={loading}
          placeholder={locale?.configLabels.search ?? 'Search...'}
          onSelect={(id, name) => onConfigChange({ prompt_clip_id: id }, { promptClipName: name })}
          onCreateResource={handleCreateResource}
          selectLabel={locale?.combobox.select}
          noResultsLabel={locale?.combobox.noResults}
          loadingLabel={locale?.combobox.loading}
          createNewPrefix={locale?.combobox.createNew}
        />
      </ConfigField>
      <TimeoutField
        value={timeout}
        min={1}
        max={30}
        onChange={(t) => onConfigChange({ timeout: t })}
        locale={locale}
      />
      <ConfigField
        label={locale?.configLabels.options ?? 'Options'}
        action={
          <button
            type="button"
            className="ds-dial-plan-menu-options__add"
            onClick={handleAddOption}
            disabled={options.length >= 12}
          >
            + {locale?.configLabels.addOption ?? 'Add'}
          </button>
        }
      >
        <div className="ds-dial-plan-menu-options">
          {options.map((opt, i) => (
            <div key={i} className="ds-dial-plan-menu-options__card">
              <div className="ds-dial-plan-menu-options__field ds-dial-plan-menu-options__field--label">
                <span className="ds-dial-plan-menu-options__field-label">
                  {locale?.configLabels.optionLabel ?? 'Label'}{' '}
                  <span className="ds-dial-plan-menu-options__field-hint">(optional)</span>
                </span>
                <input
                  type="text"
                  className="ds-dial-plan-config-field__input"
                  value={opt.label ?? ''}
                  maxLength={20}
                  placeholder={locale?.configLabels.optionLabelPlaceholder ?? 'e.g. Sales'}
                  onChange={(e) => handleLabelChange(i, e.target.value)}
                />
              </div>
              <div className="ds-dial-plan-menu-options__field ds-dial-plan-menu-options__field--digit">
                <span className="ds-dial-plan-menu-options__field-label">
                  {locale?.configLabels.digit ?? 'Digit'}
                </span>
                <select
                  className="ds-dial-plan-config-field__input"
                  value={opt.digit}
                  onChange={(e) => handleDigitChange(i, e.target.value)}
                >
                  {ALL_DIGITS.filter((d) => d === opt.digit || !usedDigits.has(d)).map((d) => (
                    <option key={d} value={d}>
                      {d === '*' ? '✱' : d}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="ds-dial-plan-menu-options__remove"
                onClick={() => handleRemoveOption(i)}
                title={locale?.configLabels.removeOption ?? 'Remove'}
                aria-label={locale?.configLabels.removeOption ?? 'Remove'}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </ConfigField>
    </>
  );
}
