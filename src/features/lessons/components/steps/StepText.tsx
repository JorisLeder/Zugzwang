import { cn } from '@/lib/cn';

/** Lesson text: paragraphs separated by blank lines, single line breaks kept. */
export function StepText({ text, className }: { text: string; className?: string }) {
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim() !== '');
  return (
    <div className={cn('flex flex-col gap-3 text-body-lg text-text', className)} data-testid="step-text">
      {paragraphs.map((p, i) => (
        <p key={i} className="whitespace-pre-line">
          {p}
        </p>
      ))}
    </div>
  );
}
