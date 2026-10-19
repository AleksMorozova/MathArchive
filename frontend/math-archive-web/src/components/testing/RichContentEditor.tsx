import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { testingApi } from "../../api/testingApi";
import { getApiErrorMessage } from "../../api/apiErrors";
import type { TestContentBlock } from "../../types/testing";
import { FormulaEditor } from "./FormulaEditor";
import { RichTestContent } from "./RichTestContent";

export function RichContentEditor({
  label,
  text,
  content,
  onTextChange,
  onContentChange,
  disabled = false,
  onBusyChange,
  fieldPath,
}: {
  label: string;
  text: string;
  content?: TestContentBlock[] | null;
  onTextChange: (value: string) => void;
  onContentChange: (value: TestContentBlock[]) => void;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  fieldPath?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const blocks = content ?? [{ kind: "Text" as const, text }];
  function update(index: number, value: TestContentBlock) {
    const next = [...blocks];
    next[index] = value;
    onContentChange(next);
  }
  function add(kind: "Text" | "InlineMath" | "BlockMath") {
    onContentChange([
      ...blocks.filter((b) => b.kind !== "Text" || b.text?.trim()),
      { kind, text: "" },
    ]);
  }
  async function upload(file: File | undefined, replace?: number) {
    if (!file || uploading) return;
    setUploading(true);
    onBusyChange?.(true);
    setError("");
    try {
      if (
        file.size > 5 * 1024 * 1024 ||
        !["image/png", "image/jpeg", "image/webp"].includes(file.type)
      ) {
        setError("Оберіть PNG, JPEG або WebP розміром до 5 МБ.");
        return;
      }
      const image = await testingApi.uploadImage(file);
      const block: TestContentBlock = {
        kind: "Image",
        imageId: image.id,
        alignment: "Center",
        description: replace === undefined ? "" : blocks[replace].description,
      };
      if (replace === undefined)
        onContentChange([
          ...blocks.filter((b) => b.kind !== "Text" || b.text?.trim()),
          block,
        ]);
      else
        update(replace, {
          ...blocks[replace],
          ...block,
          alignment: blocks[replace].alignment ?? "Center",
        });
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setUploading(false);
      onBusyChange?.(false);
    }
  }
  const busy = disabled || uploading;
  return (
    <Stack gap={2} data-editor-field={fieldPath} sx={{ minWidth: 0, width: "100%" }}>
      <Typography variant="subtitle1">{label}</Typography>
      {error && <Alert severity="error">{error}</Alert>}
      <Box
        component="fieldset"
        disabled={busy}
        sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}
      >
        <Stack gap={2}>
          {blocks.map((b, i) => (
            <Card variant="outlined" key={i}>
              <CardContent>
                <Stack gap={1}>
                  {b.kind === "Text" ? (
                    <TextField
                      label={
                        blocks.length === 1
                          ? label
                          : `${label} · текст ${i + 1}`
                      }
                      value={b.text ?? ""}
                      multiline
                      minRows={2}
                      fullWidth
                      inputProps={{ maxLength: 4000 }}
                      helperText="Можна вводити текст із формулами: \(x^2\) у рядку або \[x^2\] окремим блоком."
                      onChange={(e) =>
                        content
                          ? update(i, { ...b, text: e.target.value })
                          : onTextChange(e.target.value)
                      }
                    />
                  ) : b.kind === "Image" ? (
                    <>
                      <RichTestContent text="" content={[b]} />
                      <TextField
                        label={`Опис зображення ${i + 1} (необов’язково)`}
                        value={b.description ?? ""}
                        inputProps={{ maxLength: 500 }}
                        onChange={(e) =>
                          update(i, { ...b, description: e.target.value })
                        }
                      />
                      <TextField
                        label={`Вирівнювання зображення ${i + 1}`}
                        select
                        value={b.alignment ?? "Center"}
                        onChange={(e) =>
                          update(i, {
                            ...b,
                            alignment: e.target
                              .value as TestContentBlock["alignment"],
                          })
                        }
                      >
                        <MenuItem value="Left">Ліворуч</MenuItem>
                        <MenuItem value="Center">По центру</MenuItem>
                        <MenuItem value="Right">Праворуч</MenuItem>
                      </TextField>
                      <Button component="label" disabled={busy}>
                        Замінити зображення
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          hidden
                          disabled={busy}
                          onChange={(e) => {
                            void upload(e.target.files?.[0], i);
                            e.target.value = "";
                          }}
                        />
                      </Button>
                    </>
                  ) : (
                    <FormulaEditor
                      label={`${label} · ${b.kind === "InlineMath" ? "формула в рядку" : "формула окремим блоком"} ${i + 1}`}
                      value={b.text ?? ""}
                      onChange={(value) => update(i, { ...b, text: value })}
                      disabled={busy}
                    />
                  )}
                  <Stack direction="row" flexWrap="wrap" gap={1}>
                    <Button
                      disabled={busy || i === 0}
                      aria-label={`${label}: блок ${i + 1} вище`}
                      onClick={() => {
                        const next = [...blocks];
                        [next[i - 1], next[i]] = [next[i], next[i - 1]];
                        onContentChange(next);
                      }}
                    >
                      Вище
                    </Button>
                    <Button
                      disabled={busy || i === blocks.length - 1}
                      aria-label={`${label}: блок ${i + 1} нижче`}
                      onClick={() => {
                        const next = [...blocks];
                        [next[i], next[i + 1]] = [next[i + 1], next[i]];
                        onContentChange(next);
                      }}
                    >
                      Нижче
                    </Button>
                    <Button
                      color="error"
                      disabled={busy}
                      aria-label={`${label}: видалити блок ${i + 1}`}
                      onClick={() =>
                        onContentChange(
                          blocks.length === 1
                            ? [{ kind: "Text", text: "" }]
                            : blocks.filter((_, n) => n !== i),
                        )
                      }
                    >
                      Видалити блок
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      </Box>
      <Stack direction="row" gap={1} flexWrap="wrap">
        <Button
          disabled={busy || blocks.length >= 40}
          onClick={() => add("Text")}
        >
          Додати текст
        </Button>
        <Button
          disabled={busy || blocks.length >= 40}
          onClick={() => add("InlineMath")}
        >
          Формула в рядку
        </Button>
        <Button
          disabled={busy || blocks.length >= 40}
          onClick={() => add("BlockMath")}
        >
          Формула окремим блоком
        </Button>
        <Button component="label" disabled={busy || blocks.length >= 40}>
          {uploading ? "Завантажуємо…" : "Додати зображення"}
          <input
            aria-label={`${label}: завантажити зображення`}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            disabled={busy || blocks.length >= 40}
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </Button>
      </Stack>
      <Typography variant="caption">Попередній перегляд</Typography>
      <RichTestContent text={text} content={content} />
    </Stack>
  );
}
