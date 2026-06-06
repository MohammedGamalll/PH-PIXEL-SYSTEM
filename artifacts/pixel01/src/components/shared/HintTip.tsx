import { HelpCircle } from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Inline help icon with a tooltip. Use next to labels/buttons to provide
 * short usage hints without cluttering the UI.
 */
export function HintTip({ text, className }: { text: string; className?: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={"inline-flex items-center justify-center align-middle ms-1 cursor-help " + (className ?? "")}
            tabIndex={0}
            aria-label={text}
          >
            <HelpCircle className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed" dir="rtl">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
