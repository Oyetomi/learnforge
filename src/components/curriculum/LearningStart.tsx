import React, { useEffect, useRef, useState } from "react";
import { ArrowRight, BookOpen, Camera, MessageCircle, Paperclip, Percent } from "lucide-react";
import { GOAL_DRAFT_EVENT, loadGoalDraft, saveGoalDraft } from "../../services/learning/goalDraft";
import "./learning-start.css";

// Editable prompt examples, never courses or saved topics.
const examples = [
  { label: "Everyday maths", prompt: "Understand discounts and percentages", icon: Percent },
  { label: "Communication", prompt: "Get better at explaining my ideas", icon: MessageCircle },
  { label: "A creative skill", prompt: "Learn to take better photographs", icon: Camera },
];

export function LearningStart({ onStart, onManageRemoved }: {
  onStart: (goal: string, material?: boolean) => void;
  onManageRemoved?: () => void;
}) {
  const [goal, setGoal] = useState(() => loadGoalDraft().interest || "");
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const sync = () => setGoal(loadGoalDraft().interest || "");
    window.addEventListener(GOAL_DRAFT_EVENT, sync);
    return () => window.removeEventListener(GOAL_DRAFT_EVENT, sync);
  }, []);
  const edit = (value: string) => { setGoal(value); saveGoalDraft({ interest: value }); };
  const submit = () => { if (goal.trim()) onStart(goal.trim()); };

  return <section className="learning-start" aria-labelledby="learning-start-title">
    <header className="learning-start-heading">
      <span className="learning-start-eyebrow"><BookOpen size={16} aria-hidden="true" /> A little curiosity goes a long way</span>
      <h1 id="learning-start-title">What do you want to learn?</h1>
      <p>An everyday question, a new skill, or a subject you want to understand better.</p>
    </header>

    <form className="learning-start-prompt" onSubmit={e => { e.preventDefault(); submit(); }}>
      <label htmlFor="start-learning-goal">Start with a goal</label>
      <textarea ref={input} id="start-learning-goal" value={goal} maxLength={400} rows={3}
        placeholder="I want to understand…" aria-describedby="learning-start-next"
        onChange={e => edit(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
            e.preventDefault(); submit();
          }
        }} />
      <div className="learning-start-prompt-actions">
        <button type="button" className="learning-start-material" onClick={() => onStart(goal, true)}>
          <Paperclip size={15} aria-hidden="true" /> Add notes or a file
        </button>
        <button type="submit" className="dialog-primary-button" disabled={!goal.trim()}>
          Continue <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
    </form>
    <p id="learning-start-next" className="learning-start-next">You’ll review your goal and starting point before learning begins.</p>

    <div className="learning-start-examples" aria-labelledby="learning-start-examples-title">
      <p id="learning-start-examples-title">Need a starting point? Make one of these your own.</p>
      <div className="learning-start-example-list">
        {examples.map(({ label, prompt, icon: Icon }) => <button type="button" key={label}
          onClick={() => { edit(prompt); input.current?.focus(); }}>
          <span className="learning-start-example-label"><Icon size={15} aria-hidden="true" /> {label}</span>
          <span className="learning-start-example-prompt">{prompt}<ArrowRight size={14} aria-hidden="true" /></span>
        </button>)}
      </div>
    </div>

    <ol className="learning-start-process" aria-label="How your session works">
      <li><span>01</span> A plan you review</li>
      <li><span>02</span> Examples that make it click</li>
      <li><span>03</span> Practice shaped by your answers</li>
    </ol>
    {onManageRemoved && <button type="button" className="learning-start-cleanup" onClick={onManageRemoved}>Clear previously removed topics</button>}
  </section>;
}
