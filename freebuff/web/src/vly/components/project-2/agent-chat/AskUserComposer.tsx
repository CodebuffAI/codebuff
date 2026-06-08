"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader } from "lucide-react";
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const questionsKey = useMemo(() => JSON.stringify(questions), [questions]);

  useEffect(() => {
    setQuestionIndex(0);
    setAnswers({});
    setIsSubmitting(false);
  }, [questionsKey]);

  const question = questions[questionIndex];
  if (!question) return null;

  const answer = answers[questionIndex] ?? { selected: [], custom: "" };
  const hasAnswer = answer.selected.length > 0 || !!answer.custom.trim();
  const isLastQuestion = questionIndex === questions.length - 1;

  const updateAnswer = (next: Partial<AskUserAnswer>) => {
    setAnswers((current) => ({
      ...current,
      [questionIndex]: {
        selected: current[questionIndex]?.selected ?? [],
        custom: current[questionIndex]?.custom ?? "",
        ...next,
      },
    }));
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

  const handleContinue = async () => {
    if (!hasAnswer || isSubmitting) return;
    if (!isLastQuestion) {
      setQuestionIndex((current) => current + 1);
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(formatAskUserResumeMessage(questions, answers));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit("Use reasonable defaults and continue.");
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

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
        {question.options.map((option) => {
          const selected = answer.selected.includes(option.label);
          return (
            <button
              key={option.label}
              type="button"
              title={option.description}
              disabled={isSubmitting}
              onClick={() => toggleOption(option.label)}
              className={cn(
                "group flex min-h-8 items-center rounded-full px-2.5 text-left text-sm transition-colors",
                selected
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-background/50 hover:text-foreground",
              )}
            >
              <span className="whitespace-nowrap">{option.label}</span>
              {option.description && (
                <span className="max-w-0 overflow-hidden whitespace-nowrap pl-0 text-xs opacity-0 transition-all duration-200 group-hover:max-w-80 group-hover:pl-2 group-hover:opacity-60">
                  {option.description}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex items-end gap-2">
        <input
          value={answer.custom}
          disabled={isSubmitting}
          onChange={(event) => updateAnswer({ custom: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Enter") void handleContinue();
          }}
          placeholder="Or type an answer"
          autoFocus
          className="h-9 min-w-0 flex-1 border-0 border-b border-border/50 bg-transparent px-1 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary/70"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isSubmitting}
          onClick={handleSkip}
          className="text-muted-foreground"
        >
          Skip
        </Button>
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
