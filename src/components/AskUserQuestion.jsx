import { Check } from 'lucide-react'

// Claude AskUserQuestion 式问答卡：问题 + 单选选项，点选即作答
export default function AskUserQuestion({ questions = [], onAnswer }) {
  return (
    <div className="space-y-3">
      {questions.map((q, i) => {
        const answered = !!q.answer
        return (
          <div
            key={q.id}
            className={`rounded-btn border p-3 transition-colors duration-[180ms] ${
              answered ? 'border-ok-soft bg-ok-soft/50' : 'border-warn-soft bg-warn-soft/40'
            }`}
          >
            <div className="flex items-start gap-2">
              <span className={`badge ${answered ? 'badge-ok' : 'badge-warn'} !py-0.5 !text-xs`}>
                检查点 {i + 1}
              </span>
              <span className="min-w-0 flex-1 text-sm font-medium leading-snug text-ink">{q.q}</span>
            </div>
            <div className="mt-2.5 space-y-1.5">
              {q.options.map((opt) => {
                const on = q.answer === opt
                return (
                  <button
                    key={opt}
                    onClick={() => onAnswer(q.id, opt)}
                    className={`flex w-full items-center gap-2.5 rounded-btn border px-3 py-2 text-left text-sm transition-all duration-[180ms] ${
                      on
                        ? 'border-brand bg-brand-soft font-medium text-brand-deep'
                        : 'border-line bg-panel text-ink hover:border-brand-line2 hover:bg-brand-soft/60'
                    }`}
                  >
                    <span
                      className={`flex size-[15px] flex-none items-center justify-center rounded-full border-2 transition-all duration-[180ms] ${
                        on ? 'border-brand bg-brand' : 'border-mute'
                      }`}
                    >
                      {on && <Check size={9} strokeWidth={3.5} className="text-white" />}
                    </span>
                    {opt}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
