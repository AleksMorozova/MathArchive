import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from "@mui/material";
import { createContext, useContext, useEffect, useState } from "react";
import type { Credentials, TestContentBlock } from "../../types/testing";
import { testingApi } from "../../api/testingApi";
import { AssistantMarkdown } from "../assistant/AssistantMarkdown";

// Authoring/history defaults to the admin endpoint. A student session supplies its capability.
export const TestImageContext = createContext<Credentials | null>(null);
export function TestImageView({ block }: { block: TestContentBlock }) {
  const credentials = useContext(TestImageContext);
  const [url, setUrl] = useState("");
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = "";
    setUrl("");
    setError(false);
    void testingApi
      .image(block.imageId!, credentials, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [block.imageId, credentials?.id, credentials?.token, retry]);
  const description = block.description || "Ілюстрація до питання";
  const align = { Left: "left", Center: "center", Right: "right" } as const;
  return (
    <Box
      sx={{
        textAlign: align[block.alignment ?? "Center"],
        my: 1,
        width: "100%",
        minWidth: 0,
      }}
    >
      {error ? (
        <Alert
          severity="warning"
          action={
            <Button onClick={() => setRetry((n) => n + 1)}>Повторити</Button>
          }
        >
          Не вдалося завантажити зображення.
        </Alert>
      ) : !url ? (
        <CircularProgress size={24} aria-label="Завантажуємо зображення" />
      ) : (
        <>
          <Box
            component="img"
            src={url}
            alt={description}
            tabIndex={0}
            role="button"
            aria-label={`Збільшити: ${description}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                setOpen(true);
              }
            }}
            sx={{
              maxWidth: "100%",
              height: "auto",
              maxHeight: 480,
              objectFit: "contain",
              cursor: "zoom-in",
              borderRadius: 1,
              verticalAlign: "middle",
            }}
          />
          {block.description && (
            <Typography variant="caption" display="block">
              {block.description}
            </Typography>
          )}
          <Dialog
            open={open}
            onClose={() => setOpen(false)}
            maxWidth="xl"
            fullWidth
            onClick={(e) => e.stopPropagation()}
          >
            <DialogTitle>{description}</DialogTitle>
            <DialogContent>
              <Box
                component="img"
                src={url}
                alt={description}
                sx={{
                  display: "block",
                  width: "100%",
                  height: "auto",
                  objectFit: "contain",
                }}
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setOpen(false)}>Закрити</Button>
            </DialogActions>
          </Dialog>
        </>
      )}
    </Box>
  );
}
export function RichTestContent({
  text,
  content,
}: {
  text: string;
  content?: TestContentBlock[] | null;
}) {
  if (!content?.length)
    return (
      <Box sx={{ minWidth: 0, maxWidth: "100%", overflowX: "auto" }}>
        <AssistantMarkdown text={text} />
      </Box>
    );
  const parts: { text?: string; image?: TestContentBlock }[] = [];
  let source = "";
  let previousText = false;
  for (const block of content) {
    if (block.kind === "Image") {
      if (source) parts.push({ text: source });
      source = "";
      parts.push({ image: block });
      previousText = false;
    } else {
      const value =
        block.kind === "InlineMath"
          ? `\\(${block.text}\\)`
          : block.kind === "BlockMath"
            ? `\n\n\\[\n${block.text}\n\\]\n\n`
            : (block.text ?? "");
      source += (previousText && block.kind === "Text" ? "\n\n" : " ") + value;
      previousText = block.kind === "Text";
    }
  }
  if (source) parts.push({ text: source });
  return (
    <Box
      sx={{
        width: "100%",
        minWidth: 0,
        overflowX: "auto",
        overflowWrap: "anywhere",
        "& .katex-display": { overflowX: "auto", maxWidth: "100%" },
      }}
    >
      {parts.map((part, i) =>
        part.image ? (
          <TestImageView
            key={`${i}:${part.image.imageId}`}
            block={part.image}
          />
        ) : (
          <AssistantMarkdown key={i} text={part.text!} />
        ),
      )}
    </Box>
  );
}
export function contentSummary(blocks: TestContentBlock[], max = 4000) {
  return blocks
    .map((b) =>
      b.kind === "Image" ? b.description || "Зображення" : b.text || "",
    )
    .join(" ")
    .slice(0, max);
}
