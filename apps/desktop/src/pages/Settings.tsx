import { useAppStore } from "../stores/appStore";

export function Settings() {
  const { settings, settingsLoading, updateSettings } = useAppStore();

  if (settingsLoading || !settings) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-500">
        Loading settings...
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6 max-w-lg">
      <h2 className="text-lg font-semibold text-gray-100">Settings</h2>

      {/* Core */}
      <SettingsSection title="Core">
        <ToggleSetting
          label="Enable auto-upload"
          description="Automatically upload detected screenshots"
          value={settings.autoUpload}
          onChange={(v) => updateSettings({ autoUpload: v })}
        />
        <ToggleSetting
          label="Launch at login"
          description="Start SnapLink when you log in"
          value={settings.autoStart}
          onChange={(v) => updateSettings({ autoStart: v })}
        />
        <ToggleSetting
          label="Show notifications"
          description="Show native notifications on upload"
          value={settings.uploadNotification}
          onChange={(v) => updateSettings({ uploadNotification: v })}
        />
      </SettingsSection>

      {/* Upload Format */}
      <SettingsSection title="Clipboard Format">
        <SelectSetting
          label="Copy format"
          description="What gets copied to clipboard after upload"
          value={settings.copyFormat}
          options={[
            { value: "url", label: "Plain URL" },
            { value: "markdown", label: "Markdown image" },
            { value: "html", label: "HTML img tag" },
          ]}
          onChange={(v) =>
            updateSettings({ copyFormat: v as "url" | "markdown" | "html" })
          }
        />
      </SettingsSection>

      {/* Privacy */}
      <SettingsSection title="Privacy">
        <ToggleSetting
          label="Burn after read (default)"
          description="New uploads auto-delete after first view"
          value={settings.defaultBurnAfterRead}
          onChange={(v) => updateSettings({ defaultBurnAfterRead: v })}
        />
        <ToggleSetting
          label="Strip EXIF metadata"
          description="Remove location and device info from images"
          value={settings.stripExifMetadata}
          onChange={(v) => updateSettings({ stripExifMetadata: v })}
        />
        <SelectSetting
          label="Default expiration"
          description="How long screenshots stay online"
          value={settings.defaultExpiresIn}
          options={[
            { value: "never", label: "Never" },
            { value: "1h", label: "1 hour" },
            { value: "1d", label: "1 day" },
            { value: "7d", label: "7 days" },
            { value: "30d", label: "30 days" },
          ]}
          onChange={(v) =>
            updateSettings({
              defaultExpiresIn: v as "never" | "1h" | "1d" | "7d" | "30d",
            })
          }
        />
      </SettingsSection>

      {/* OCR */}
      <SettingsSection title="OCR">
        <ToggleSetting
          label="Enable OCR"
          description="Extract text from screenshots automatically"
          value={settings.ocrEnabled}
          onChange={(v) => updateSettings({ ocrEnabled: v })}
        />
      </SettingsSection>

      {/* Advanced */}
      <SettingsSection title="Advanced">
        <TextSetting
          label="Upload endpoint"
          description="Backend server URL"
          value={settings.uploadEndpoint}
          onChange={(v) => updateSettings({ uploadEndpoint: v })}
        />
      </SettingsSection>
    </div>
  );
}

function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
        {title}
      </h3>
      <div className="space-y-3 bg-gray-900 rounded-lg p-3">{children}</div>
    </div>
  );
}

function ToggleSetting({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <div>
        <div className="text-sm text-gray-200">{label}</div>
        <div className="text-xs text-gray-500">{description}</div>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          value ? "bg-blue-600" : "bg-gray-600"
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
            value ? "translate-x-[18px]" : "translate-x-[3px]"
          }`}
        />
      </button>
    </div>
  );
}

function SelectSetting({
  label,
  description,
  value,
  options,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <div>
        <div className="text-sm text-gray-200">{label}</div>
        <div className="text-xs text-gray-500">{description}</div>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-gray-800 text-gray-200 text-sm rounded px-2 py-1 border border-gray-700 focus:border-blue-500 focus:outline-none"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function TextSetting({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="py-1">
      <div className="text-sm text-gray-200">{label}</div>
      <div className="text-xs text-gray-500 mb-1">{description}</div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-gray-800 text-gray-200 text-sm rounded px-2 py-1.5 border border-gray-700 focus:border-blue-500 focus:outline-none"
      />
    </div>
  );
}
