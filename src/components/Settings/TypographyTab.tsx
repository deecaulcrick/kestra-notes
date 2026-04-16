import { useThemeStore } from "../../store/themeStore";
import "./TypographyTab.css";

// const TEXT_FONTS = ["Lora", "Georgia", "Palatino", "Merriweather", "Inter", "System"];
// const HEADING_FONTS = ["Fraunces", "Playfair Display", "Libre Baskerville", "Lora", "Inter"];
// const CODE_FONTS = ["JetBrains Mono", "Fira Code", "Source Code Pro", "Menlo", "Monaco"];

export function TypographyTab() {
  const { typography, setTypography, resetTypography } = useThemeStore();

  function slider(
    label: string,
    key: keyof typeof typography,
    min: number,
    max: number,
    step: number,
    unit: string
  ) {
    const value = typography[key] as number;
    return (
      <div className="typo-row" key={key}>
        <div className="typo-row-top">
          <span className="typo-label">{label}</span>
          <span className="typo-value">{value}{unit}</span>
        </div>
        <input
          type="range"
          className="typo-slider"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => setTypography({ [key]: parseFloat(e.target.value) } as Partial<typeof typography>)}
        />
      </div>
    );
  }

  // function fontPicker(
  //   label: string,
  //   key: "textFont" | "headingsFont" | "codeFont",
  //   options: string[]
  // ) {
  //   return (
  //     <div className="typo-row" key={key}>
  //       <span className="typo-label">{label}</span>
  //       <div className="font-options">
  //         {options.map((f) => (
  //           <button
  //             key={f}
  //             className={`font-option${typography[key] === f ? " active" : ""}`}
  //             style={{ fontFamily: f }}
  //             onClick={() => setTypography({ [key]: f } as Partial<typeof typography>)}
  //           >
  //             Aa {f}
  //           </button>
  //         ))}
  //       </div>
  //     </div>
  //   );
  // }

  return (
    <div className="typo-tab">
      <h2 className="settings-section-title">Typography</h2>

      {/* {fontPicker("Text Font", "textFont", TEXT_FONTS)}
      {fontPicker("Headings Font", "headingsFont", HEADING_FONTS)}
      {fontPicker("Code Font", "codeFont", CODE_FONTS)}

      <div className="typo-divider" /> */}

      {slider("Font Size", "fontSize", 12, 24, 1, "px")}
      {slider("Line Height", "lineHeight", 1.2, 2.0, 0.05, "")}
      {slider("Line Width", "lineWidth", 36, 80, 2, "em")}
      {slider("Paragraph Spacing", "paragraphSpacing", 0, 2, 0.1, "em")}
      {slider("Paragraph Indent", "paragraphIndent", 0, 3, 0.1, "em")}

      <button className="typo-reset" onClick={resetTypography}>
        Restore Editor Defaults
      </button>
    </div>
  );
}
