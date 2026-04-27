import { useEffect } from "react";

const SCRIPT_ID = "elevenlabs-convai-embed";
const SCRIPT_SRC = "https://unpkg.com/@elevenlabs/convai-widget-embed";
const AGENT_ID = "agent_5901ke9dw1ggfxhb7kg0kcvdgkvd";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "elevenlabs-convai": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & { "agent-id": string },
        HTMLElement
      >;
    }
  }
}

export function ChamonVoiceWidget() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById(SCRIPT_ID)) return;
    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.src = SCRIPT_SRC;
    s.async = true;
    s.type = "text/javascript";
    document.head.appendChild(s);
  }, []);

  return <elevenlabs-convai agent-id={AGENT_ID}></elevenlabs-convai>;
}
