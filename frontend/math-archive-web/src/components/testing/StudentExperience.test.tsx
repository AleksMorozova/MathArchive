import { testingApi } from "../../api/testingApi";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { StudentAnswerCards, StudentCompletion, StudentProgress } from "./StudentExperience";
import type { Answer, Attempt } from "../../types/testing";

const question: Attempt["questions"][number] = { id: "q", text: "2 + 2?", type: "MultipleChoice", points: 1, options: [{ id: "a", text: "4" }, { id: "b", text: "5" }] };
function fixture(overrides: Partial<Attempt> = {}): Attempt {
  return { id: "attempt", title: "Алгебра", status: "Completed", startedAt: "", completedAt: "", deadline: null, answerVisibility: "Never", questions: [question], answers: [], earnedPoints: null, maximumPoints: null, percentage: null, passed: null, correctCount: null, review: [], ...overrides };
}
describe("student experience", () => {
  it("supports keyboard multiple selection and independent deselection", async () => {
    function Cards() {
      const [answer, setAnswer] = useState<Answer>({ questionId: "q", optionIds: [], text: null });
      return <StudentAnswerCards question={question} answer={answer} disabled={false} onChange={setAnswer} />;
    }
    render(<Cards />);
    const user = userEvent.setup();
    await user.tab(); await user.keyboard(" ");
    expect(screen.getByRole("checkbox", { name: "4" })).toBeChecked();
    await user.tab(); await user.keyboard(" ");
    expect(screen.getByRole("checkbox", { name: "5" })).toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: "4" }));
    expect(screen.getByRole("checkbox", { name: "4" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "5" })).toBeChecked();
    expect(screen.getAllByText("Обрано")).toHaveLength(1);
  });
  it("keeps locked student cards immutable", async () => {
    const change = vi.fn();
    render(<StudentAnswerCards question={question} answer={{ questionId: "q", optionIds: ["a"], text: null }} disabled onChange={change} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "5" }));
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: "4" })).toBeChecked();
  });
  it("reports answered progress rather than treating the current question as completed", () => {
    render(<StudentProgress attempt={fixture()} index={0} answers={{}} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });
  it("uses draft answers in completion progress", () => {
    render(<StudentProgress attempt={fixture()} index={0} answers={{ q: { questionId: "q", optionIds: ["a"], text: null } }} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });
  it("hides score, correctness and review when no result information is returned", () => {
    render(<MemoryRouter>
      <StudentCompletion attempt={fixture()} />
    </MemoryRouter>);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText("Правильна відповідь:")).not.toBeInTheDocument();
    expect(screen.queryByText(/Розбір відповідей/)).not.toBeInTheDocument();
    expect(screen.getByText(/Результати доступні вчителю/)).toBeInTheDocument();
  });
  it("renders permitted scores and opt-in review independently", async () => {
    render(<MemoryRouter>
      <StudentCompletion attempt={fixture({ earnedPoints: 1, maximumPoints: 1, percentage: 100, correctCount: 1, passed: true, review: [{ questionId: "q", isCorrect: true, earnedPoints: 1, correctOptionIds: ["a"], acceptedAnswers: [], explanation: "Пояснення" }] })} />
    </MemoryRouter>);
    expect(screen.getByRole("progressbar", { name: "Результат тесту" })).toBeInTheDocument();
    expect(screen.getByText("Тест складено")).toBeInTheDocument();
    expect(screen.getByText("Пояснення")).not.toBeVisible();
    await userEvent.click(screen.getByText("Розбір відповідей"));
    expect(screen.getByText("Пояснення")).toBeVisible();
  });
});
it("enlarges an answer diagram without selecting the card", async () => {
  URL.createObjectURL = vi.fn(() => "blob:student-diagram");
  URL.revokeObjectURL = vi.fn();
  const image = vi.spyOn(testingApi, "image").mockResolvedValue(new Blob(["diagram"], { type: "image/png" }));
  const change = vi.fn();
  const { unmount } = render(<StudentAnswerCards question={{ ...question, options: [{ id: "graph", text: "Графік", content: [{ kind: "Image", imageId: "graph", description: "Парабола" }] }] }} answer={{ questionId: "q", optionIds: [], text: null }} disabled={false} onChange={change} />);
  await userEvent.click(await screen.findByRole("button", { name: "Збільшити: Парабола" }));
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
  expect(change).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Закрити" }));
  expect(change).not.toHaveBeenCalled();
  unmount(); image.mockRestore();
});

it.each([[100, "perfect"], [85, "high"], [65, "good"], [45, "developing"], [15, "practice"]] as const)("uses the permitted %s score accent and stable message", (percentage, band) => {
  const data = fixture({ percentage, earnedPoints: percentage, maximumPoints: 100 });
  const view = render(<MemoryRouter><StudentCompletion attempt={data} /></MemoryRouter>);
  const heading = screen.getByRole("heading", { level: 1 }).textContent;
  expect(view.container.querySelector('.student-result--' + band)).toBeInTheDocument();
  view.rerender(<MemoryRouter><StudentCompletion attempt={{ ...data }} /></MemoryRouter>); expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(heading!);
});
it("keeps hidden results neutral even if other score-related fields are accidentally present", () => {
  const data = fixture({ percentage: 100, passed: false, correctCount: 1, review: [{ questionId: "q", isCorrect: true, earnedPoints: 1, correctOptionIds: ["a"], acceptedAnswers: [], explanation: "Hidden explanation" }] });
  const view = render(<MemoryRouter><StudentCompletion attempt={data} /></MemoryRouter>);
  expect(screen.getByRole("heading", { name: "Тест завершено!" })).toBeInTheDocument(); expect(view.container.querySelector('.student-result--neutral')).toBeInTheDocument();
  expect(view.container.querySelector('.student-result-celebrate')).toBeNull(); expect(view.container.querySelector('.is-practice')).toBeNull(); expect(screen.queryByRole("progressbar")).not.toBeInTheDocument(); expect(screen.queryByText(/Тест не складено/)).not.toBeInTheDocument(); expect(screen.queryByText(/Розбір відповідей/)).not.toBeInTheDocument();
});
it("preserves threshold status and only offers a retake when supplied by the existing flow", async () => {
  const repeat = vi.fn(); const view = render(<MemoryRouter><StudentCompletion attempt={fixture({ earnedPoints: 85, maximumPoints: 100, percentage: 85, passed: false })} onRepeat={repeat} /></MemoryRouter>);
  expect(screen.getByText("Тест не складено — ще трохи практики")).toBeInTheDocument(); expect(view.container.querySelector('.student-result-celebrate')).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Нова спроба" })); expect(repeat).toHaveBeenCalledOnce();
  view.rerender(<MemoryRouter><StudentCompletion attempt={fixture()} /></MemoryRouter>); expect(screen.queryByRole("button", { name: "Нова спроба" })).not.toBeInTheDocument();
});
