import { VisualEditsMessenger } from "orchids-visual-edits";
import Page from "./app/page";

export default function App() {
  return (
    <div className="antialiased">
      <Page />
      <VisualEditsMessenger />
    </div>
  );
}

