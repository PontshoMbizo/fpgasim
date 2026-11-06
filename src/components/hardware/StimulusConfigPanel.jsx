"use client";
import React, { useEffect, useMemo, useState } from 'react';
import Editor from '@monaco-editor/react';
import { X, Plus, Trash2, Pause, Play } from 'lucide-react';
import { STIMULUS_PRESETS, STIMULUS_PRESETS_BY_ID, defaultParamsFor } from '../../lib/stimulusPresets';
import { FUNCTION_GENERATORS, functionToSamples } from '../../lib/stimulusSampling';
import { validateStimulusShape } from '../../lib/stimulusSchema';

const KIND_LABEL = { preset: 'Preset', samples: 'Samples', function: 'Function', verilog: 'Verilog' };

function newId() {
  return `stim_${Math.random().toString(36).slice(2, 9)}`;
}

// A tiny inline SVG sparkline preview for function-kind stimuli, entirely client-side —
// same reduction (functionToSamples) that runs before the values ever reach the network.
function SamplePreview({ values }) {
  if (!values?.length) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const w = 240;
  const h = 48;
  const step = w / (values.length - 1 || 1);
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} className="bg-panel border border-edge rounded">
      <polyline points={points} fill="none" stroke="#22c55e" strokeWidth="1.5" />
    </svg>
  );
}

function NumberField({ label, value, onChange, min, max }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] text-text-muted">
      {label}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="bg-base border border-edge rounded px-2 py-1 text-[12px] text-text-primary outline-none focus:border-accent"
      />
    </label>
  );
}

// Editable draft form for one stimulus block — shared by both "add new" and "edit".
function StimulusForm({ draft, setDraft, ports, onSave, onCancel }) {
  const inputPorts = useMemo(() => ports.filter((p) => p.dir === 'input'), [ports]);
  const preset = STIMULUS_PRESETS_BY_ID[draft.preset?.id];

  const setParam = (bucket, key, value) => {
    setDraft((d) => ({ ...d, [bucket]: { ...d[bucket], params: { ...d[bucket]?.params, [key]: value } } }));
  };

  const preview = draft.kind === 'function'
    ? functionToSamples(draft.function, inputPorts.find((p) => p.name === draft.target)?.width || 8).values
    : null;

  return (
    <div className="flex flex-col gap-3 p-3 bg-elevated border border-edge rounded-lg text-[12px]">
      {/* Sticky so it stays visible while scrolling the rest of a tall form (e.g. the
          samples textarea or an embedded verilog editor) — the target is required and
          must not be scrollable-past-unnoticed. */}
      <div className="flex gap-2 sticky -top-3 -mx-3 -mt-3 px-3 pt-3 pb-2 bg-elevated z-10 border-b border-edge">
        <label className="flex-1 flex flex-col gap-1 text-[11px] text-text-muted">
          Target port {!draft.target && <span className="text-danger">*</span>}
          <select
            value={draft.target || ''}
            onChange={(e) => setDraft((d) => ({ ...d, target: e.target.value }))}
            className={`bg-base border rounded px-2 py-1 text-[12px] text-text-primary outline-none ${draft.target ? 'border-edge' : 'border-danger'}`}
          >
            <option value="" disabled>Select a port…</option>
            {inputPorts.map((p) => (
              <option key={p.name} value={p.name}>{p.name}{p.range ? ` ${p.range}` : ''}</option>
            ))}
          </select>
        </label>
        <label className="flex-1 flex flex-col gap-1 text-[11px] text-text-muted">
          Authoring mode
          <select
            value={draft.kind}
            onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value }))}
            className="bg-base border border-edge rounded px-2 py-1 text-[12px] text-text-primary outline-none"
          >
            {Object.entries(KIND_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
      </div>

      {!draft.target && (
        <div className="text-[11px] text-text-muted italic">Select a target port above to configure this stimulus.</div>
      )}

      {draft.target && draft.kind === 'preset' && (
        <>
          <label className="flex flex-col gap-1 text-[11px] text-text-muted">
            Preset
            <select
              value={draft.preset?.id || ''}
              onChange={(e) => setDraft((d) => ({ ...d, preset: { id: e.target.value, params: defaultParamsFor(e.target.value) } }))}
              className="bg-base border border-edge rounded px-2 py-1 text-[12px] text-text-primary outline-none"
            >
              <option value="" disabled>Select a preset…</option>
              {STIMULUS_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          {preset && <div className="text-text-muted text-[11px]">{preset.description}</div>}
          {preset && (
            <div className="grid grid-cols-2 gap-2">
              {preset.params.filter((p) => p.type === 'number').map((p) => (
                <NumberField
                  key={p.key}
                  label={p.label}
                  min={p.min}
                  max={p.max}
                  value={draft.preset?.params?.[p.key] ?? p.default}
                  onChange={(v) => setParam('preset', p.key, v)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {draft.target && draft.kind === 'samples' && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <NumberField label="Width (bits)" value={draft.samples?.width ?? 8} onChange={(v) => setDraft((d) => ({ ...d, samples: { ...d.samples, width: v } }))} />
            <NumberField label="Step (ns)" value={draft.samples?.stepNs ?? 100} onChange={(v) => setDraft((d) => ({ ...d, samples: { ...d.samples, stepNs: v } }))} />
            <NumberField label="Start (ns)" value={draft.samples?.startNs ?? 0} onChange={(v) => setDraft((d) => ({ ...d, samples: { ...d.samples, startNs: v } }))} />
          </div>
          <label className="flex flex-col gap-1 text-[11px] text-text-muted">
            Values (comma or space separated)
            <textarea
              rows={3}
              defaultValue={(draft.samples?.values || []).join(', ')}
              onBlur={(e) => {
                const values = e.target.value.split(/[\s,]+/).filter(Boolean).map(Number).filter((n) => !Number.isNaN(n));
                setDraft((d) => ({ ...d, samples: { ...d.samples, values } }));
              }}
              className="bg-base border border-edge rounded px-2 py-1 text-[12px] text-text-primary outline-none font-mono"
            />
          </label>
        </>
      )}

      {draft.target && draft.kind === 'function' && (
        <>
          <label className="flex flex-col gap-1 text-[11px] text-text-muted">
            Generator
            <select
              value={draft.function?.generator || 'sine'}
              onChange={(e) => setDraft((d) => ({ ...d, function: { ...d.function, generator: e.target.value } }))}
              className="bg-base border border-edge rounded px-2 py-1 text-[12px] text-text-primary outline-none"
            >
              {FUNCTION_GENERATORS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Amplitude" value={draft.function?.params?.amplitude ?? 100} onChange={(v) => setParam('function', 'amplitude', v)} />
            <NumberField label="Offset" value={draft.function?.params?.offset ?? 128} onChange={(v) => setParam('function', 'offset', v)} />
            <NumberField label="Frequency (Hz)" value={draft.function?.params?.freqHz ?? 1000} onChange={(v) => setParam('function', 'freqHz', v)} />
            <NumberField label="Phase (deg)" value={draft.function?.params?.phaseDeg ?? 0} onChange={(v) => setParam('function', 'phaseDeg', v)} />
            <NumberField label="Duration (ns)" value={draft.function?.durationNs ?? 1_000_000} onChange={(v) => setDraft((d) => ({ ...d, function: { ...d.function, durationNs: v } }))} />
            <NumberField label="Sample rate (Hz)" value={draft.function?.sampleRateHz ?? 44_100} onChange={(v) => setDraft((d) => ({ ...d, function: { ...d.function, sampleRateHz: v } }))} />
          </div>
          <div className="text-text-muted text-[11px]">Preview (reduced to samples client-side before Run):</div>
          <SamplePreview values={preview} />
        </>
      )}

      {draft.target && draft.kind === 'verilog' && (
        <>
          <label className="flex flex-col gap-1 text-[11px] text-text-muted">
            Mode
            <select
              value={draft.verilog?.mode || 'procedural'}
              onChange={(e) => setDraft((d) => ({ ...d, verilog: { ...d.verilog, mode: e.target.value } }))}
              className="bg-base border border-edge rounded px-2 py-1 text-[12px] text-text-primary outline-none"
            >
              <option value="procedural">Procedural (initial/always block writing to the port)</option>
              <option value="instance">Instance (module definition + instantiation driving the port)</option>
            </select>
          </label>
          <div className="h-40 border border-edge rounded overflow-hidden">
            <Editor
              height="100%"
              path={`stimulus-${draft.id}.v`}
              defaultLanguage="verilog"
              theme="vs-dark"
              value={draft.verilog?.code || ''}
              onChange={(val) => setDraft((d) => ({ ...d, verilog: { ...d.verilog, code: val ?? '' } }))}
              options={{ minimap: { enabled: false }, fontSize: 12, lineHeight: 18, scrollBeyondLastLine: false }}
            />
          </div>
        </>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="px-2.5 py-1 rounded text-[12px] text-text-secondary hover:bg-hover">Cancel</button>
        <button
          onClick={() => onSave(draft)}
          disabled={!draft.target}
          className="px-2.5 py-1 rounded text-[12px] font-medium bg-accent/90 hover:bg-accent text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Save
        </button>
      </div>
    </div>
  );
}

// The stimulus block manager: a list of existing blocks + an "add" flow, rendered as a
// side panel over the hardware view. Only mounted when advanced mode is on.
export default function StimulusConfigPanel({ stimuli, setStimuli, ports, onClose, initialTarget, onConsumeInitialTarget, initialEditId, onConsumeInitialEditId }) {
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState(null);
  const editingId = draft?.id ?? null;

  // Defaults to a real, not-yet-claimed input port rather than leaving target empty:
  // a <select> whose bound value doesn't match any *enabled* option (i.e. only a
  // disabled placeholder) visually falls back to displaying the first real option in
  // some browsers without that ever becoming the actual value — so the field can look
  // filled in while still being empty. Always binding to a concrete port up front
  // avoids that whole class of "looks selected, isn't" bug.
  const startAdd = (target) => {
    const id = newId();
    const claimed = new Set(stimuli.map((s) => s.target));
    const inputPorts = ports.filter((p) => p.dir === 'input');
    const resolvedTarget = target || inputPorts.find((p) => !claimed.has(p.name))?.name || inputPorts[0]?.name || '';
    setDraft({ id, target: resolvedTarget, label: '', enabled: true, kind: 'preset', preset: { id: 'clock', params: defaultParamsFor('clock') } });
  };

  const startEdit = (s) => {
    setDraft(structuredClone ? structuredClone(s) : JSON.parse(JSON.stringify(s)));
  };

  // Opened via a pin's hover "+" affordance (HardwareViewer/PinOverlay) with the target
  // port already known — jump straight into the add form instead of an empty picker.
  useEffect(() => {
    if (initialTarget) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time external sync from a pin's "+" click, see comment above
      startAdd(initialTarget);
      onConsumeInitialTarget?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTarget]);

  // Opened via clicking an existing StimulusOverlay marker on the board — jump
  // straight into editing that block.
  useEffect(() => {
    if (initialEditId) {
      const s = stimuli.find((x) => x.id === initialEditId);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time external sync from a marker click, see comment above
      if (s) startEdit(s);
      onConsumeInitialEditId?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEditId]);

  const cancelEdit = () => {
    setDraft(null);
    setError(null);
  };

  const save = (d) => {
    const wireForm = d.kind === 'function' ? { ...d, kind: 'samples', samples: functionToSamples(d.function, ports.find((p) => p.name === d.target)?.width || 8) } : d;
    const errors = validateStimulusShape(wireForm);
    const dup = stimuli.some((s) => s.id !== d.id && s.target === d.target);
    if (!d.target) errors.push('Select a target port.');
    if (dup) errors.push(`Another stimulus already targets "${d.target}".`);
    if (errors.length) {
      setError(errors.join(' '));
      return;
    }
    setStimuli((cur) => {
      const exists = cur.some((s) => s.id === d.id);
      return exists ? cur.map((s) => (s.id === d.id ? d : s)) : [...cur, d];
    });
    cancelEdit();
  };

  const remove = (id) => setStimuli((cur) => cur.filter((s) => s.id !== id));
  const toggleEnabled = (id) => setStimuli((cur) => cur.map((s) => (s.id === id ? { ...s, enabled: s.enabled === false } : s)));

  return (
    <div className="absolute top-2 right-2 bottom-2 w-[340px] bg-panel border border-edge rounded-lg shadow-xl flex flex-col z-30 overflow-hidden">
      <div className="h-9 shrink-0 flex items-center justify-between px-3 border-b border-edge">
        <span className="text-[13px] font-semibold text-text-secondary">Signal Sources</span>
        <button onClick={onClose} className="text-text-muted hover:text-text-primary"><X size={15} /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
        {stimuli.length === 0 && !draft && (
          <div className="text-[12px] text-text-muted p-2">No stimulus blocks yet. Add one to drive an input port.</div>
        )}

        {stimuli.map((s) => (
          editingId === s.id && draft ? (
            <StimulusForm key={s.id} draft={draft} setDraft={setDraft} ports={ports} onSave={save} onCancel={cancelEdit} />
          ) : (
            <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded border border-edge bg-elevated text-[12px]">
              <button onClick={() => toggleEnabled(s.id)} className="text-text-muted hover:text-text-primary" title={s.enabled === false ? 'Enable' : 'Disable'}>
                {s.enabled === false ? <Play size={13} /> : <Pause size={13} />}
              </button>
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => startEdit(s)}>
                <div className="truncate text-text-primary font-mono">{s.target || '(no target)'}</div>
                <div className="text-text-muted text-[10px]">{KIND_LABEL[s.kind]}{s.kind === 'preset' ? ` · ${s.preset?.id}` : ''}</div>
              </div>
              <button onClick={() => remove(s.id)} className="text-text-muted hover:text-danger"><Trash2 size={13} /></button>
            </div>
          )
        ))}

        {editingId && draft && !stimuli.some((s) => s.id === editingId) && (
          <StimulusForm draft={draft} setDraft={setDraft} ports={ports} onSave={save} onCancel={cancelEdit} />
        )}
      </div>

      {error && <div className="px-3 py-2 text-[11px] text-danger border-t border-edge">{error}</div>}

      {!draft && (
        <button
          onClick={() => startAdd()}
          className="m-2 flex items-center justify-center gap-1.5 py-1.5 rounded border border-dashed border-edge text-[12px] text-text-secondary hover:bg-hover"
        >
          <Plus size={13} /> Add stimulus
        </button>
      )}
    </div>
  );
}
