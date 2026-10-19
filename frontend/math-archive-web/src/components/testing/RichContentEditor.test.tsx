import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { RichContentEditor } from "./RichContentEditor";
import { FormulaEditor } from "./FormulaEditor";
import { testingApi } from "../../api/testingApi";
import type { TestContentBlock } from "../../types/testing";
vi.mock("../../api/testingApi", () => ({
  testingApi: { image: vi.fn(), uploadImage: vi.fn() },
}));
vi.mock("mathlive", () => {
  class Field extends HTMLElement {
    value = "";
    readOnly = false;
    mathVirtualKeyboardPolicy = "auto";
    menuItems = [];
    insert(value: string) {
      this.value += value.replace(/#\d/g, "1");
      this.dispatchEvent(new Event("input"));
    }
  }
  if (!customElements.get("math-field"))
    customElements.define("math-field", Field);
  return { MathfieldElement: Field };
});
beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => "blob:image");
  URL.revokeObjectURL = vi.fn();
  vi.mocked(testingApi.image).mockResolvedValue(new Blob());
  vi.mocked(testingApi.uploadImage).mockResolvedValue({
    id: "11111111-1111-4111-8111-111111111111",
    width: 8,
    height: 6,
  });
});
it("provides visual formula insertion and a live LaTeX mode", async () => {
  function Harness() {
    const [value, setValue] = useState("x");
    return <FormulaEditor label="Формула" value={value} onChange={setValue} />;
  }
  const { container } = render(<Harness />);
  await waitFor(() =>
    expect(container.querySelector("math-field")).toBeInTheDocument(),
  );
  await userEvent.click(screen.getByRole("button", { name: "Дріб" }));
  expect(container.querySelector(".katex")).toBeInTheDocument();
  await userEvent.click(screen.getByLabelText("Режим LaTeX"));
  const input = screen.getByLabelText("Формула");
  await userEvent.clear(input);
  await userEvent.type(input, "x^2");
  expect(container.querySelector(".katex")).toHaveTextContent("x");
});
it("uploads image-only content, permits replacement and removal, and preserves descriptions", async () => {
  function Harness() {
    const [content, setContent] = useState<TestContentBlock[] | null>(null);
    const [text, setText] = useState("");
    return (
      <RichContentEditor
        label="Питання"
        text={text}
        content={content}
        onTextChange={setText}
        onContentChange={setContent}
      />
    );
  }
  render(<Harness />);
  const input = screen.getByLabelText("Питання: завантажити зображення");
  await userEvent.upload(
    input,
    new File(["png"], "diagram.png", { type: "image/png" }),
  );
  expect(
    await screen.findByLabelText("Опис зображення 1 (необов’язково)"),
  ).toBeInTheDocument();
  await userEvent.type(
    screen.getByLabelText("Опис зображення 1 (необов’язково)"),
    "Коло",
  );
  expect(
    await screen.findAllByRole("button", { name: "Збільшити: Коло" }),
  ).toHaveLength(2);
  vi.mocked(testingApi.uploadImage).mockResolvedValueOnce({ id: '22222222-2222-4222-8222-222222222222', width: 8, height: 6 });
  await userEvent.upload(
    screen.getByText('Замінити зображення').querySelector('input')!,
    new File(['new png'], 'replacement.png', { type: 'image/png' }),
  );
  await waitFor(() => expect(testingApi.image).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222', null, expect.any(AbortSignal)));
  expect(screen.getByLabelText('Опис зображення 1 (необов’язково)')).toHaveValue('Коло');
  await userEvent.click(
    screen.getByRole("button", { name: "Питання: видалити блок 1" }),
  );
  expect(screen.getByLabelText("Питання")).toHaveValue("");
  expect(testingApi.uploadImage).toHaveBeenCalledTimes(2);
});
it("does not upload an oversized image", async () => {
  render(
    <RichContentEditor
      label="Питання"
      text=""
      onTextChange={vi.fn()}
      onContentChange={vi.fn()}
    />,
  );
  await userEvent.upload(
    screen.getByLabelText("Питання: завантажити зображення"),
    new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.png", {
      type: "image/png",
    }),
  );
  expect(
    await screen.findByText("Оберіть PNG, JPEG або WebP розміром до 5 МБ."),
  ).toBeInTheDocument();
  expect(testingApi.uploadImage).not.toHaveBeenCalled();
});
