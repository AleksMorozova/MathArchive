import { resultPresentation } from "./resultMessages";
import { StudentAccountControl } from "./StudentAccountControl";
import { Box, Button, CircularProgress, InputAdornment, Stack, TextField, Typography } from '@mui/material';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import TaskAltRounded from '@mui/icons-material/TaskAltRounded';
import LightbulbOutlined from '@mui/icons-material/LightbulbOutlined';
import FunctionsRounded from '@mui/icons-material/FunctionsRounded';
import SchoolOutlined from '@mui/icons-material/SchoolOutlined';
import ScheduleRounded from '@mui/icons-material/ScheduleRounded';
import QuizOutlined from '@mui/icons-material/QuizOutlined';
import ShieldOutlined from '@mui/icons-material/ShieldOutlined';
import { useEffect, useId, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { MathBackground } from '../MathBackground';
import { trackSiteVisit } from '../../api/analyticsApi';
import { RichTestContent } from './RichTestContent';
import type { Answer, Attempt, Review, TestInfo } from '../../types/testing';
import './studentExperience.css';

export function StudentTestLayout({ children }: { children: ReactNode }) {
  useEffect(() => { trackSiteVisit(); }, []);
  return <Box className="student-test-shell">
    <MathBackground />
    <header className="student-test-header">
      <div className="student-test-header-inner">
        <Link to="/tests" className="student-brand" aria-label="МТВ · MathArchive — каталог тестів">
          <span className="student-brand-mark">МТВ</span>
          <span className="student-brand-name">MathArchive<small>Простір математичних відкриттів</small>
          </span>
        </Link>
        <div className="student-header-controls"><StudentAccountControl /><Button component={Link} to="/tests" className="student-header-link" startIcon={<ArrowBackRounded />}>Усі тести</Button></div>
      </div>
    </header>
    <main className="student-test-main">{children}</main>
    <footer className="student-test-footer">МТВ · Математика стає зрозумілішою</footer>
  </Box>;
}
export function StudentWelcomeIntro({ info }: { info: TestInfo }) {
  return <section className="student-welcome-intro">
    <span className="student-eyebrow">ТВІЙ ПРОСТІР ДЛЯ ЗНАНЬ</span>
    <Typography component="h1" className="student-welcome-title">{info.title}</Typography>
    <p className="student-welcome-description">{info.description || 'Зосередься на головному. Крок за кроком перевір свої знання та знайди нові можливості для зростання.'}</p>
    <div className="student-test-facts">
      <div>
        <SchoolOutlined />
        <strong>{info.grade} клас</strong>
        <span>Математика</span>
      </div>
      <div>
        <QuizOutlined />
        <strong>{info.questionCount}</strong>
        <span>Питань у тесті</span>
      </div>
      <div>
        <ScheduleRounded />
        <strong>{info.timeLimitMinutes ? `${info.timeLimitMinutes} хв` : 'Без ліміту'}</strong>
        <span>{info.timeLimitMinutes ? 'Ліміт часу' : 'У своєму темпі'}</span>
      </div>
    </div>
    <div className="student-welcome-note">
      <ShieldOutlined />
      <p>
        <strong>Спокійно. Уважно. Впевнено.</strong>
        <span>Відповіді зберігаються автоматично. Якщо випадково оновиш сторінку, продовжуй у цій самій вкладці.</span>
      </p>
    </div>
  </section>;
}
export function StudentAnswerCards({ question, answer, disabled, onChange }: {
  question: Attempt['questions'][number]; answer: Answer; disabled: boolean; onChange: (a: Answer) => void;
}) {
  const groupId = useId();
  if (question.type === 'Text') return <div className="student-text-answer">
    <TextField
      label="Ваша відповідь" value={answer.text ?? ''} disabled={disabled} inputProps={{ maxLength: 1000 }}
      slotProps={{
        input: {
          startAdornment: <InputAdornment position="start">
            <FunctionsRounded />
          </InputAdornment>
        }
      }}
      onChange={e => onChange({ ...answer, text: e.target.value })} fullWidth helperText="Введи число, вираз або коротку відповідь." />
  </div>;
  const multiple = question.type === 'MultipleChoice';
  const imageOptions = question.options.some(o => o.content?.some(b => b.kind === 'Image'));
  return <div role={multiple ? 'group' : 'radiogroup'} aria-label="Варіанти відповідей" className={`student-answer-grid${imageOptions ? ' student-answer-grid--images' : ''}`}>
    {question.options.map((option, index) => {
      const selected = answer.optionIds.includes(option.id); const id = `${groupId}-${index}`;
      return <label htmlFor={id} className={`student-answer-card${selected ? ' is-selected' : ''}${disabled ? ' is-locked' : ''}`} key={option.id}>
        <input className="student-answer-input" id={id} name={groupId} type={multiple ? 'checkbox' : 'radio'} checked={selected} disabled={disabled} aria-label={option.text || `Варіант ${index + 1}`} aria-describedby={`${id}-content`} onChange={() => onChange({ ...answer, optionIds: multiple ? selected ? answer.optionIds.filter(v => v !== option.id) : [...answer.optionIds, option.id] : [option.id] })} />
        <span className="student-answer-letter" aria-hidden="true">{String.fromCharCode(65 + index)}</span>
        <div className="student-answer-content" id={`${id}-content`}>
          <RichTestContent text={option.text} content={option.content} />
        </div>
        <span className="student-answer-check" aria-hidden="true">{selected ? <CheckRounded /> : multiple ? <span className="student-empty-checkbox" /> : <span className="student-empty-radio" />}</span>
        {selected && <span className="student-answer-selected-label" aria-hidden="true">Обрано</span>}
      </label>;
    })}
  </div>;
}
export function StudentProgress({ attempt, index, answers }: { attempt: Attempt; index: number; answers: Record<string, Answer> }) {
  const filled = (id: string) => { const a = answers[id] ?? attempt.answers.find(a => a.questionId === id); return !!a && (!!a.text?.trim() || a.optionIds.length > 0); };
  const answered = attempt.questions.filter(q => filled(q.id)).length;
  const percentage = Math.round(100 * answered / Math.max(1, attempt.questions.length));
  return <section className="student-progress-section" aria-label="Перебіг тестування">
    <div className="student-progress-caption">
      <p>Питання <strong>{index + 1}</strong> <span>з {attempt.questions.length}</span>
      </p>
      <span>{answered} із {attempt.questions.length} відповідей <b>{percentage}%</b>
      </span>
    </div>
    <div className="student-progress-segments" role="progressbar" aria-label="Прогрес тесту" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage} aria-valuetext={`Заповнено ${answered} із ${attempt.questions.length} відповідей`}>
      {attempt.questions.map((q, n) => <span key={q.id} className={`${filled(q.id) ? 'is-filled ' : ''}${index === n ? 'is-current' : ''}`} aria-hidden="true" />)}
    </div>
  </section>;
}
export function StudentFeedback({ question, review }: { question: Attempt['questions'][number]; review: Review }) {
  return <section className={`student-feedback ${review.isCorrect ? 'is-correct' : 'is-explained'}`} role="status">
    <div className="student-feedback-heading">{review.isCorrect ? <TaskAltRounded /> : <LightbulbOutlined />}<strong>{review.isCorrect ? 'Так, усе правильно!' : 'Розгляньмо відповідь разом'}</strong>
    </div>
    <div className="student-feedback-body">
      <p className="student-small-label">Правильна відповідь:</p>{question.type === 'Text' ? <p>{review.acceptedAnswers.join('; ')}</p> : question.options.filter(o => review.correctOptionIds.includes(o.id)).map(o => <RichTestContent key={o.id} text={o.text} content={o.content} />)}
      {review.explanation && <div className="student-explanation">
        <span className="student-small-label">Чому саме так</span>
        <RichTestContent text={review.explanation} />
      </div>}
    </div>
  </section>;
}
export function StudentCompletion({ attempt, onRepeat }: { attempt: Attempt; onRepeat?: () => void }) {
  const score = attempt.status !== 'InProgress' && attempt.earnedPoints !== null && attempt.maximumPoints !== null && Number.isFinite(attempt.earnedPoints) && Number.isFinite(attempt.maximumPoints);
  const presentation = resultPresentation(attempt.id, score ? attempt.percentage : null);
  const celebrate = (presentation.band === 'perfect' || presentation.band === 'high') && attempt.passed !== false;
  return <div className={`student-completion student-enter student-result--${presentation.band}${celebrate ? " student-result-celebrate" : ""}`}>
    <section className="student-completion-card">
      <span className="student-completion-icon" aria-hidden="true">
        {score ? <TaskAltRounded /> : <ShieldOutlined />}
      </span>
      <div className="student-result-decoration" aria-hidden="true"><span>∑</span><span>π</span><span>√</span><span>∞</span></div>
      {celebrate && <div className="student-result-sparks" aria-hidden="true"><i /><i /><i /><i /></div>}
      <span className="student-eyebrow">МТВ · ПІДСУМКИ ТЕСТУ</span>
      <Typography component="h1" className="student-completion-title">{presentation.title}</Typography>
      <p className="student-completion-subtitle">{presentation.subtitle}</p>
      <p className="student-completion-test-title">{attempt.title}</p>
      {attempt.status === 'Expired' && <p className="student-completion-notice">
        <ScheduleRounded />Час тестування завершився. Усі збережені відповіді враховано.</p>}
      {score && <div className="student-result-summary">
        {presentation.band !== 'neutral' && attempt.percentage !== null && <div className="student-score-ring"> 
          <CircularProgress variant="determinate" value={100} aria-hidden="true" size={158} thickness={3.5} className="student-score-track" />
          <CircularProgress variant="determinate" value={Math.max(0, Math.min(100, attempt.percentage))} size={158} thickness={3.5} aria-label="Результат тесту" />
          <div>
            <strong>{attempt.percentage.toLocaleString('uk-UA', { maximumFractionDigits: 2 })}<small>%</small>
            </strong>
            <span>твій результат</span>
          </div>
        </div>}
        <div className="student-result-numbers">
          <div>
            <strong>{attempt.earnedPoints}<small> / {attempt.maximumPoints}</small>
            </strong>
            <span>Набрано балів</span>
          </div>{attempt.correctCount !== null && <div>
            <strong>{attempt.correctCount}<small> / {attempt.questions.length}</small>
            </strong>
            <span>Правильних відповідей</span>
          </div>}</div>
      </div>}
      {score && attempt.passed !== null && <span className={`student-result-outcome${attempt.passed ? ' is-passed' : ''}`}>{attempt.passed ? <TaskAltRounded /> : <LightbulbOutlined />}{attempt.passed ? 'Тест складено' : 'Тест не складено — ще трохи практики'}</span>}
      {!score && <p className="student-score-private">
        <ShieldOutlined />Результати доступні вчителю відповідно до налаштувань тесту.</p>}
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5} justifyContent="center" className="student-completion-actions">{onRepeat && <Button variant="contained" className="student-primary-button" onClick={onRepeat} endIcon={<ArrowForwardRounded />}>Нова спроба</Button>}<Button component={Link} to="/tests" variant={onRepeat ? 'outlined' : 'contained'} className={onRepeat ? 'student-secondary-button' : 'student-primary-button'}>До каталогу тестів</Button>
      </Stack>
    </section>
    {score && attempt.review.length > 0 && <details className="student-result-review">
      <summary>Розбір відповідей <span>{attempt.review.length} питань</span>
      </summary>
      <div className="student-review-list">{attempt.review.map((review, index) => {
        const question = attempt.questions.find(q => q.id === review.questionId)!; const answer = attempt.answers.find(a => a.questionId === question.id);
        return <article className="student-review-card" key={question.id}>
          <span className="student-eyebrow">ПИТАННЯ {index + 1}</span>
          <RichTestContent text={question.text} content={question.content} />
          <p className="student-small-label">Твоя відповідь</p>{!answer || (question.type === 'Text' ? !answer.text?.trim() : !answer.optionIds.length) ? <p>Без відповіді</p> : question.type === 'Text' ? <p>{answer.text}</p> : question.options.filter(o => answer.optionIds.includes(o.id)).map(o => <RichTestContent key={o.id} text={o.text} content={o.content} />)}<StudentFeedback question={question} review={review} />
        </article>;
      })}</div>
    </details>}
  </div>;
}



