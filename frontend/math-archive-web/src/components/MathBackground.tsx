import { Box } from '@mui/material';

type MathBackgroundVariant = 'default' | 'about';

type MathBackgroundProps = {
  variant?: MathBackgroundVariant;
};

export function MathBackground({ variant = 'default' }: MathBackgroundProps) {
  return (
    <Box className={`public-math-background math-background-${variant}`} aria-hidden="true">
      <svg className="math-sketch math-sketch-graph" viewBox="0 0 260 180" focusable="false">
        <path d="M24 146H238" />
        <path d="M48 162V24" />
        <path d="M48 146c36-92 72-92 108 0 20 48 42 31 62-50" />
        <path d="M224 146l-10-7m10 7-10 7M48 26l-7 10m7-10 7 10" />
        <text x="112" y="35">y = ax² + bx + c</text>
        <text x="178" y="132">x</text>
        <text x="58" y="42">y</text>
      </svg>

      <svg className="math-sketch math-sketch-linear" viewBox="0 0 240 160" focusable="false">
        <path d="M26 126H218" />
        <path d="M58 140V22" />
        <path d="M42 118L204 38" />
        <path d="M218 126l-9-6m9 6-9 6M58 22l-6 9m6-9 6 9" />
        <text x="126" y="52">y = kx + b</text>
      </svg>

      <svg className="math-sketch math-sketch-sine" viewBox="0 0 290 150" focusable="false">
        <path d="M18 76H270" />
        <path d="M38 126V24" />
        <path d="M38 76c28-62 56-62 84 0s56 62 84 0 42-46 64-20" />
        <text x="142" y="32">sin²α + cos²α = 1</text>
      </svg>

      <svg className="math-sketch math-sketch-triangle" viewBox="0 0 230 190" focusable="false">
        <path d="M36 150L104 38l88 112Z" />
        <path d="M104 38v112" strokeDasharray="6 8" />
        <path d="M36 150h156" />
        <text x="62" y="102">a</text>
        <text x="142" y="102">b</text>
        <text x="96" y="169">c</text>
        <text x="42" y="30">a² + b² = c²</text>
      </svg>

      <svg className="math-sketch math-sketch-circle" viewBox="0 0 220 180" focusable="false">
        <circle cx="90" cy="88" r="54" />
        <path d="M90 88h54" />
        <path d="M36 88h108" strokeDasharray="5 7" />
        <path d="M90 34v108" strokeDasharray="5 7" />
        <text x="113" y="79">r</text>
        <text x="18" y="164">S = πr²</text>
        <text x="120" y="33">L = 2πr</text>
      </svg>

      <svg className="math-sketch math-sketch-solids" viewBox="0 0 260 200" focusable="false">
        <path d="M38 78h76v68H38Z" />
        <path d="M66 48h76v68H66Z" />
        <path d="M38 78l28-30M114 78l28-30M114 146l28-30" />
        <path d="M176 54c0 12 34 12 34 0s-34-12-34 0Zm0 0v82c0 12 34 12 34 0V54" />
        <text x="30" y="28">V = abc</text>
        <text x="154" y="176">V = πr²h</text>
      </svg>

      <svg className="math-sketch math-sketch-sphere" viewBox="0 0 220 170" focusable="false">
        <circle cx="88" cy="84" r="48" />
        <ellipse cx="88" cy="84" rx="48" ry="13" />
        <path d="M88 36c18 18 18 78 0 96M88 36c-18 18-18 78 0 96" />
        <text x="34" y="156">V = 4/3 πr³</text>
      </svg>

      <svg className="math-sketch math-sketch-tools" viewBox="0 0 260 190" focusable="false">
        <path d="M42 150h164" />
        <path d="M58 150v-10m24 10v-15m24 15v-10m24 10v-15m24 15v-10m24 10v-15" />
        <path d="M56 132A74 74 0 0 1 204 132" />
        <path d="M130 132L86 76M130 132l58-42" />
        <path d="M84 76a16 16 0 0 1 12-10" />
        <text x="106" y="63">α</text>
        <text x="48" y="34">∠ABC = 60°</text>
      </svg>

      <svg className="math-sketch math-sketch-algebra" viewBox="0 0 330 220" focusable="false">
        <text x="18" y="42">x = (-b ± √(b² - 4ac)) / 2a</text>
        <text x="48" y="92">(a + b)² = a² + 2ab + b²</text>
        <text x="76" y="144">√(x² + y²)</text>
        <path d="M40 176h78" />
        <text x="48" y="170">3x + 5</text>
        <text x="60" y="202">2y - 1</text>
        <text x="178" y="184">∫ f(x) dx</text>
      </svg>
    </Box>
  );
}
