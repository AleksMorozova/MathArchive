import {
  Alert,
  Box,
  Button,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import type { MathfieldElement } from "mathlive";
import { AssistantMarkdown } from "../assistant/AssistantMarkdown";

export function FormulaEditor({
  value,
  onChange,
  label,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  disabled?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const field = useRef<MathfieldElement | null>(null);
  const latest = useRef({ value, disabled, label });
  latest.current = { value, disabled, label };
  const change = useRef(onChange);
  change.current = onChange;
  const [latex, setLatex] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (latex) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    void Promise.all([import("mathlive"), import("mathlive/fonts.css")])
      .then(([{ MathfieldElement }]) => {
        if (cancelled || !host.current) return;
        MathfieldElement.fontsDirectory = null;
        MathfieldElement.soundsDirectory = null;
        MathfieldElement.strings = {
          uk: {
            "keyboard.tooltip.symbols": "Символи",
            "keyboard.tooltip.greek": "Грецькі літери",
            "keyboard.tooltip.numeric": "Числа",
            "keyboard.tooltip.alphabetic": "Латинські літери",
            "tooltip.copy to clipboard": "Копіювати",
            "tooltip.cut to clipboard": "Вирізати",
            "tooltip.paste from clipboard": "Вставити",
            "tooltip.redo": "Повторити",
            "tooltip.undo": "Скасувати",
            "tooltip.toggle virtual keyboard": "Математична клавіатура",
            "tooltip.menu": "Меню",
          },
        };
        MathfieldElement.locale = "uk";
        const element = new MathfieldElement();
        element.value = latest.current.value;
        element.readOnly = latest.current.disabled;
        element.mathVirtualKeyboardPolicy = "auto";
        element.menuItems = [];
        element.setAttribute("aria-label", latest.current.label);
        element.style.cssText =
          "width:100%;min-height:56px;border:1px solid #9aabc4;border-radius:8px;padding:8px;font-size:1.2rem;";
        const listener = () => change.current(element.value.slice(0, 1000));
        element.addEventListener("input", listener);
        host.current.replaceChildren(element);
        field.current = element;
        dispose = () => {
          element.removeEventListener("input", listener);
          element.remove();
          field.current = null;
        };
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLatex(true);
        }
      });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [latex]);
  useEffect(() => {
    if (field.current && field.current.value !== value)
      field.current.value = value;
  }, [value]);
  useEffect(() => {
    if (field.current) field.current.readOnly = disabled;
  }, [disabled]);
  const templates = [
    ["Дріб", "\\frac{#0}{#1}"],
    ["Степінь", "#0^{#1}"],
    ["Корінь", "\\sqrt{#0}"],
    ["Логарифм", "\\log_{#0}{#1}"],
    ["Синус", "\\sin(#0)"],
    ["Нерівність", "#0\\leq#1"],
    ["Система", "\\begin{cases}#0\\\\#1\\end{cases}"],
    ["Інтеграл", "\\int_{#0}^{#1}#2\\,dx"],
    ["π", "\\pi"],
    ["α", "\\alpha"],
  ] as const;
  return (
    <Stack gap={1}>
      <Typography variant="subtitle2">{label}</Typography>
      <FormControlLabel
        label="Режим LaTeX"
        control={
          <Switch
            checked={latex}
            disabled={disabled}
            onChange={(_, checked) => setLatex(checked)}
          />
        }
      />
      {error && (
        <Alert severity="info">
          Візуальний редактор недоступний. Введіть формулу у форматі LaTeX.
        </Alert>
      )}
      {latex ? (
        <TextField
          label={label}
          value={value}
          disabled={disabled}
          inputProps={{ maxLength: 1000 }}
          onChange={(e) => onChange(e.target.value)}
          multiline
        />
      ) : (
        <>
          <Box
            ref={host}
            sx={{ minWidth: 0, "& math-field": { maxWidth: "100%" } }}
          />
          <Stack direction="row" gap={0.5} flexWrap="wrap">
            {templates.map(([name, template]) => (
              <Button
                key={name}
                size="small"
                disabled={disabled}
                onClick={() => {
                  field.current?.focus();
                  field.current?.insert(template, {
                    selectionMode: "placeholder",
                  });
                }}
              >
                {name}
              </Button>
            ))}
          </Stack>
        </>
      )}
      <Box
        aria-label="Попередній перегляд формули"
        sx={{ overflowX: "auto", minWidth: 0 }}
      >
        <AssistantMarkdown text={`\\[\n${value}\n\\]`} />
      </Box>
    </Stack>
  );
}
