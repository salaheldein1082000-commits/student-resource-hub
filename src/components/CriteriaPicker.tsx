import { useQuery } from "@tanstack/react-query";
import { criteriaQuery } from "@/lib/data";
import { cn } from "@/lib/utils";

export function CriteriaPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { data: criteria = [] } = useQuery(criteriaQuery);
  return (
    <div className="flex flex-wrap gap-1.5">
      {criteria.map((c) => {
        const on = value.includes(c.code);
        return (
          <button
            type="button"
            key={c.code}
            title={c.description}
            onClick={() => onChange(on ? value.filter((x) => x !== c.code) : [...value, c.code])}
            className={cn(
              "rounded-md border px-2 py-1 font-mono text-xs transition",
              on ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary",
            )}
          >
            {c.code}
          </button>
        );
      })}
    </div>
  );
}
