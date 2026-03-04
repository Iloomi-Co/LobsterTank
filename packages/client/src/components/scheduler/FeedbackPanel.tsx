import { useState } from "react";
import { api } from "../../api/client.js";
import styles from "./FeedbackPanel.module.css";

const QUICK_CHIPS = ["Too verbose", "Too brief", "Missing details", "Wrong format"];

interface FeedbackPanelProps {
  scriptName: string;
  prompts: any[];
  lastOutputSnippet?: string | null;
  onFeedbackSubmitted: () => void;
  onRewriteRequested: (suggestion: string, heredocId?: string, lastOutput?: string) => void;
  helplessnessDetected?: boolean;
}

export function FeedbackPanel({ scriptName, prompts, lastOutputSnippet, onFeedbackSubmitted, onRewriteRequested, helplessnessDetected }: FeedbackPanelProps) {
  const [rating, setRating] = useState<"up" | "down" | null>(null);
  const [suggestion, setSuggestion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  if (prompts.length === 0) {
    return (
      <div className={styles.panel}>
        <span className={styles.noPrompt}>No extractable prompt found in this script</span>
      </div>
    );
  }

  const handleSubmit = async () => {
    if (!rating) return;
    setSubmitting(true);
    setStatus(null);

    const targetPrompt = prompts[0];
    const res = await api.schedulerSubmitFeedback({
      scriptName,
      rating,
      suggestion: suggestion.trim() || undefined,
      promptHash: targetPrompt?.id,
      heredocId: targetPrompt?.id,
      lastOutputSnippet: lastOutputSnippet ?? undefined,
    });

    setSubmitting(false);
    if (res.ok) {
      setStatus("Feedback saved");
      onFeedbackSubmitted();

      if (rating === "down" && suggestion.trim()) {
        onRewriteRequested(suggestion.trim(), targetPrompt?.id, lastOutputSnippet ?? undefined);
      }
    } else {
      setStatus(res.error ?? "Failed to save");
    }
  };

  const handleChip = (chip: string) => {
    setSuggestion((prev) => {
      const trimmed = prev.trim();
      return trimmed ? `${trimmed}. ${chip}` : chip;
    });
  };

  return (
    <div className={styles.panel}>
      {lastOutputSnippet && (
        <div className={styles.lastOutput}>
          <span className={styles.lastOutputLabel}>Last output:</span>
          <pre className={styles.lastOutputPre}>{lastOutputSnippet}</pre>
        </div>
      )}

      <div className={styles.ratingRow}>
        <span className={styles.label}>Last Run:</span>
        <button
          className={rating === "up" ? styles.ratingBtnActive : styles.ratingBtn}
          onClick={() => setRating("up")}
          title="Thumbs up"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8.834 1.4a.5.5 0 0 0-.486-.4h-.166a1.5 1.5 0 0 0-1.466 1.184L6.2 4.8H3.5A1.5 1.5 0 0 0 2 6.3v5.2A1.5 1.5 0 0 0 3.5 13h9a1.5 1.5 0 0 0 1.46-1.155l1-4.346A1.5 1.5 0 0 0 13.5 5.8H9.6l.734-2.932a1.5 1.5 0 0 0-.5-1.468L8.834 1.4z"/></svg>
        </button>
        <button
          className={rating === "down" ? styles.ratingBtnActiveDown : styles.ratingBtn}
          onClick={() => setRating("down")}
          title="Thumbs down"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M7.166 14.6a.5.5 0 0 0 .486.4h.166a1.5 1.5 0 0 0 1.466-1.184L9.8 11.2h2.7a1.5 1.5 0 0 0 1.5-1.5V4.5A1.5 1.5 0 0 0 12.5 3h-9a1.5 1.5 0 0 0-1.46 1.155l-1 4.346A1.5 1.5 0 0 0 2.5 10.2h3.9l-.734 2.932a1.5 1.5 0 0 0 .5 1.468l1 .868z"/></svg>
        </button>
      </div>

      {rating === "down" && (
        <div className={styles.suggestionArea}>
          <div className={styles.chipRow}>
            {QUICK_CHIPS.map((chip) => (
              <button key={chip} className={styles.chip} onClick={() => handleChip(chip)}>
                {chip}
              </button>
            ))}
          </div>
          <textarea
            className={styles.textarea}
            placeholder="How should the prompt be improved?"
            value={suggestion}
            onChange={(e) => setSuggestion(e.target.value)}
          />
        </div>
      )}

      {rating && (
        <div className={styles.submitRow}>
          <button
            className={styles.submitBtn}
            onClick={handleSubmit}
            disabled={submitting || (rating === "down" && !suggestion.trim())}
          >
            {submitting ? "Submitting..." : "Submit Feedback"}
          </button>
          {status && (
            <span className={`${styles.status} ${status === "Feedback saved" ? styles.statusOk : ""}`}>
              {status}
            </span>
          )}
        </div>
      )}

      {helplessnessDetected && rating === "down" && status === "Feedback saved" && (
        <div className={styles.helplessnessHint}>
          Learned helplessness was detected for this script. The agent may be stuck on a resolved issue.
          Consider using &ldquo;Force New Session&rdquo; from the scheduler view.
        </div>
      )}
    </div>
  );
}
