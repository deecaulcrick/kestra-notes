import "./GeneralTab.css";

export function GeneralTab() {
  return (
    <div className="general-tab">
      <h2 className="settings-section-title">General</h2>

      <section className="general-section">
        <h3 className="general-section-heading">Editor</h3>
        <Toggle label="Hide Markdown" description="Show formatted output instead of raw syntax" defaultChecked />
        <Toggle label="Auto-fill titles when pasting web links" defaultChecked />
        <Toggle label="Autocomplete tags, WikiLinks, emoji" defaultChecked />
        <Toggle label="Automatically sort todos upon completion" />
        <Toggle label="Keep tags during export" defaultChecked />
      </section>

      <section className="general-section">
        <h3 className="general-section-heading">New Notes</h3>
        <SelectRow label="Create new notes with" options={["Heading 1", "Heading 2", "Empty"]} />
        <SelectRow label="Add tags at" options={["Bottom of note", "Top of note"]} />
      </section>
    </div>
  );
}

function Toggle({
  label,
  description,
  defaultChecked,
}: {
  label: string;
  description?: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="toggle-row">
      <div className="toggle-text">
        <span className="toggle-label">{label}</span>
        {description && <span className="toggle-desc">{description}</span>}
      </div>
      <input type="checkbox" className="toggle-input" defaultChecked={defaultChecked} />
    </label>
  );
}

function SelectRow({ label, options }: { label: string; options: string[] }) {
  return (
    <div className="select-row">
      <span className="toggle-label">{label}</span>
      <select className="general-select">
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}
