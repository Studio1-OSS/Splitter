"use client";

import { ArrowUp, Sparkles } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { RichText } from "@/components/ui/rich-text";

type Turn = { q: string; a?: string; error?: string };

/** Members ask questions about their group's money; the AI answers from that group's ledger only. */
export function AskSplitter({ groupId, suggestions, enabled }: { groupId: string; suggestions: string[]; enabled: boolean }) {
  const [question, setQuestion] = React.useState("");
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [pending, setPending] = React.useState(false);

  async function ask(q: string) {
    const text = q.trim();
    if (text.length < 3 || pending) return;
    setQuestion("");
    setPending(true);
    setTurns((t) => [...t, { q: text }]);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, question: text }),
      });
      const body = (await res.json().catch(() => ({}))) as { answer?: string; error?: string };
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, a: body.answer, error: res.ok ? undefined : (body.error ?? "Couldn't answer") } : x)));
    } catch {
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, error: "Couldn't reach Splitter" } : x)));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="grid gap-4 rounded-lg bg-[#17171c] p-5 text-white sm:p-7">
      <div>
        <p className="eyebrow flex items-center gap-2 text-white/60">
          <Sparkles className="size-3.5 text-[#ffad9b]" /> Ask Splitter
        </p>
        <p className="mt-2 font-display text-2xl">Confused about a number? Ask.</p>
        <p className="mt-1 text-sm text-white/60">Answers come only from this group&apos;s expenses, notes and payments.</p>
      </div>

      {turns.length > 0 && (
        <ul className="grid gap-4" aria-live="polite">
          {turns.map((t, i) => (
            <li key={i} className="grid gap-2">
              <p className="justify-self-end rounded-md rounded-br-xs bg-white/10 px-3.5 py-2 text-sm">{t.q}</p>
              {t.a ? (
                <RichText text={t.a} className="answer text-sm leading-relaxed text-white/85" />
              ) : t.error ? (
                <p className="text-sm text-[#ff9d86]">{t.error}</p>
              ) : (
                <p className="flex gap-1 py-2" aria-label="Thinking">
                  {[0, 1, 2].map((d) => (
                    <span key={d} className="size-1.5 animate-bounce rounded-full bg-white/60" style={{ animationDelay: `${d * 120}ms` }} />
                  ))}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {turns.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              disabled={!enabled}
              onClick={() => ask(s)}
              className="h-10 rounded-full border border-white/20 px-3.5 text-left text-sm text-white/80 hover:border-white/50 disabled:opacity-40"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
        className="flex gap-2"
      >
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={enabled ? "e.g. Why do I owe this much?" : "AI isn't configured on this server"}
          disabled={!enabled}
          maxLength={500}
          aria-label="Your question"
          className="border-white/20 bg-white/5 text-white placeholder:text-white/40"
        />
        <Button type="submit" variant="inverse" size="icon" aria-label="Ask" disabled={!enabled || pending || question.trim().length < 3} className="h-12 w-12 shrink-0 md:h-11 md:w-11">
          <ArrowUp />
        </Button>
      </form>
    </section>
  );
}
