export interface TestContentBlock {
  kind: "Text" | "InlineMath" | "BlockMath" | "Image";
  text?: string | null;
  imageId?: string | null;
  alignment?: "Left" | "Center" | "Right";
  description?: string | null;
}
export type TestStatus = "Draft" | "Published" | "Archived";
export type QuestionType = "SingleChoice" | "MultipleChoice" | "Text";
export type Visibility = "Immediate" | "AfterCompletion" | "Never";
export interface TestOption {
  content?: TestContentBlock[] | null;
  id: string;
  text: string;
  isCorrect: boolean;
}
export interface TestQuestion {
  content?: TestContentBlock[] | null;
  id: string;
  text: string;
  type: QuestionType;
  points: number;
  explanation: string | null;
  options: TestOption[];
  acceptedAnswers: string[];
}
export interface TestSettings {
  answerVisibility: Visibility;
  showScore: boolean;
  trackAnswerChanges?: boolean;
  allowRepeats: boolean;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  timeLimitMinutes: number | null;
  passingPercentage: number | null;
  availableFrom: string | null;
  availableTo: string | null;
}
export interface TestDefinition {
  title: string;
  description: string | null;
  grade: number;
  documentId: string | null;
  settings: TestSettings;
  questions: TestQuestion[];
}
export interface TestSummary {
  id: string;
  title: string;
  description: string | null;
  grade: number;
  status: TestStatus;
  questionCount: number;
  timeLimitMinutes: number | null;
  completedAttempts: number;
  createdAt: string;
  updatedAt: string;
}
export type PublicTestSummary = Pick<
  TestSummary,
  | "id"
  | "title"
  | "description"
  | "grade"
  | "questionCount"
  | "timeLimitMinutes"
>;
export interface AdminTest {
  id: string;
  status: TestStatus;
  definition: TestDefinition;
}
export interface TestInfo {
  id: string;
  title: string;
  description: string | null;
  grade: number;
  documentId: string | null;
  questionCount: number;
  timeLimitMinutes: number | null;
  availableFrom: string | null;
  availableTo: string | null;
  allowRepeats: boolean;
}
export interface Answer {
  questionId: string;
  optionIds: string[];
  text: string | null;
  locked?: boolean;
  revision?: number;
  operationId?: string;
}
export interface Review {
  questionId: string;
  isCorrect: boolean;
  earnedPoints: number;
  correctOptionIds: string[];
  acceptedAnswers: string[];
  explanation: string | null;
}
export interface AnswerInteraction { sequence: number; questionId: string; eventType: string; serverTimestamp: string; selected: string[]; deselected: string[]; revision: number; textLength: number | null; afterRevisit?: boolean }
export interface Attempt {
  serverTime?: string;
  currentQuestionId?: string | null;
  progressRevision?: number;
  trackAnswerChanges?: boolean;
  id: string;
  title: string;
  status: "InProgress" | "Completed" | "Expired";
  startedAt: string;
  completedAt: string | null;
  deadline: string | null;
  answerVisibility: Visibility;
  questions: (Omit<
    TestQuestion,
    "acceptedAnswers" | "explanation" | "options"
  > & { options: Omit<TestOption, "isCorrect">[] })[];
  answers: Answer[];
  earnedPoints: number | null;
  maximumPoints: number | null;
  percentage: number | null;
  passed: boolean | null;
  correctCount: number | null;
  review: Review[];
}
export interface Credentials {
  id: string;
  token: string;
}
export interface AttemptRow {
  studentId: string | null;
  attemptNumber: number;
  id: string;
  testId: string;
  testTitle: string;
  firstName: string;
  lastName: string;
  grade: number;
  status: Attempt["status"];
  startedAt: string;
  completedAt: string | null;
  earnedPoints: number;
  maximumPoints: number;
  percentage: number;
  passed: boolean | null;
  durationSeconds: number;
}
export interface Overview {
  publishedTests: number;
  completedAttempts: number;
  browserParticipants: number;
  averagePoints: number;
  averagePercentage: number;
  passed: number;
  failed: number;
}
export interface QuestionStats {
  content?: TestContentBlock[] | null;
  questionId: string;
  text: string;
  submitted: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  correctPercentage: number;
  distribution: {
    answer: string;
    count: number;
    optionId?: string | null;
    content?: TestContentBlock[] | null;
  }[];
  wrongAnswers: {
    answer: string;
    count: number;
    optionId?: string | null;
    content?: TestContentBlock[] | null;
  }[];
}

