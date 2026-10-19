import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { RichTestContent, TestImageContext } from "./RichTestContent";
import { testingApi } from "../../api/testingApi";
import type { TestContentBlock } from "../../types/testing";
import {
  AnswerControls,
  AttemptResult,
} from "../../pages/testing/StudentTests";
import type { Attempt } from "../../types/testing";
vi.mock("../../api/testingApi", () => ({ testingApi: { image: vi.fn() } }));
beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => "blob:diagram");
  URL.revokeObjectURL = vi.fn();
  vi.mocked(testingApi.image).mockResolvedValue(
    new Blob(["image"], { type: "image/png" }),
  );
});
it("renders Ukrainian paragraphs and inline/block formulas using the existing safe KaTeX renderer", () => {
  const { container } = render(
    <RichTestContent
      text=""
      content={[
        { kind: "Text", text: "Обчисліть" },
        { kind: "InlineMath", text: "\\frac{1}{2}" },
        { kind: "Text", text: "та поясніть.\n\nДругий абзац." },
        { kind: "BlockMath", text: "\\begin{cases}x+y=2\\\\x-y=0\\end{cases}" },
      ]}
    />,
  );
  expect(screen.getByText(/Обчисліть/)).toBeInTheDocument();
  expect(screen.getByText("Другий абзац.")).toBeInTheDocument();
  expect(container.querySelectorAll(".katex")).toHaveLength(2);
  expect(container.querySelectorAll(".katex-display")).toHaveLength(1);
  expect(container.querySelector(".katex-error")).toBeNull();
});
it("does not execute raw HTML, remote image markup, or untrusted LaTeX links", () => {
  const { container } = render(
    <RichTestContent
      text={
        "<script>alert(1)</script>\n\n![remote](https://tracker.test/a.png)\n\n\\(\\href{javascript:alert(1)}{click}\\)"
      }
    />,
  );
  expect(
    container.querySelector('script,img,[onerror],a[href^="javascript:"]'),
  ).toBeNull();
});
it("loads images with the attempt capability, enlarges by keyboard, and revokes the object URL", async () => {
  const c = { id: "attempt", token: "secret" };
  const block: TestContentBlock = {
    kind: "Image",
    imageId: "image",
    alignment: "Right",
    description: "Трикутник ABC",
  };
  const { unmount } = render(
    <TestImageContext.Provider value={c}>
      <RichTestContent text="" content={[block]} />
    </TestImageContext.Provider>,
  );
  const image = await screen.findByRole("button", {
    name: "Збільшити: Трикутник ABC",
  });
  expect(testingApi.image).toHaveBeenCalledWith(
    "image",
    c,
    expect.any(AbortSignal),
  );
  expect(image).toHaveStyle({ maxWidth: "100%", height: "auto" });
  image.focus();
  await userEvent.keyboard("{Enter}");
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Закрити" }));
  unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:diagram");
});
it("renders image/formula answer options without disclosing an answer key or changing selection when enlarging", async () => {
  const q = {
    id: "q",
    text: "Оберіть графік",
    type: "SingleChoice" as const,
    points: 1,
    options: [
      {
        id: "o",
        text: "Графік",
        content: [
          { kind: "Image" as const, imageId: "graph" },
          { kind: "InlineMath" as const, text: "y=x^2" },
        ],
      },
    ],
  };
  const change = vi.fn();
  const { container } = render(
    <AnswerControls
      question={q}
      answer={{ questionId: "q", optionIds: [], text: null }}
      disabled={false}
      onChange={change}
    />,
  );
  expect(container.querySelector(".katex")).toBeInTheDocument();
  await userEvent.click(
    await screen.findByRole("button", { name: /Збільшити:/ }),
  );
  expect(change).not.toHaveBeenCalled();
  expect(screen.queryByText("Правильна відповідь:")).toBeNull();
});
it("uses snapshot image content for both selected and correct options in administrator history", async () => {
  const content: TestContentBlock[] = [
    { kind: "Image", imageId: "historical", description: "Початковий графік" },
  ];
  const a: Attempt = {
    id: "attempt",
    title: "Тест",
    status: "Completed",
    startedAt: "",
    completedAt: "",
    deadline: null,
    answerVisibility: "AfterCompletion",
    questions: [
      {
        id: "q",
        text: "Функція",
        content: [{ kind: "BlockMath", text: "x^2" }],
        type: "SingleChoice",
        points: 1,
        options: [{ id: "o", text: "Графік", content }],
      },
    ],
    answers: [{ questionId: "q", optionIds: ["o"], text: null }],
    earnedPoints: 1,
    maximumPoints: 1,
    percentage: 100,
    passed: true,
    correctCount: 1,
    review: [
      {
        questionId: "q",
        isCorrect: true,
        earnedPoints: 1,
        correctOptionIds: ["o"],
        acceptedAnswers: [],
        explanation: null,
      },
    ],
  };
  render(<AttemptResult attempt={a} />);
  await waitFor(() =>
    expect(
      screen.getAllByRole("button", { name: "Збільшити: Початковий графік" }),
    ).toHaveLength(2),
  );
  expect(testingApi.image).toHaveBeenCalledWith(
    "historical",
    null,
    expect.any(AbortSignal),
  );
});
