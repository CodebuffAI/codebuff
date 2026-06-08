"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Loader } from "lucide-react";
import { Button } from "@/vly/components/ui/button";
import { cn } from "@/vly/lib/utils";
import {
  formatAskUserResumeMessage,
  type AskUserAnswer,
  type AskUserQuestion,
} from "./AgentChatMessages";

interface AskUserComposerProps {
  questions: AskUserQuestion[];
  onSubmit: (message: string) => Promise<boolean>;
}

export function AskUserComposer({
  questions,
  onSubmit,
}: AskUserComposerProps) {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, AskUserAnswer>>({});
  const answersRef = useRef<Record<number, AskUserAnswer>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Expanded descriptions, keyed by `${questionIndex}:${label}` so each
  // question tracks its own expansions. Toggled explicitly by click (no hover).
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const questionsKey = useMemo(() => JSON.stringify(questions), [questions]);

  useEffect(() => {
    setQuestionIndex(0);
    setAnswers({});
    answersRef.current = {};
    setExpanded({});
    setIsSubmitting(false);
  }, [questionsKey]);

  const question = questions[questionIndex];
  if (!question) return null;

  const answer = answers[questionIndex] ?? { selected: [], custom: "" };
  const hasAnswer = answer.selected.length > 0 || !!answer.custom.trim();
  const isLastQuestion = questionIndex === questions.length - 1;

  const commitAnswers = (nextAnswers: Record<number, AskUserAnswer>) => {
    answersRef.current = nextAnswers;
    setAnswers(nextAnswers);
  };

  const updateAnswer = (next: Partial<AskUserAnswer>) => {
    setAnswers((current) => ({
      ...current,
      [questionIndex]: {
        selected: current[questionIndex]?.selected ?? [],
        custom: current[questionIndex]?.custom ?? "",
        ...next,
      },
    }));
    answersRef.current = {
      ...answersRef.current,
      [questionIndex]: {
        selected: answersRef.current[questionIndex]?.selected ?? [],
        custom: answersRef.current[questionIndex]?.custom ?? "",
        ...next,
      },
    };
  };

  const toggleOption = (label: string) => {
    if (question.multiSelect) {
      updateAnswer({
        selected: answer.selected.includes(label)
          ? answer.selected.filter((value) => value !== label)
          : [...answer.selected, label],
      });
    } else {
      updateAnswer({ selected: [label] });
    }
  };

  const isExpanded = (label: string) =>
    !!expanded[`${questionIndex}:${label}`];

  const toggleExpanded = (label: string) => {
    const key = `${questionIndex}:${label}`;
    setExpanded((current) => ({ ...current, [key]: !current[key] }));
  };

  const handleContinue = async () => {
    const currentAnswer = answersRef.current[questionIndex] ?? answer;
    const hasCurrentAnswer =
      currentAnswer.selected.length > 0 || !!currentAnswer.custom.trim();
    if (!hasCurrentAnswer || isSubmitting) return;

    const nextAnswers = {
      ...answersRef.current,
      [questionIndex]: currentAnswer,
    };
    commitAnswers(nextAnswers);

    if (!isLastQuestion) {
      setQuestionIndex((current) => current + 1);
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(formatAskUserResumeMessage(questions, nextAnswers));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = async () => {
    if (isSubmitting) return;
    const currentAnswer = answersRef.current[questionIndex] ?? answer;
    const hasCurrentAnswer =
      currentAnswer.selected.length > 0 || !!currentAnswer.custom.trim();

    // If the user has already selected or typed something, "Skip" should not
    // discard it. Treat the click like Continue so selected options are sent.
    if (hasCurrentAnswer) {
      await handleContinue();
      return;
    }

    const nextAnswers = {
      ...answersRef.current,
      [questionIndex]: { selected: [], custom: "" },
    };
    commitAnswers(nextAnswers);

    if (!isLastQuestion) {
      setQuestionIndex((current) => current + 1);
      return;
    }

    setIsSubmitting(true);
    try {
      const hasAnyAnswer = Object.values(nextAnswers).some(
        (value) => value.selected.length > 0 || !!value.custom.trim(),
      );
      await onSubmit(
        hasAnyAnswer
          ? formatAskUserResumeMessage(questions, nextAnswers)
          : "Use reasonable defaults and continue.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-4 mb-4 rounded-2xl bg-muted/55 px-4 py-3 shadow-lg shadow-black/10 backdrop-blur">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>
          {questionIndex + 1} of {questions.length}
        </span>
        {question.header && <span>· {question.header}</span>}
      </div>

      <p className="mt-1 text-sm font-medium text-foreground">
        {question.question}
      </p>

      <div className="mt-3 flex flex-col gap-1.5">
        {question.options.map((option) => {
          const selected = answer.selected.includes(option.label);
          const hasDescription = !!option.description?.trim();
          const optionExpanded = hasDescription && isExpanded(option.label);
          return (
            <div
              key={option.label}
              className={cn(
                "rounded-lg border text-left",
                selected
                  ? "border-primary/50 bg-primary/10"
                  : "border-border/40 bg-background/30",
              )}
            >
              <div className="flex items-start gap-2 px-3 py-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => toggleOption(option.label)}
                  aria-pressed={selected}
                  className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border",
                      question.multiSelect ? "rounded" : "rounded-full",
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border/70",
                    )}
                  >
                    {selected && <Check className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="shrink-0 text-sm font-medium text-foreground">
                        {option.label}
                      </span>
                      {hasDescription && !optionExpanded && (
                        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      )}
                    </span>
                    {optionExpanded && (
                      <span className="mt-1 block whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                        {option.description}
                      </span>
                    )}
                  </span>
                </button>
                {hasDescription && (
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => toggleExpanded(option.label)}
                    aria-label={optionExpanded ? "Show less" : "Learn more"}
                    aria-expanded={optionExpanded}
                    className="-mr-1 mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 transition-transform",
                        optionExpanded && "rotate-180",
                      )}
                    />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-end gap-2">
        <input
          value={answer.custom}
          disabled={isSubmitting}
          onChange={(event) => updateAnswer({ custom: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Enter") void handleContinue();
          }}
          placeholder="Or type an answer"
          className="h-9 min-w-0 flex-1 border-0 border-b border-border/50 bg-transparent px-1 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary/70"
        />
        {!hasAnswer && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isSubmitting}
            onClick={handleSkip}
            className="text-muted-foreground"
          >
            Use default
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          disabled={!hasAnswer || isSubmitting}
          onClick={handleContinue}
          className="rounded-full px-4"
        >
          {isSubmitting && <Loader className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          {isLastQuestion ? "Continue" : "Next"}
        </Button>
      </div>
    </div>
  );
}
