import { useI18n } from "@/lib/i18n";

export function LangToggle() {
  const { lang, setLang } = useI18n();
  return (
    <div className="inline-flex items-center rounded-md border border-border bg-card p-0.5 font-mono text-[11px]">
      {(["es", "en"] as const).map(l => (
        <button key={l}
          onClick={() => setLang(l)}
          className={`px-2.5 py-1 rounded uppercase tracking-wider transition-colors ${
            lang === l ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >{l}</button>
      ))}
    </div>
  );
}
