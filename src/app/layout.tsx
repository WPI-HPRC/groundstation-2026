import "./globals.css";
import { VisualEditsMessenger } from "orchids-visual-edits";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="antialiased">
      {children}
      <VisualEditsMessenger />
    </div>
  );
}
